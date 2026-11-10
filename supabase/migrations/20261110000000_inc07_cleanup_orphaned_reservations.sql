-- =============================================================================
-- Migración INC-07: Procedimiento Seguro de Detección y Limpieza de Huérfanos
-- Fecha: 2026-11-10
-- Contexto: Post-QA CAM-10 / CAM-12
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cleanup_orphaned_upload_reservations(
  p_dry_run boolean DEFAULT true,
  p_grace_interval interval DEFAULT interval '1 hour'
)
RETURNS TABLE (
  archivo_id uuid,
  reservation_id uuid,
  nombre_original text,
  size_bytes bigint,
  estado_archivo text,
  estado_reserva text,
  created_at timestamptz,
  expires_at timestamptz,
  motivo text,
  accion text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cutoff timestamptz := clock_timestamp() - p_grace_interval;
BEGIN
  -- Crear tabla temporal para registrar candidatos evaluados
  CREATE TEMP TABLE IF NOT EXISTS _candidates_cleanup (
    archivo_id uuid,
    reservation_id uuid,
    nombre_original text,
    size_bytes bigint,
    estado_archivo text,
    estado_reserva text,
    created_at timestamptz,
    expires_at timestamptz,
    motivo text,
    accion text
  ) ON COMMIT DROP;

  DELETE FROM _candidates_cleanup;

  -- 1. Candidatos Tipo A: Huérfanos puros en 'archivos' sin fila en 'upload_reservations'
  --    originados por fallos en la inserción de reserva tras registrar el archivo.
  INSERT INTO _candidates_cleanup (
    archivo_id, reservation_id, nombre_original, size_bytes,
    estado_archivo, estado_reserva, created_at, expires_at, motivo, accion
  )
  SELECT
    a.id,
    NULL::uuid,
    a.nombre_original,
    a.size_bytes,
    a.estado,
    NULL::text,
    a.created_at,
    NULL::timestamptz,
    'Huérfano puro: archivo reserved sin reserva asociada y fuera de la ventana de gracia de ' || p_grace_interval::text,
    CASE WHEN p_dry_run THEN 'SIMULACIÓN: CANDIDATO A ELIMINACIÓN' ELSE 'ELIMINADO EFECTIVAMENTE' END
  FROM public.archivos a
  WHERE a.contexto = 'solicitud'
    AND a.estado = 'reserved'
    AND a.created_at < v_cutoff
    AND NOT EXISTS (
      SELECT 1 FROM public.upload_reservations ur WHERE ur.archivo_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.archivo_pedido ap WHERE ap.archivo_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.entrega_archivos ea WHERE ea.archivo_id = a.id
    );

  -- 2. Candidatos Tipo B: Reservas abandonadas/incompletas expiradas con ventana de gracia cumplida
  INSERT INTO _candidates_cleanup (
    archivo_id, reservation_id, nombre_original, size_bytes,
    estado_archivo, estado_reserva, created_at, expires_at, motivo, accion
  )
  SELECT
    a.id,
    ur.id,
    a.nombre_original,
    a.size_bytes,
    a.estado,
    ur.state,
    a.created_at,
    ur.expires_at,
    'Reserva expirada: subida incompleta (estado: ' || ur.state || ') expirada antes de ' || v_cutoff::text,
    CASE WHEN p_dry_run THEN 'SIMULACIÓN: CANDIDATO A ELIMINACIÓN' ELSE 'ELIMINADO EFECTIVAMENTE' END
  FROM public.upload_reservations ur
  JOIN public.archivos a ON ur.archivo_id = a.id
  WHERE a.contexto = 'solicitud'
    AND a.estado = 'reserved'
    AND ur.state IN ('pending', 'uploading', 'failed')
    AND ur.expires_at < v_cutoff
    AND (
      ur.session_id IS NULL OR EXISTS (
        SELECT 1 FROM public.submission_sessions ss
        WHERE ss.id = ur.session_id
          AND (ss.estado != 'abierta' OR ss.expires_at < v_cutoff)
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.archivo_pedido ap WHERE ap.archivo_id = a.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.entrega_archivos ea WHERE ea.archivo_id = a.id
    );

  -- 3. Si NO es dry-run, ejecutar eliminaciones atómicas seguras
  IF NOT p_dry_run THEN
    -- Eliminar primero las reservas candidatas
    DELETE FROM public.upload_reservations
    WHERE id IN (
      SELECT c.reservation_id FROM _candidates_cleanup c WHERE c.reservation_id IS NOT NULL
    );

    -- Eliminar los archivos candidatos
    DELETE FROM public.archivos
    WHERE id IN (
      SELECT c.archivo_id FROM _candidates_cleanup c
    );
  END IF;

  -- 4. Retornar el detalle de candidatos evaluados
  RETURN QUERY
  SELECT * FROM _candidates_cleanup ORDER BY created_at ASC;
END;
$$;

COMMENT ON FUNCTION public.cleanup_orphaned_upload_reservations(boolean, interval) IS
  'Detecta y simula (o ejecuta con p_dry_run=false) la limpieza de archivos reservados huérfanos o con reservas expiradas fuera de la ventana de gracia, garantizando que jamás se toquen archivos verificados o adjuntos a pedidos/entregas.';

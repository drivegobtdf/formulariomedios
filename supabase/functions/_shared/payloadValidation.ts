/**
 * Módulo de validación server-side de payloads para Edge Functions de PEDIDOS.
 * Proyecto: PEDIDOS — Secretaría de Medios (Revisión 3.0)
 */

export const DEFAULT_PAST_DATE_ERROR_MESSAGE = 'La fecha no puede ser anterior a hoy.';

/**
 * Obtiene la fecha civil en formato YYYY-MM-DD.
 * Por defecto utiliza la zona horaria oficial del sistema (America/Argentina/Ushuaia, UTC-3)
 * para garantizar comparación estricta sin desfasajes de UTC.
 */
export function getCivilDateString(
  refDate: Date = new Date(),
  timeZone = 'America/Argentina/Ushuaia'
): string {
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(refDate);
  } catch {
    // Fallback en caso de entorno sin soporte de Intl timezone
    const year = refDate.getFullYear();
    const month = String(refDate.getMonth() + 1).padStart(2, '0');
    const day = String(refDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}

export interface OperationalDateFieldRule {
  categoria_slug: string;
  tipo_slug?: string;
  field_name: string;
  label: string;
  condition?: (info: Record<string, unknown>) => boolean;
}

/**
 * Matriz de los 9 campos de fecha operativos en nuevas presentaciones públicas.
 */
export const OPERATIONAL_DATE_RULES: OperationalDateFieldRule[] = [
  // 1. Diseño Gráfico -> Flyer
  {
    categoria_slug: 'diseno_grafico',
    tipo_slug: 'flyer_rrss',
    field_name: 'fecha_limite',
    label: 'Fecha límite requerida (Flyer)',
  },
  // 2. Diseño Gráfico -> Invitación digital
  {
    categoria_slug: 'diseno_grafico',
    tipo_slug: 'invitacion_digital',
    field_name: 'fecha',
    label: 'Fecha del evento (Invitación digital)',
  },
  // 3. Cobertura de Eventos
  {
    categoria_slug: 'cobertura_eventos',
    field_name: 'fecha',
    label: 'Fecha del evento (Cobertura de eventos)',
  },
  // 4. Publicaciones en Redes Sociales
  {
    categoria_slug: 'redes_sociales',
    field_name: 'fecha_sugerida',
    label: 'Fecha sugerida de publicación (Redes sociales)',
  },
  // 5. Producción Audiovisual -> Fecha límite
  {
    categoria_slug: 'produccion_audiovisual',
    field_name: 'fecha_limite',
    label: 'Fecha límite de entrega (Producción audiovisual)',
    condition: (info) => !info.requiere_asesoramiento,
  },
  // 6. Producción Audiovisual -> Grabación
  {
    categoria_slug: 'produccion_audiovisual',
    field_name: 'grabacion_fecha',
    label: 'Fecha de grabación (Producción audiovisual)',
    condition: (info) => !info.requiere_asesoramiento && Boolean(info.requiere_grabacion),
  },
  // 7. Animación y Motion Graphics -> Fecha límite
  {
    categoria_slug: 'motion_graphics',
    field_name: 'fecha_limite',
    label: 'Fecha límite de entrega (Motion graphics)',
    condition: (info) => !info.requiere_asesoramiento,
  },
  // 8. Transmisión en Vivo / Streaming -> Fecha
  {
    categoria_slug: 'streaming',
    field_name: 'fecha',
    label: 'Fecha de la transmisión (Streaming)',
    condition: (info) => !info.requiere_asesoramiento,
  },
  // 9. Sitios y Contenidos Web -> Fecha límite
  {
    categoria_slug: 'sitios_web',
    field_name: 'fecha_limite',
    label: 'Fecha límite de publicación (Sitios web)',
    condition: (info) => !info.requiere_asesoramiento,
  },
];

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  field?: string;
}

/**
 * Valida centralizadamente que ninguna fecha operativa de los pedidos en el payload
 * sea anterior a la fecha civil de hoy.
 */
export function validateSubmissionPayloadDates(
  payload: unknown,
  refDate: Date = new Date(),
  timeZone = 'America/Argentina/Ushuaia'
): ValidationResult {
  if (!payload || typeof payload !== 'object') {
    return { isValid: true };
  }

  const data = payload as Record<string, unknown>;
  if (!Array.isArray(data.pedidos)) {
    return { isValid: true };
  }

  const todayStr = getCivilDateString(refDate, timeZone);

  for (let i = 0; i < data.pedidos.length; i++) {
    const pedido = data.pedidos[i];
    if (!pedido || typeof pedido !== 'object') continue;

    const ped = pedido as Record<string, unknown>;
    const catSlug = String(ped.categoria_slug || '').trim();
    const tipoSlug = String(ped.tipo_slug || '').trim();
    const info = (ped.informacion_especifica && typeof ped.informacion_especifica === 'object'
      ? ped.informacion_especifica
      : {}) as Record<string, unknown>;

    for (const rule of OPERATIONAL_DATE_RULES) {
      if (rule.categoria_slug === catSlug) {
        if (!rule.tipo_slug || rule.tipo_slug === tipoSlug) {
          if (!rule.condition || rule.condition(info)) {
            const rawValue = info[rule.field_name];
            if (typeof rawValue === 'string' && rawValue.trim().length > 0) {
              const val = rawValue.trim();
              if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
                if (val < todayStr) {
                  return {
                    isValid: false,
                    field: `${catSlug}.${rule.field_name}`,
                    error: `VALIDATION_ERROR: ${DEFAULT_PAST_DATE_ERROR_MESSAGE} Campo: ${rule.label} (${val} < ${todayStr})`,
                  };
                }
              }
            }
          }
        }
      }
    }
  }

  return { isValid: true };
}

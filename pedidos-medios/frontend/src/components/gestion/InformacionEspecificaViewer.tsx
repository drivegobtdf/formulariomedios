import React from 'react';
import { formatLocalDate } from '../../utils/formatUtils';

interface InformacionEspecificaViewerProps {
  informacion?: Record<string, any>;
  informacionEspecifica?: Record<string, any>;
  codigoCategoria?: string;
  categoriaNombre?: string;
  tipoNombre?: string;
}

const FIELD_LABELS: Record<string, string> = {
  formato: 'Formato',
  texto: 'Texto y contenido solicitado',
  fecha_limite: 'Fecha límite requerida',
  nombre_evento: 'Nombre del evento',
  fecha: 'Fecha',
  hora: 'Hora',
  hora_inicio: 'Hora de inicio',
  hora_fin: 'Hora de finalización',
  lugar: 'Lugar / Ubicación',
  ciudad: 'Ciudad',
  modalidad: 'Modalidad',
  programa: 'Programa / Cronograma',
  nombre_actividad: 'Nombre de la actividad',
  firmantes: 'Autoridades firmantes',
  destinatarios: 'Lista de destinatarios',
  descripcion: 'Descripción del requerimiento',
  descripcion_objetivo: 'Objetivo y descripción',
  descripcion_requerimientos: 'Requerimientos técnicos',
  medidas_soporte: 'Medidas o soporte técnico',
  referente_contacto: 'Referente de contacto',
  telefono_contacto: 'Teléfono de contacto',
  informacion_base: 'Información base',
  fecha_sugerida: 'Fecha sugerida de publicación',
  texto_copy: 'Texto de publicación (Copy)',
  enlaces_referencia: 'Enlaces de referencia',
  material_enlace: 'Material o enlace de insumos',
  tipo_produccion: 'Tipo de producción',
  tipo_motion: 'Tipo de animación',
  tipo_streaming: 'Tipo de streaming',
  tipo_web: 'Tipo de desarrollo web',
  duracion_aprox: 'Duración aproximada',
  participantes_estimados: 'Participantes estimados',
  pagina_existente: '¿Página existente?',
  url_pagina: 'URL de la página',
  contenido_cambios: 'Cambios o contenidos a incorporar',
  requiere_grabacion: '¿Requiere grabación presencial?',
  grabacion_fecha: 'Fecha de grabación',
  grabacion_hora: 'Hora de grabación',
  grabacion_lugar: 'Lugar de grabación',
  grabacion_ciudad: 'Ciudad de grabación',
  referencias: 'Referencias visuales o de estilo',
};

const IGNORED_KEYS = new Set([
  'requiere_asesoramiento',
  'objetivo_asesoramiento',
  'requerimiento_inicial',
  'contacto_preferido',
  'schema_version',
  'client_request_ref',
  'submission_key',
  'categoria_slug',
  'tipo_slug',
]);

function formatFieldValue(key: string, val: any): React.ReactNode {
  if (val === null || val === undefined || val === '') {
    return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>No especificado</span>;
  }

  if (typeof val === 'boolean') {
    return (
      <span style={{ fontWeight: 600, color: val ? '#15803d' : '#475569' }}>
        {val ? 'Sí' : 'No'}
      </span>
    );
  }

  if (key === 'fecha_limite' || key === 'fecha' || key === 'fecha_sugerida' || key === 'grabacion_fecha') {
    return <span>{formatLocalDate(String(val))}</span>;
  }

  if (typeof val === 'string') {
    const isUrl = /^https?:\/\//i.test(val.trim());
    if (isUrl) {
      return (
        <a
          href={val.trim()}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: '#0284c7', textDecoration: 'underline', wordBreak: 'break-all' }}
        >
          {val.trim()}
        </a>
      );
    }

    return (
      <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#1e293b' }}>
        {val}
      </div>
    );
  }

  if (Array.isArray(val)) {
    if (val.length === 0) {
      return <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Lista vacía</span>;
    }
    return (
      <ul style={{ margin: '0.25rem 0 0 1.25rem', padding: 0, color: '#1e293b' }}>
        {val.map((item, idx) => (
          <li key={idx} style={{ marginBottom: '0.25rem' }}>
            {typeof item === 'object' ? JSON.stringify(item) : String(item)}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof val === 'object') {
    return (
      <div style={{ background: '#f8fafc', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', border: '1px solid #e2e8f0', marginTop: '0.25rem' }}>
        {Object.entries(val).map(([nestedKey, nestedVal]) => (
          <div key={nestedKey} style={{ marginBottom: '0.35rem', fontSize: '0.85rem' }}>
            <strong style={{ color: '#475569' }}>{FIELD_LABELS[nestedKey] || nestedKey.replace(/_/g, ' ')}:</strong>{' '}
            {formatFieldValue(nestedKey, nestedVal)}
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(val)}</span>;
}

export function getGestionFieldLabel(
  key: string,
  info: Record<string, any>,
  codigoCategoria?: string,
  tipoNombre?: string
): string {
  const isDiseno =
    codigoCategoria === 'D' ||
    info.categoria_slug === 'diseno_grafico' ||
    info.tipo_slug === 'flyer_rrss' ||
    info.tipo_slug === 'invitacion_digital' ||
    info.tipo_slug === 'certificado' ||
    info.tipo_slug === 'otros_diseno' ||
    (tipoNombre && /flyer|invitación|certificado|diseño/i.test(tipoNombre));

  if (isDiseno) {
    if (key === 'fecha_limite' || key === 'fecha') return 'Fecha del evento/actividad/pieza';
    if (key === 'programa' || key === 'destinatarios' || key === 'especificaciones')
      return 'Especificaciones del pedido';
    if (key === 'texto') return 'Texto y contenido solicitado';
    if (key === 'descripcion') return 'Descripción de la pieza gráfica';
    if (key === 'medidas_soporte') return 'Medidas o soporte técnico';
  }

  return FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

export const InformacionEspecificaViewer: React.FC<InformacionEspecificaViewerProps> = ({
  informacion,
  informacionEspecifica,
  codigoCategoria,
  tipoNombre,
}) => {
  const info = informacion || informacionEspecifica;
  if (!info || Object.keys(info).length === 0) {
    return (
      <div style={{ color: '#64748b', fontSize: '0.875rem', fontStyle: 'italic', padding: '0.5rem 0' }}>
        No se registraron especificaciones adicionales para esta solicitud.
      </div>
    );
  }

  const requiereAsesoramiento = Boolean(info.requiere_asesoramiento);
  const objetivoAsesoramiento = info.objetivo_asesoramiento || info.requerimiento_inicial;
  const contactoPreferido = info.contacto_preferido;

  // Filtrar claves para el listado general
  const generalEntries = Object.entries(info).filter(
    ([k]) => !IGNORED_KEYS.has(k)
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Tarjeta destacada de Asesoramiento */}
      {requiereAsesoramiento && (
        <div
          style={{
            background: '#fffbeb',
            border: '1px solid #fde68a',
            borderRadius: '0.5rem',
            padding: '1rem',
            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span
              style={{
                background: '#fef3c7',
                color: '#92400e',
                border: '1px solid #fcd34d',
                padding: '0.25rem 0.6rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 700,
                textTransform: 'uppercase',
              }}
            >
              Requiere asesoramiento: Sí
            </span>
          </div>

          {objetivoAsesoramiento && (
            <div style={{ marginTop: '0.5rem' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#78350f', textTransform: 'uppercase' }}>
                Objetivo o requerimiento inicial
              </span>
              <p
                style={{
                  margin: '0.2rem 0 0 0',
                  fontSize: '0.9rem',
                  color: '#1e293b',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}
              >
                {objetivoAsesoramiento}
              </p>
            </div>
          )}

          <div style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: '#92400e' }}>
            <strong>Canal de contacto preferido:</strong>{' '}
            {contactoPreferido === 'email' ? 'Correo electrónico' : 'WhatsApp'}
          </div>
        </div>
      )}

      {/* Listado semántico de campos estructurados */}
      {generalEntries.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '1rem',
          }}
        >
          {generalEntries.map(([key, val]) => {
            const label = getGestionFieldLabel(key, info, codigoCategoria, tipoNombre);
            const isFullWidth =
              typeof val === 'string' &&
              (val.length > 60 || val.includes('\n') || key === 'texto' || key === 'programa' || key === 'firmantes' || key === 'destinatarios' || key === 'descripcion' || key === 'informacion_base');

            return (
              <div
                key={key}
                style={{
                  gridColumn: isFullWidth ? '1 / -1' : undefined,
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                }}
              >
                <div
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: '#64748b',
                    textTransform: 'uppercase',
                    letterSpacing: '0.025em',
                    marginBottom: '0.25rem',
                  }}
                >
                  {label}
                </div>
                <div style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.5 }}>
                  {formatFieldValue(key, val)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

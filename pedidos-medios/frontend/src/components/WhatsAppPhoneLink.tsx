import React from 'react';
import { getWhatsAppDetails } from '../utils/phoneUtils';

interface WhatsAppPhoneLinkProps {
  phone?: string | null;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Componente para renderizar el teléfono del solicitante en Gestión.
 * Si es un número válido inequívoco, genera enlace directo wa.me.
 * Si es un número histórico no parseable, muestra texto normal sin enlace.
 */
export const WhatsAppPhoneLink: React.FC<WhatsAppPhoneLinkProps> = ({
  phone,
  className,
  style,
}) => {
  if (!phone || !phone.trim()) {
    return <span style={{ fontWeight: 600, color: '#94a3b8', ...style }}>N/D</span>;
  }

  const details = getWhatsAppDetails(phone);

  if (!details) {
    // Número histórico no normalizable inequívocamente -> renderizar como texto seguro
    return (
      <span style={{ fontWeight: 600, color: '#1e293b', ...style }} className={className}>
        {phone}
      </span>
    );
  }

  return (
    <a
      href={details.waUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.4rem',
        fontWeight: 600,
        color: '#059669',
        textDecoration: 'none',
        ...style,
      }}
      aria-label={`Abrir conversación de WhatsApp con ${details.formatted}`}
      title={`Abrir conversación de WhatsApp con ${details.formatted}`}
    >
      <span
        aria-hidden="true"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '1.25rem',
          height: '1.25rem',
          borderRadius: '9999px',
          backgroundColor: '#dcfce7',
          color: '#16a34a',
          fontSize: '0.75rem',
          fontWeight: 700,
        }}
      >
        💬
      </span>
      <span style={{ textDecoration: 'underline' }}>{details.formatted}</span>
    </a>
  );
};

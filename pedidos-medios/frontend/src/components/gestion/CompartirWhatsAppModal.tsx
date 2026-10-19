import React from 'react';

export interface CompartirWhatsAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  message: string;
  whatsappUrl: string;
}

export const CompartirWhatsAppModal: React.FC<CompartirWhatsAppModalProps> = ({
  isOpen,
  onClose,
  message,
  whatsappUrl,
}) => {
  if (!isOpen) return null;

  const handleShare = () => {
    window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--pedidos-surface-backdrop, rgba(0, 0, 0, 0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1100,
        padding: '1rem',
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-compartir-wa-title"
    >
      <div
        style={{
          background: 'var(--pedidos-surface-overlay, #ffffff)',
          color: 'var(--pedidos-text-primary, #1e293b)',
          border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
          borderRadius: '0.75rem',
          maxWidth: '520px',
          width: '100%',
          padding: '1.5rem',
          boxShadow: 'var(--pedidos-shadow-lg, 0 10px 25px rgba(0, 0, 0, 0.2))',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxSizing: 'border-box',
        }}
      >
        {/* Cabecera del Modal */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div>
            <h3
              id="modal-compartir-wa-title"
              style={{
                fontSize: '1.15rem',
                fontWeight: 700,
                margin: 0,
                color: 'var(--pedidos-text-primary, #0f172a)',
                lineHeight: 1.35,
              }}
            >
              ¿Querés compartir esta entrega por WhatsApp?
            </h3>
            <p
              style={{
                margin: '0.35rem 0 0 0',
                fontSize: '0.8125rem',
                color: 'var(--pedidos-text-muted, #64748b)',
                lineHeight: 1.4,
              }}
            >
              Podés enviar el aviso con los enlaces y datos de la entrega al solicitante o al grupo de trabajo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar modal"
            style={{
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              lineHeight: 1,
              color: 'var(--pedidos-text-muted, #94a3b8)',
              cursor: 'pointer',
              padding: '0.2rem',
            }}
          >
            ✕
          </button>
        </div>

        {/* Vista previa del mensaje */}
        <div
          style={{
            background: 'var(--pedidos-surface-sunken, #f8fafc)',
            border: '1px solid var(--pedidos-border-subtle, #e2e8f0)',
            borderRadius: '0.5rem',
            padding: '0.9rem',
            maxHeight: '220px',
            overflowY: 'auto',
            fontSize: '0.8125rem',
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            color: 'var(--pedidos-text-secondary, #334155)',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {message}
        </div>

        {/* Botones de acción (Estrictamente: "Compartir por WhatsApp" y "Ahora no") */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.55rem 1.1rem',
              borderRadius: '0.375rem',
              border: '1px solid var(--pedidos-border-default, #cbd5e1)',
              background: 'var(--pedidos-control-bg, #ffffff)',
              color: 'var(--pedidos-control-text, #475569)',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background-color 0.15s ease',
            }}
          >
            Ahora no
          </button>

          <button
            type="button"
            onClick={handleShare}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.45rem',
              padding: '0.55rem 1.25rem',
              borderRadius: '0.375rem',
              border: '1px solid #16a34a',
              background: '#25D366',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(37, 211, 102, 0.25)',
              transition: 'background-color 0.15s ease, transform 0.1s ease',
            }}
          >
            <span aria-hidden="true" style={{ fontSize: '1.05rem' }}>💬</span>
            <span>Compartir por WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};

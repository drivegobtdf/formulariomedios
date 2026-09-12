import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateInfoToken, submitInfoResponse, InfoTokenValidationResponse } from '../services/trackingApi';

export const SolicitudInformacionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<InfoTokenValidationResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form submission state
  const [textoRespuesta, setTextoRespuesta] = useState('');
  const [enlaces, setEnlaces] = useState<string[]>(['']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token.trim()) {
      setLoading(false);
      setValidationError('No se proporcionó un token de solicitud de información en el enlace.');
      return;
    }

    const checkToken = async () => {
      try {
        const res = await validateInfoToken(token);
        setValidation(res);
      } catch (err: any) {
        setValidationError(err.message || 'Error al validar la solicitud de información.');
      } finally {
        setLoading(false);
      }
    };

    checkToken();
  }, [token]);

  const handleAddEnlace = () => {
    setEnlaces([...enlaces, '']);
  };

  const handleEnlaceChange = (index: number, val: string) => {
    const updated = [...enlaces];
    updated[index] = val;
    setEnlaces(updated);
  };

  const handleRemoveEnlace = (index: number) => {
    const updated = enlaces.filter((_, i) => i !== index);
    setEnlaces(updated.length > 0 ? updated : ['']);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!textoRespuesta.trim() && enlaces.filter((u) => u.trim().length > 0).length === 0) {
      setSubmitError('Debe ingresar un texto de respuesta o al menos un enlace de material.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const validUrls = enlaces.map((u) => u.trim()).filter((u) => u.length > 0);

    try {
      await submitInfoResponse({
        token,
        respuesta_texto: textoRespuesta.trim() || undefined,
        enlaces: validUrls.length > 0 ? validUrls : undefined,
      });
      setSubmitSuccess(true);
    } catch (err: any) {
      setSubmitError(err.message || 'Error al enviar la respuesta.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', textAlign: 'center', color: '#64748b' }}>
        <p>Validando solicitud de información...</p>
      </div>
    );
  }

  if (validationError || !validation?.valid) {
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '1.5rem', background: '#fef2f2', border: '1px solid #f87171', borderRadius: '0.75rem', color: '#991b1b' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Solicitud No Disponible</h2>
        <p style={{ margin: 0 }}>
          {validationError || validation?.message || 'El enlace provisto es inválido o ha expirado tras las 48 horas corridas de vigencia.'}
        </p>
      </div>
    );
  }

  const { solicitud, responded } = validation;

  if (responded || submitSuccess) {
    return (
      <div style={{ maxWidth: '640px', margin: '3rem auto', padding: '2rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.75rem', textAlign: 'center', color: '#166534' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Respuesta Registrada</h2>
        <p style={{ color: '#15803d', marginBottom: '1.5rem' }}>
          La información solicitada para el pedido <strong>{solicitud?.pedido_visible}</strong> ha sido recibida y se notificó al equipo de la Secretaría.
        </p>
        {solicitud?.respuesta_texto && (
          <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #bbf7d0', textAlign: 'left', color: '#334155', fontSize: '0.875rem' }}>
            <strong>Su respuesta:</strong>
            <p style={{ margin: '0.5rem 0 0 0' }}>{solicitud.respuesta_texto}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '640px', margin: '2rem auto', padding: '1.5rem' }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.5rem', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 600 }}>
            Información Faltante Requerida
          </span>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0.25rem 0' }}>
            Pedido {solicitud?.pedido_visible}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
            {solicitud?.categoria_nombre} {solicitud?.tipo_nombre ? `· ${solicitud?.tipo_nombre}` : ''}
          </p>
        </div>

        {/* Mensaje del operador */}
        <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#854d0e', fontWeight: 600, marginBottom: '0.25rem' }}>
            REQUERIMIENTO DEL EQUIPO OPERATIVO:
          </div>
          <p style={{ margin: 0, fontSize: '0.925rem', color: '#713f12', fontWeight: 500 }}>
            {solicitud?.mensaje}
          </p>
          <div style={{ fontSize: '0.75rem', color: '#a16207', marginTop: '0.5rem' }}>
            Vence: {solicitud?.expires_at ? new Date(solicitud.expires_at).toLocaleString('es-AR') : '48 horas corridas'}
          </div>
        </div>

        {/* Formulario de respuesta */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
              Respuesta / Aclaración
            </label>
            <textarea
              rows={4}
              placeholder="Escriba aquí los detalles o aclaraciones solicitadas..."
              value={textoRespuesta}
              onChange={(e) => setTextoRespuesta(e.target.value)}
              style={{ width: '100%', padding: '0.625rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}>
              Enlaces de material complementario (Google Drive, Dropbox, WeTransfer, etc.)
            </label>
            {enlaces.map((url, idx) => (
              <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <input
                  type="url"
                  placeholder="https://..."
                  value={url}
                  onChange={(e) => handleEnlaceChange(idx, e.target.value)}
                  style={{ flex: 1, padding: '0.5rem', border: '1px solid #cbd5e1', borderRadius: '0.375rem', fontSize: '0.875rem' }}
                />
                {enlaces.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveEnlace(idx)}
                    style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '0.375rem', padding: '0 0.75rem', cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddEnlace}
              style={{ background: 'transparent', border: 'none', color: '#0284c7', fontSize: '0.875rem', cursor: 'pointer', fontWeight: 500, padding: '0.25rem 0' }}
            >
              + Agregar otro enlace
            </button>
          </div>

          {submitError && (
            <div style={{ background: '#fef2f2', color: '#991b1b', padding: '0.75rem', borderRadius: '0.375rem', fontSize: '0.875rem' }}>
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ backgroundColor: '#0284c7', color: '#ffffff', padding: '0.75rem 1.5rem', border: 'none', borderRadius: '0.375rem', fontWeight: 600, fontSize: '0.925rem', cursor: isSubmitting ? 'not-allowed' : 'pointer', marginTop: '0.5rem' }}
          >
            {isSubmitting ? 'Enviando Respuesta...' : 'Enviar Respuesta'}
          </button>
        </form>
      </div>
    </div>
  );
};

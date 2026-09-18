import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { validateInfoToken, submitInfoResponse, InfoTokenValidationResponse } from '../services/trackingApi';
import { InfoResponseForm } from '../components/InfoResponseForm';

export const SolicitudInformacionPage: React.FC = () => {
  const [searchParams] = useSearchParams();

  const extractTokenFromUrl = (): string => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash || '';
      if (hash.includes('token=')) {
        const match = hash.match(/[#&]token=([^&]+)/);
        if (match && match[1]) return decodeURIComponent(match[1]).trim();
      }
      const search = window.location.search || '';
      if (search.includes('token=')) {
        const match = search.match(/[?&]token=([^&]+)/);
        if (match && match[1]) return decodeURIComponent(match[1]).trim();
      }
    }
    return (searchParams.get('token') || '').trim();
  };

  const [rawToken] = useState<string>(() => extractTokenFromUrl());
  const tokenRef = useRef<string>(rawToken);

  const [loading, setLoading] = useState(true);
  const [validation, setValidation] = useState<InfoTokenValidationResponse | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Form submission feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    const activeToken = tokenRef.current.trim();

    // Sanitizar inmediatamente la URL (hash y query) para no dejar el token expuesto
    if (typeof window !== 'undefined' && (window.location.hash || window.location.search)) {
      window.history.replaceState(null, '', window.location.pathname);
    }

    if (!activeToken) {
      setLoading(false);
      setValidationError('No se proporcionó un token de solicitud de información en el enlace.');
      return;
    }

    const checkToken = async () => {
      try {
        const res = await validateInfoToken(activeToken);
        setValidation(res);
      } catch (err: any) {
        setValidationError(err.message || 'Error al validar la solicitud de información.');
      } finally {
        setLoading(false);
      }
    };

    checkToken();
  }, []);

  const handleSubmitResponse = async (formData: {
    respuesta_texto: string;
    enlaces: string[];
    archivo_ids: string[];
  }) => {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await submitInfoResponse({
        token: tokenRef.current.trim(),
        respuesta_texto: formData.respuesta_texto || undefined,
        enlaces: formData.enlaces.length > 0 ? formData.enlaces : undefined,
        archivo_ids: formData.archivo_ids.length > 0 ? formData.archivo_ids : undefined,
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
      <div style={{ maxWidth: '680px', margin: '3rem auto', padding: '2rem', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '0.75rem', textAlign: 'center', color: '#166534' }}>
        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>✓</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem 0' }}>Respuesta Registrada Exitosamente</h2>
        <p style={{ color: '#15803d', marginBottom: '1.5rem' }}>
          La información y documentación solicitada para el pedido <strong>{solicitud?.pedido_visible}</strong> ha sido recibida y se notificó al equipo de la Secretaría.
        </p>
        {solicitud?.respuesta_texto && (
          <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #bbf7d0', textAlign: 'left', color: '#334155', fontSize: '0.875rem' }}>
            <strong>Su respuesta:</strong>
            <p style={{ margin: '0.5rem 0 0 0', whiteSpace: 'pre-wrap' }}>{solicitud.respuesta_texto}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '720px', margin: '2rem auto', padding: '1.5rem' }}>
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '0.75rem', padding: '1.75rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ borderBottom: '1px solid #f1f5f9', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#64748b', fontWeight: 700 }}>
            Información solicitada · 48 h
          </span>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0f172a', margin: '0.25rem 0' }}>
            Pedido {solicitud?.pedido_visible}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.875rem', margin: 0 }}>
            {solicitud?.categoria_nombre} {solicitud?.tipo_nombre ? `· ${solicitud?.tipo_nombre}` : ''}
          </p>
        </div>

        {/* Mensaje del operador */}
        <div style={{ background: '#fefce8', border: '1px solid #fef08a', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.95rem', color: '#713f12', fontWeight: 500, whiteSpace: 'pre-wrap' }}>
            {solicitud?.mensaje}
          </p>
          <div style={{ fontSize: '0.75rem', color: '#a16207', marginTop: '0.6rem', fontWeight: 600 }}>
            Vence: {solicitud?.expires_at ? new Date(solicitud.expires_at).toLocaleString('es-AR') : '48 h'} (48 h)
          </div>
        </div>

        {/* Formulario de respuesta con adjuntos y links */}
        <InfoResponseForm
          auth={{ info_token: tokenRef.current.trim() }}
          onSubmit={handleSubmitResponse}
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      </div>
    </div>
  );
};

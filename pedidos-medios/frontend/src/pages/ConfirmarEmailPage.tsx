import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyAccess } from '../services/auth';
import { getSupabaseClient } from '../services/supabaseClient';

const AUTH_RETURN_PARAMS = [
  'access_token',
  'refresh_token',
  'expires_at',
  'expires_in',
  'provider_token',
  'provider_refresh_token',
  'token_type',
  'type',
  'error',
  'error_code',
  'error_description',
] as const;

export interface AuthReturnSnapshot {
  hasAuthReturn: boolean;
  hasImplicitSession: boolean;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

type ConfirmationState =
  | { kind: 'processing' }
  | { kind: 'error'; message: string }
  | {
      kind: 'success';
      accessState: 'pendiente' | 'aprobado' | 'rechazado' | 'revocado' | 'sin_perfil';
    };

export function readAuthReturn(url = window.location.href): AuthReturnSnapshot {
  const parsedUrl = new URL(url);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  const readParam = (name: string) => hashParams.get(name) ?? parsedUrl.searchParams.get(name);
  const error = readParam('error');
  const errorCode = readParam('error_code');
  const errorDescription = readParam('error_description');
  const hasImplicitSession = Boolean(
    hashParams.get('access_token') && hashParams.get('refresh_token')
  );

  return {
    hasAuthReturn: Boolean(error || errorCode || errorDescription || hasImplicitSession),
    hasImplicitSession,
    error,
    errorCode,
    errorDescription,
  };
}

export function sanitizeAuthReturnUrl(): void {
  const cleanUrl = new URL(window.location.href);
  for (const param of AUTH_RETURN_PARAMS) {
    cleanUrl.searchParams.delete(param);
  }
  cleanUrl.hash = '';
  window.history.replaceState(window.history.state, '', `${cleanUrl.pathname}${cleanUrl.search}`);
}

function getAuthErrorMessage(snapshot: AuthReturnSnapshot): string {
  if (snapshot.errorCode === 'otp_expired') {
    return 'El enlace de confirmación no es válido o ya no está vigente. Si ya confirmaste el correo con otro enlace, intentá iniciar sesión. Si no, solicitá un único reenvío al administrador.';
  }

  if (snapshot.error === 'access_denied') {
    return 'Supabase rechazó este enlace de confirmación. Podés intentar iniciar sesión si el correo ya fue confirmado con otro enlace.';
  }

  return 'No se pudo validar este enlace de confirmación. Puede ser inválido o haber dejado de estar vigente.';
}

export const ConfirmarEmailPage: React.FC = () => {
  const [authReturn] = useState<AuthReturnSnapshot>(() => readAuthReturn());
  const [state, setState] = useState<ConfirmationState>(() =>
    authReturn.error || authReturn.errorCode || authReturn.errorDescription
      ? { kind: 'error', message: getAuthErrorMessage(authReturn) }
      : { kind: 'processing' }
  );

  useEffect(() => {
    let cancelled = false;

    if (authReturn.error || authReturn.errorCode || authReturn.errorDescription) {
      sanitizeAuthReturnUrl();
      return () => {
        cancelled = true;
      };
    }

    if (!authReturn.hasImplicitSession) {
      setState({
        kind: 'error',
        message:
          'No encontramos datos de confirmación en esta URL. Abrí el enlace recibido por correo o iniciá sesión.',
      });
      sanitizeAuthReturnUrl();
      return () => {
        cancelled = true;
      };
    }

    const verifyConfirmation = async () => {
      try {
        // detectSessionInUrl procesa una sola vez el retorno implícito. No se
        // realiza verifyOtp ni exchangeCodeForSession en paralelo.
        const supabase = getSupabaseClient();
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !sessionData.session) {
          throw sessionError || new Error('Supabase no devolvió una sesión confirmada.');
        }

        const { data: userData, error: userError } = await supabase.auth.getUser();
        if (userError || !userData.user?.email_confirmed_at) {
          throw userError || new Error('Supabase no informó la confirmación del correo.');
        }

        const access = await getMyAccess();
        if (cancelled) return;

        setState({
          kind: 'success',
          accessState: access.success && access.data ? access.data.estadoAcceso : 'sin_perfil',
        });
      } catch {
        if (!cancelled) {
          setState({
            kind: 'error',
            message:
              'No pudimos comprobar la confirmación con Supabase. El enlace puede ser inválido o haber dejado de estar vigente.',
          });
        }
      } finally {
        sanitizeAuthReturnUrl();
      }
    };

    void verifyConfirmation();

    return () => {
      cancelled = true;
    };
  }, [authReturn]);

  const isPending = state.kind === 'success' && state.accessState === 'pendiente';
  const isApproved = state.kind === 'success' && state.accessState === 'aprobado';

  return (
    <main style={{ maxWidth: '560px', margin: '3rem auto', padding: '0 1rem' }}>
      <section
        aria-live="polite"
        style={{
          backgroundColor: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '0.75rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.06)',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        {state.kind === 'processing' && (
          <>
            <h1 style={{ color: '#0f172a', fontSize: '1.5rem' }}>Procesando confirmación</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              Estamos comprobando el enlace con Supabase. No cierres esta página.
            </p>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 style={{ color: '#991b1b', fontSize: '1.5rem' }}>Enlace inválido o vencido</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>{state.message}</p>
            <Link to="/login" style={{ color: '#0369a1', fontWeight: 700 }}>
              Ir al inicio de sesión
            </Link>
          </>
        )}

        {state.kind === 'success' && (
          <>
            <h1 style={{ color: '#166534', fontSize: '1.5rem' }}>Correo confirmado</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              Supabase confirmó correctamente tu dirección de correo.
            </p>
            {isPending && (
              <p
                style={{
                  color: '#92400e',
                  background: '#fffbeb',
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                }}
              >
                Tu acceso interno continúa pendiente de aprobación administrativa. Confirmar el
                correo no asigna permisos ni rol.
              </p>
            )}
            {isApproved && (
              <p
                style={{
                  color: '#166534',
                  background: '#f0fdf4',
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                }}
              >
                Tu cuenta ya tiene acceso aprobado. Podés continuar al panel de gestión.
              </p>
            )}
            {!isPending && !isApproved && (
              <p
                style={{
                  color: '#475569',
                  background: '#f8fafc',
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                }}
              >
                La identidad quedó confirmada, pero el acceso operativo no está habilitado. Consultá
                al administrador antes de ingresar.
              </p>
            )}
            <Link
              to={isApproved ? '/gestion' : '/login'}
              style={{ color: '#0369a1', fontWeight: 700 }}
            >
              {isApproved ? 'Continuar a Gestión' : 'Ir al inicio de sesión'}
            </Link>
          </>
        )}
      </section>
    </main>
  );
};

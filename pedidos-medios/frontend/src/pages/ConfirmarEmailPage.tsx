import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyAccess, updatePassword } from '../services/auth';
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

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 6) {
      setPasswordError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    setPasswordLoading(true);
    setPasswordError(null);

    try {
      const res = await updatePassword(newPassword);
      if (res.success) {
        setPasswordSuccess(true);
      } else {
        setPasswordError(res.error || 'Error al actualizar contraseña.');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Error al conectar con el servidor.');
    } finally {
      setPasswordLoading(false);
    }
  };

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
                Tu cuenta ya tiene acceso aprobado. Podés establecer tu contraseña o continuar al panel.
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

            {/* Formulario para establecer o cambiar contraseña */}
            <div
              style={{
                marginTop: '1.5rem',
                padding: '1.25rem',
                background: '#f8fafc',
                borderRadius: '0.5rem',
                border: '1px solid #e2e8f0',
                textAlign: 'left',
              }}
            >
              <h3 style={{ fontSize: '1.1rem', color: '#0f172a', margin: '0 0 0.5rem 0' }}>
                Establecer contraseña de acceso
              </h3>
              <p style={{ fontSize: '0.875rem', color: '#64748b', margin: '0 0 1rem 0' }}>
                Ingresá tu contraseña para acceder a la plataforma.
              </p>

              {passwordSuccess ? (
                <div
                  style={{
                    backgroundColor: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    color: '#166534',
                    padding: '0.75rem',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    marginBottom: '1rem',
                  }}
                >
                  ✓ Contraseña establecida exitosamente.
                </div>
              ) : (
                <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {passwordError && (
                    <div
                      style={{
                        backgroundColor: '#fef2f2',
                        border: '1px solid #fecaca',
                        color: '#991b1b',
                        padding: '0.75rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.875rem',
                      }}
                    >
                      {passwordError}
                    </div>
                  )}
                  <div>
                    <label
                      htmlFor="new-password"
                      style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}
                    >
                      Nueva contraseña (mínimo 6 caracteres)
                    </label>
                    <input
                      type="password"
                      id="new-password"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.375rem',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                      }}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="confirm-password"
                      style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.25rem' }}
                    >
                      Confirmar nueva contraseña
                    </label>
                    <input
                      type="password"
                      id="confirm-password"
                      style={{
                        width: '100%',
                        padding: '0.5rem 0.75rem',
                        border: '1px solid #cbd5e1',
                        borderRadius: '0.375rem',
                        fontSize: '0.9rem',
                        boxSizing: 'border-box',
                      }}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={passwordLoading}
                    style={{
                      marginTop: '0.5rem',
                      padding: '0.6rem 1rem',
                      backgroundColor: '#0284c7',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '0.375rem',
                      fontWeight: 600,
                      cursor: passwordLoading ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {passwordLoading ? 'Guardando...' : 'Guardar contraseña'}
                  </button>
                </form>
              )}
            </div>

            <div style={{ marginTop: '1.5rem' }}>
              <Link
                to={isApproved ? '/gestion' : '/login'}
                style={{ color: '#0369a1', fontWeight: 700 }}
              >
                {isApproved ? 'Continuar a Gestión →' : 'Ir al inicio de sesión →'}
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
};

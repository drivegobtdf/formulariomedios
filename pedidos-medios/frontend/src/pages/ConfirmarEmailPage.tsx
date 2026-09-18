import React, { useEffect, useState, useRef } from 'react';
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
  'code',
  'token_hash',
] as const;

export interface AuthReturnSnapshot {
  hasAuthReturn: boolean;
  hasImplicitSession: boolean;
  code: string | null;
  tokenHash: string | null;
  type: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
}

export function readAuthReturn(url = window.location.href): AuthReturnSnapshot {
  const parsedUrl = new URL(url);
  const hashParams = new URLSearchParams(parsedUrl.hash.replace(/^#/, ''));
  const searchParams = parsedUrl.searchParams;

  const readParam = (name: string) => hashParams.get(name) ?? searchParams.get(name);
  const error = readParam('error');
  const errorCode = readParam('error_code');
  const errorDescription = readParam('error_description');
  const code = searchParams.get('code') ?? hashParams.get('code');
  const tokenHash = searchParams.get('token_hash') ?? hashParams.get('token_hash');
  const type = readParam('type');

  const hasImplicitSession = Boolean(
    (hashParams.get('access_token') && hashParams.get('refresh_token')) ||
    code ||
    tokenHash
  );

  return {
    hasAuthReturn: Boolean(error || errorCode || errorDescription || hasImplicitSession),
    hasImplicitSession,
    code,
    tokenHash,
    type,
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
  if (snapshot.errorCode === 'otp_expired' || snapshot.errorDescription?.includes('expired')) {
    return 'El enlace de confirmación no es válido o ya no está vigente. Si ya confirmaste el correo con otro enlace, intentá iniciar sesión. Si no, solicitá un único reenvío al administrador.';
  }

  if (snapshot.error === 'access_denied') {
    return 'Supabase rechazó este enlace de confirmación. Podés intentar iniciar sesión si el correo ya fue confirmado con otro enlace.';
  }

  return snapshot.errorDescription || 'No se pudo validar este enlace de confirmación. Puede ser inválido o haber dejado de estar vigente.';
}

type PageState =
  | { kind: 'processing'; message?: string }
  | { kind: 'bot_gate'; tokenHash: string; type: string }
  | { kind: 'ready'; accessState: 'pendiente' | 'aprobado' | 'rechazado' | 'revocado' | 'sin_perfil'; email?: string }
  | { kind: 'success_password'; message: string }
  | { kind: 'error'; message: string };

export const ConfirmarEmailPage: React.FC = () => {
  const [authReturn] = useState<AuthReturnSnapshot>(() => readAuthReturn());
  const [state, setState] = useState<PageState>(() => {
    if (authReturn.error || authReturn.errorCode || authReturn.errorDescription) {
      return { kind: 'error', message: getAuthErrorMessage(authReturn) };
    }
    if (authReturn.tokenHash) {
      return { kind: 'bot_gate', tokenHash: authReturn.tokenHash, type: authReturn.type || 'recovery' };
    }
    return { kind: 'processing' };
  });

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  const resolvedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    if (authReturn.error || authReturn.errorCode || authReturn.errorDescription) {
      sanitizeAuthReturnUrl();
      return () => {
        cancelled = true;
      };
    }

    if (authReturn.tokenHash) {
      // Defer to user click to protect single-use token against email pre-fetching bots
      return () => {
        cancelled = true;
      };
    }

    const supabase = getSupabaseClient();

    // 1. Escuchar activamente eventos de recuperación de contraseña o login
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return;
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN' || (session && !resolvedRef.current)) {
        resolvedRef.current = true;
        try {
          const access = await getMyAccess();
          if (cancelled) return;
          setState({
            kind: 'ready',
            accessState: access.success && access.data ? access.data.estadoAcceso : 'sin_perfil',
            email: session?.user?.email,
          });
        } catch {
          if (!cancelled) {
            setState({
              kind: 'ready',
              accessState: 'sin_perfil',
              email: session?.user?.email,
            });
          }
        } finally {
          sanitizeAuthReturnUrl();
        }
      }
    });

    // 2. Comprobar sesión asíncrona existente o intercambio PKCE
    const initVerification = async () => {
      try {
        if (authReturn.code) {
          await supabase.auth.exchangeCodeForSession(authReturn.code);
        }

        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          throw sessionError;
        }

        if (sessionData.session) {
          resolvedRef.current = true;
          const access = await getMyAccess();
          if (cancelled) return;
          setState({
            kind: 'ready',
            accessState: access.success && access.data ? access.data.estadoAcceso : 'sin_perfil',
            email: sessionData.session.user?.email,
          });
          sanitizeAuthReturnUrl();
          return;
        }

        // Si después de verificar no hay sesión ni parámetros implícitos
        if (!authReturn.hasImplicitSession) {
          if (cancelled) return;
          setState({
            kind: 'error',
            message: 'No encontramos datos de confirmación en esta URL. Abrí el enlace recibido por correo o iniciá sesión.',
          });
          sanitizeAuthReturnUrl();
        }
      } catch (err: any) {
        if (!cancelled && !resolvedRef.current) {
          setState({
            kind: 'error',
            message: err?.message || 'No pudimos comprobar la confirmación con Supabase. El enlace puede ser inválido o haber dejado de estar vigente.',
          });
          sanitizeAuthReturnUrl();
        }
      }
    };

    void initVerification();

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, [authReturn]);

  const handleVerifyOtpClick = async (tokenHash: string, type: string) => {
    setState({ kind: 'processing', message: 'Validando enlace seguro...' });
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: type as any,
      });

      if (error) throw error;

      resolvedRef.current = true;
      const access = await getMyAccess();
      setState({
        kind: 'ready',
        accessState: access.success && access.data ? access.data.estadoAcceso : 'sin_perfil',
        email: data.session?.user?.email,
      });
      sanitizeAuthReturnUrl();
    } catch (err: any) {
      setState({
        kind: 'error',
        message: err?.message || 'El enlace de confirmación no es válido o ya fue utilizado.',
      });
      sanitizeAuthReturnUrl();
    }
  };

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
        setPasswordError(res.error || 'Error al actualizar la contraseña.');
      }
    } catch (err: any) {
      setPasswordError(err?.message || 'Error de conexión con el servidor.');
    } finally {
      setPasswordLoading(false);
    }
  };

  const isPending = state.kind === 'ready' && state.accessState === 'pendiente';
  const isApproved = state.kind === 'ready' && state.accessState === 'aprobado';

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
              {state.message || 'Estamos comprobando el enlace con Supabase. No cierres esta página.'}
            </p>
          </>
        )}

        {state.kind === 'bot_gate' && (
          <>
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#e0f2fe',
                color: '#0284c7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                margin: '0 auto 1rem',
                fontSize: '1.5rem',
              }}
            >
              🔐
            </div>
            <h1 style={{ color: '#0f172a', fontSize: '1.5rem', margin: '0 0 0.5rem 0' }}>
              Confirmación de Acceso Institucional
            </h1>
            <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              Para completar la validación y establecer tu contraseña de acceso, hacé clic en el botón a continuación.
            </p>
            <button
              type="button"
              onClick={() => handleVerifyOtpClick(state.tokenHash, state.type)}
              style={{
                padding: '0.75rem 1.5rem',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                borderRadius: '0.375rem',
                fontWeight: 700,
                fontSize: '1rem',
                cursor: 'pointer',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              Continuar y Establecer Contraseña
            </button>
          </>
        )}

        {state.kind === 'error' && (
          <>
            <h1 style={{ color: '#991b1b', fontSize: '1.5rem' }}>Enlace inválido o vencido</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>{state.message}</p>
            <div style={{ marginTop: '1.5rem' }}>
              <Link to="/login" style={{ color: '#0369a1', fontWeight: 700 }}>
                Ir al inicio de sesión
              </Link>
            </div>
          </>
        )}

        {state.kind === 'ready' && (
          <>
            <h1 style={{ color: '#166534', fontSize: '1.5rem' }}>Correo confirmado</h1>
            <p style={{ color: '#475569', lineHeight: 1.6 }}>
              Supabase confirmó correctamente tu dirección de correo{state.email ? ` (${state.email})` : ''}.
            </p>

            {isPending && (
              <p
                style={{
                  color: '#92400e',
                  background: '#fffbeb',
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                Tu acceso interno continúa pendiente de aprobación administrativa. Confirmar el correo no asigna permisos ni rol.
              </p>
            )}

            {isApproved && (
              <p
                style={{
                  color: '#166534',
                  background: '#f0fdf4',
                  padding: '0.85rem',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                }}
              >
                Tu cuenta tiene acceso aprobado con rol administrativo. Ingresá tu nueva contraseña para completar la activación.
              </p>
            )}

            {/* Formulario para establecer contraseña */}
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
                Definí tu contraseña personal para ingresar al sistema.
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
                  ✓ ¡Contraseña guardada exitosamente! Ya podés ingresar al panel de gestión.
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
                      autoComplete="new-password"
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
                      autoComplete="new-password"
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
                    {passwordLoading ? 'Guardando contraseña...' : 'Guardar contraseña e ingresar'}
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

import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { signIn } from '../services/auth';
import { useAuth } from '../auth/AuthContext';
import { PasswordInput } from '../components/common/PasswordInput';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, isLoading, isApproved, refreshUser } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user && isApproved) {
      navigate('/gestion', { replace: true });
    }
  }, [isLoading, user, isApproved, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError('Por favor complete todos los campos.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await signIn({ email: email.trim(), password });
      if (res.success) {
        await refreshUser();
        navigate('/gestion');
      } else {
        setError(res.error || 'Credenciales inválidas o error de autenticación.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  if (user && isApproved) {
    return (
      <div style={{ maxWidth: '460px', margin: '4rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div style={{ padding: '3rem 2rem', background: '#ffffff', borderRadius: '0.75rem', border: '1px solid #e2e8f0' }}>
          <div className="pedidos-spinner" style={{ margin: '0 auto 1rem', width: '36px', height: '36px', border: '3px solid #e2e8f0', borderTopColor: '#0b2746', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
          <p style={{ color: '#64748b', fontSize: '0.9rem', margin: 0 }}>Redirigiendo al Panel de Gestión...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '460px', margin: '2rem auto', padding: '0 1rem' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          padding: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
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
            🔒
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Acceso de Personal Interno
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
            Secretaría de Medios · Ingrese sus credenciales institucionales para gestionar solicitudes.
          </p>
        </div>

        {error && (
          <div
            style={{
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              color: '#991b1b',
              padding: '0.75rem 1rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              marginBottom: '1.25rem',
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div>
            <label
              htmlFor="login-email"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}
            >
              Correo Electrónico
            </label>
            <input
              id="login-email"
              type="email"
              required
              autoComplete="email"
              placeholder="nombre@tierradelfuego.gob.ar"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.625rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: 600, color: '#334155', marginBottom: '0.375rem' }}
            >
              Contraseña
            </label>
            <PasswordInput
              id="login-password"
              required
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              inputStyle={{
                padding: '0.625rem 2.5rem 0.625rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
                outline: 'none',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.5rem',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: 'var(--pedidos-brand-primary, #0b2746)',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'background-color 0.15s ease',
              boxShadow: '0 2px 4px rgba(11, 39, 70, 0.2)',
            }}
          >
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1.25rem',
            borderTop: '1px solid #f1f5f9',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            textAlign: 'center',
            fontSize: '0.85rem',
          }}
        >
          <Link
            to="/solicitar-acceso"
            style={{ color: 'var(--pedidos-brand-secondary, #1e5aa0)', textDecoration: 'none', fontWeight: 600 }}
          >
            ¿No tienes cuenta? <strong>Solicitar acceso operativo</strong> &rarr;
          </Link>
          <Link
            to="/"
            style={{ color: '#64748b', textDecoration: 'none' }}
          >
            ← Volver al Portal Público
          </Link>
        </div>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { signUp, isValidNombreUsuario } from '../services/auth';

export const SolicitarAccesoPage: React.FC = () => {
  const navigate = useNavigate();

  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [nombreUsuario, setNombreUsuario] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanNombre = nombre.trim();
    const cleanApellido = apellido.trim();
    const cleanUsername = nombreUsuario.trim().toLowerCase();
    const cleanEmail = email.trim();

    if (!cleanNombre || !cleanApellido) {
      setError('El nombre y apellido son obligatorios.');
      return;
    }

    if (!isValidNombreUsuario(cleanUsername)) {
      setError(
        'El nombre de usuario debe contener entre 2 y 30 caracteres en minúsculas (solo letras, números, puntos, guiones o guiones bajos).'
      );
      return;
    }

    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Ingrese un correo electrónico válido.');
      return;
    }

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas ingresadas no coinciden.');
      return;
    }

    setLoading(true);

    try {
      const res = await signUp({
        email: cleanEmail,
        password,
        nombre: cleanNombre,
        apellido: cleanApellido,
        nombreUsuario: cleanUsername,
      });

      if (res.success) {
        setSubmitted(true);
      } else {
        setError(res.error || 'Error al procesar la solicitud de registro.');
      }
    } catch (err: any) {
      setError(err?.message || 'Error de conexión con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{ maxWidth: '520px', margin: '3rem auto', padding: '0 1rem' }}>
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '0.75rem',
            border: '1px solid #e2e8f0',
            padding: '2.5rem 2rem',
            textAlign: 'center',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
          }}
        >
          <div
            style={{
              width: '56px',
              height: '56px',
              borderRadius: '50%',
              backgroundColor: '#fef3c7',
              color: '#b45309',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 1.25rem',
              fontSize: '1.75rem',
            }}
          >
            ⏳
          </div>

          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.75rem 0' }}>
            Solicitud Registrada con Éxito
          </h2>

          <p style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.6, margin: '0 0 1.5rem 0' }}>
            Su cuenta de usuario <strong>@{nombreUsuario.trim().toLowerCase()}</strong> ha sido creada con estado{' '}
            <span
              style={{
                backgroundColor: '#fef3c7',
                color: '#b45309',
                padding: '0.15rem 0.5rem',
                borderRadius: '9999px',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              PENDIENTE
            </span>
            .
          </p>

          <p
            style={{
              fontSize: '0.9rem',
              color: '#475569',
              lineHeight: 1.6,
              margin: '0 0 1.5rem 0',
            }}
          >
            Te enviamos un correo de confirmación. Abrí ese enlace para verificar tu dirección antes
            de iniciar sesión.
          </p>

          <div
            style={{
              backgroundColor: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '0.5rem',
              padding: '1rem',
              fontSize: '0.85rem',
              color: '#64748b',
              textAlign: 'left',
              marginBottom: '1.75rem',
            }}
          >
            <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600, color: '#334155' }}>
              📋 Próximos pasos:
            </p>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              <li>Confirme su dirección desde el correo enviado por Supabase Auth.</li>
              <li>Un Administrador revisará su solicitud en el panel de gestión.</li>
              <li>Se le asignará el rol correspondiente (Equipo u Observador).</li>
              <li>Una vez aprobado, podrá ingresar con su email y contraseña.</li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => navigate('/login')}
            style={{
              width: '100%',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: '#0284c7',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Ir al Inicio de Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '520px', margin: '2rem auto', padding: '0 1rem' }}>
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '0.75rem',
          border: '1px solid #e2e8f0',
          padding: '2rem',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05)',
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
            📝
          </div>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.5rem 0' }}>
            Solicitud de Acceso Operativo
          </h2>
          <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>
            Secretaría de Medios · Complete el formulario para solicitar una cuenta de personal interno.
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label
                htmlFor="reg-nombre"
                style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
              >
                Nombre
              </label>
              <input
                id="reg-nombre"
                type="text"
                required
                placeholder="Juan"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="reg-apellido"
                style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
              >
                Apellido
              </label>
              <input
                id="reg-apellido"
                type="text"
                required
                placeholder="Pérez"
                value={apellido}
                onChange={(e) => setApellido(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="reg-username"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
            >
              Nombre de Usuario Oficial
            </label>
            <input
              id="reg-username"
              type="text"
              required
              placeholder="juan.perez"
              value={nombreUsuario}
              onChange={(e) => setNombreUsuario(e.target.value.toLowerCase())}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            />
            <span style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem', display: 'block' }}>
              Minúsculas, 2 a 30 caracteres alfanuméricos, puntos, guiones o guiones bajos.
            </span>
          </div>

          <div>
            <label
              htmlFor="reg-email"
              style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
            >
              Correo Institucional
            </label>
            <input
              id="reg-email"
              type="email"
              required
              autoComplete="email"
              placeholder="juan.perez@tierradelfuego.gob.ar"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #cbd5e1',
                fontSize: '0.875rem',
              }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label
                htmlFor="reg-password"
                style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
              >
                Contraseña
              </label>
              <input
                id="reg-password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Mínimo 6 caract."
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="reg-confirm"
                style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#334155', marginBottom: '0.35rem' }}
              >
                Confirmar
              </label>
              <input
                id="reg-confirm"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Repita contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.55rem 0.75rem',
                  borderRadius: '0.375rem',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.875rem',
                }}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '0.75rem',
              padding: '0.75rem',
              borderRadius: '0.375rem',
              border: 'none',
              backgroundColor: 'var(--pedidos-brand-primary, #0b2746)',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 2px 4px rgba(11, 39, 70, 0.2)',
            }}
          >
            {loading ? 'Enviando solicitud...' : 'Enviar Solicitud de Acceso'}
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
            to="/login"
            style={{ color: 'var(--pedidos-brand-secondary, #1e5aa0)', textDecoration: 'none', fontWeight: 600 }}
          >
            ¿Ya tienes cuenta aprobada? <strong>Iniciar Sesión</strong> &rarr;
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

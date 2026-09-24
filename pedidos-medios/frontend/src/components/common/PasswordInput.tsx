import React, { useState } from 'react';

interface PasswordInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
  className?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  disabled?: boolean;
  ariaInvalid?: boolean;
  ariaDescribedby?: string;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder = '••••••••',
  required = false,
  autoComplete = 'current-password',
  className = 'pedidos-input',
  style,
  inputStyle,
  disabled = false,
  ariaInvalid,
  ariaDescribedby,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%', display: 'flex', alignItems: 'center', ...style }}>
      <input
        id={id}
        name={name}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        disabled={disabled}
        className={className}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedby}
        style={{
          width: '100%',
          paddingRight: '2.5rem',
          boxSizing: 'border-box',
          ...inputStyle,
        }}
      />
      <button
        type="button"
        onClick={() => setShowPassword((prev) => !prev)}
        aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        title={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        tabIndex={-1}
        style={{
          position: 'absolute',
          right: '0.5rem',
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'transparent',
          border: 'none',
          padding: '0.35rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: '#64748b',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '0.25rem',
          outline: 'none',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => {
          if (!disabled) e.currentTarget.style.color = '#1e293b';
        }}
        onMouseLeave={(e) => {
          if (!disabled) e.currentTarget.style.color = '#64748b';
        }}
      >
        {showPassword ? (
          // Eye-Off Icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
            <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
            <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
            <line x1="2" y1="2" x2="22" y2="22" />
          </svg>
        ) : (
          // Eye Icon
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        )}
      </button>
    </div>
  );
};

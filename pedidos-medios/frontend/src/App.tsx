import React from 'react';
import { AppRouter } from './router';
import { AuthProvider } from './auth/AuthContext';
import './styles/app.css';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('Error no capturado en la aplicación PEDIDOS:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="pedidos-app">
          <div className="pedidos-placeholder-card" style={{ borderColor: '#ef4444' }}>
            <h2 style={{ color: '#b91c1c' }}>Ocurrió un error inesperado</h2>
            <p>La aplicación no pudo inicializarse correctamente.</p>
            {this.state.error && (
              <pre style={{ background: '#fef2f2', padding: '0.75rem', borderRadius: '0.25rem', fontSize: '0.75rem' }}>
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
};

export default App;

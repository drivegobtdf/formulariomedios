import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

export function mountApp(): void {
  const mountNode =
    document.getElementById('pedidos-app') ||
    document.getElementById('pedidos-medios-root') ||
    document.querySelector('.pedidos-app-root');

  if (!mountNode) {
    return;
  }

  // Verificar si ya fue montado para evitar duplicaciones en re-renders de Elementor
  if ((mountNode as HTMLElement).dataset.mounted === 'true') {
    return;
  }

  (mountNode as HTMLElement).dataset.mounted = 'true';
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Global hook para Elementor u otros host shells
declare global {
  interface Window {
    mountPedidosMediosApp?: () => void;
  }
}

if (typeof window !== 'undefined') {
  window.mountPedidosMediosApp = mountApp;
}

// Inicializar al cargar el DOM o inmediatamente si ya está disponible
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp);
  } else {
    mountApp();
  }
}

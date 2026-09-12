import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const MOUNT_NODE_ID = 'pedidos-app';

function mountApp(): void {
  const mountNode = document.getElementById(MOUNT_NODE_ID);
  if (!mountNode) {
    // Si el nodo aún no existe en el DOM, esperar a que el DOM cargue
    return;
  }

  // Verificar si ya fue montado para evitar duplicaciones en re-renders de Elementor
  if (mountNode.dataset.mounted === 'true') {
    return;
  }

  mountNode.dataset.mounted = 'true';
  const root = ReactDOM.createRoot(mountNode);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}

// Inicializar al cargar el DOM o inmediatamente si ya está disponible
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountApp);
} else {
  mountApp();
}

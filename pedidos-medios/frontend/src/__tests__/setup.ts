import '@testing-library/jest-dom';
import { beforeEach, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

beforeEach(() => {
  // Configurar la URL inicial de jsdom bajo el base path de PEDIDOS
  window.history.pushState({}, 'Test page', '/formulariomedios/');
});

afterEach(() => {
  cleanup();
});

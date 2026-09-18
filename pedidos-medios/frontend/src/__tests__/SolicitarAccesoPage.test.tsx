import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SolicitarAccesoPage } from '../pages/SolicitarAccesoPage';
import * as authModule from '../services/auth';

describe('SolicitarAccesoPage Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renderiza formulario completo de registro institucional', () => {
    render(
      <MemoryRouter>
        <SolicitarAccesoPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Solicitud de Acceso Operativo')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Nombre$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Apellido$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Nombre de Usuario Oficial/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Correo Institucional/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Contraseña$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Confirmar/i)).toBeInTheDocument();
  });

  it('2. Valida formato inválido de nombre de usuario', async () => {
    render(
      <MemoryRouter>
        <SolicitarAccesoPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Juan' } });
    fireEvent.change(screen.getByLabelText(/^Apellido$/i), { target: { value: 'Pérez' } });
    fireEvent.change(screen.getByLabelText(/Nombre de Usuario Oficial/i), { target: { value: 'Invalid User!' } });
    fireEvent.change(screen.getByLabelText(/Correo Institucional/i), { target: { value: 'juan@test.com' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Confirmar/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud de Acceso/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/El nombre de usuario debe contener entre 2 y 30 caracteres en minúsculas/i)
      ).toBeInTheDocument();
    });
  });

  it('3. Registro exitoso muestra confirmación de solicitud enviada', async () => {
    vi.spyOn(authModule, 'signUp').mockResolvedValue({
      success: true,
      data: {
        userId: 'usr-new-1',
      },
    });

    render(
      <MemoryRouter>
        <SolicitarAccesoPage />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Juan' } });
    fireEvent.change(screen.getByLabelText(/^Apellido$/i), { target: { value: 'Pérez' } });
    fireEvent.change(screen.getByLabelText(/Nombre de Usuario Oficial/i), { target: { value: 'jperez' } });
    fireEvent.change(screen.getByLabelText(/Correo Institucional/i), { target: { value: 'juan@test.gob.ar' } });
    fireEvent.change(screen.getByLabelText(/^Contraseña$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/Confirmar/i), { target: { value: 'password123' } });

    fireEvent.click(screen.getByRole('button', { name: /Enviar Solicitud de Acceso/i }));

    await waitFor(() => {
      expect(screen.getByText('Solicitud Registrada con Éxito')).toBeInTheDocument();
    });
    expect(screen.getByText(/PENDIENTE/i)).toBeInTheDocument();
    expect(screen.getByText(/Te enviamos un correo de confirmación/i)).toBeInTheDocument();
  });
});

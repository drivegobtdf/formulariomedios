import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { InfoResponseForm } from '../components/InfoResponseForm';

vi.mock('../services/formApi');

describe('InfoResponseForm Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Renderiza campos de texto, enlaces y zona de carga de archivos', () => {
    render(
      <InfoResponseForm
        auth={{ info_token: 'raw-info-token-123' }}
        onSubmit={vi.fn()}
      />
    );

    expect(screen.getByLabelText(/^Respuesta$/i)).toBeInTheDocument();
    expect(screen.getByText(/Enlaces opcionales/i)).toBeInTheDocument();
    expect(screen.getByText(/Archivos opcionales/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar respuesta/i })).toBeInTheDocument();
  });

  it('2. Valida que el botón esté deshabilitado si no hay contenido', () => {
    const submitSpy = vi.fn();
    render(
      <InfoResponseForm
        auth={{ info_token: 'raw-info-token-123' }}
        onSubmit={submitSpy}
      />
    );

    const btnSubmit = screen.getByRole('button', { name: /Enviar respuesta/i });
    expect(btnSubmit).toBeDisabled();
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it('3. Permite agregar y remover enlaces externos', async () => {
    render(
      <InfoResponseForm
        auth={{ info_token: 'raw-info-token-123' }}
        onSubmit={vi.fn()}
      />
    );

    const btnAddLink = screen.getByRole('button', { name: /\+ Agregar enlace/i });
    fireEvent.click(btnAddLink);

    const linkInputs = screen.getAllByPlaceholderText(/https:\/\//i);
    expect(linkInputs.length).toBe(2);

    fireEvent.change(linkInputs[0], { target: { value: 'https://drive.google.com/folder-test' } });
    expect(linkInputs[0]).toHaveValue('https://drive.google.com/folder-test');

    const btnRemove = screen.getAllByRole('button', { name: /Quitar enlace/i });
    fireEvent.click(btnRemove[0]);

    expect(screen.getAllByPlaceholderText(/https:\/\//i).length).toBe(1);
  });

  it('4. Envía la respuesta correctamente con texto y enlaces válidos', async () => {
    const submitSpy = vi.fn().mockResolvedValue(undefined);
    render(
      <InfoResponseForm
        auth={{ info_token: 'raw-info-token-123' }}
        onSubmit={submitSpy}
      />
    );

    const textarea = screen.getByLabelText(/^Respuesta$/i);
    fireEvent.change(textarea, { target: { value: 'Aquí está la información requerida por el equipo de Medios.' } });

    const linkInputs = screen.getAllByPlaceholderText(/https:\/\//i);
    fireEvent.change(linkInputs[0], { target: { value: 'https://drive.google.com/material-institucional' } });

    const btnSubmit = screen.getByRole('button', { name: /Enviar respuesta/i });
    expect(btnSubmit).not.toBeDisabled();
    fireEvent.click(btnSubmit);

    await waitFor(() => {
      expect(submitSpy).toHaveBeenCalledWith({
        respuesta_texto: 'Aquí está la información requerida por el equipo de Medios.',
        enlaces: ['https://drive.google.com/material-institucional'],
        archivo_ids: [],
      });
    });
  });

  it('5. Rechaza archivos no permitidos (ej: .exe) con aviso explicativo', async () => {
    render(
      <InfoResponseForm
        auth={{ info_token: 'raw-info-token-123' }}
        onSubmit={vi.fn()}
      />
    );

    const file = new File(['dummy'], 'malicious.exe', { type: 'application/x-msdownload' });
    const fileInput = screen.getByTestId('info-file-input') as HTMLInputElement;

    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText(/Tipo de archivo no permitido: malicious\.exe/i)).toBeInTheDocument();
    });
  });
});

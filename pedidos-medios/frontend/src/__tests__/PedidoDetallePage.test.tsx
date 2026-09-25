import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PedidoDetallePage } from '../pages/PedidoDetallePage';
import * as AuthContextModule from '../auth/AuthContext';
import { UserProfile } from '../auth/types';
import * as gestionApi from '../services/gestionApi';

vi.mock('../services/gestionApi');

describe('PedidoDetallePage Unit Tests', () => {
  const mockAdminProfile: UserProfile = {
    userId: 'usr-admin-1',
    email: 'admin@medios.tdf.gob.ar',
    nombre: 'Pablo',
    apellido: 'Saldivia',
    nombreUsuario: 'psaldivia',
    appRole: 'administrador',
    estadoAcceso: 'aprobado',
  };

  const mockObserverProfile: UserProfile = {
    userId: 'usr-obs-1',
    email: 'obs@medios.tdf.gob.ar',
    nombre: 'Observador',
    apellido: 'Prensa',
    nombreUsuario: 'observador',
    appRole: 'observador',
    estadoAcceso: 'aprobado',
  };

  const mockPedidoFlyer: gestionApi.PedidoDetailItem = {
    id: 'ped-d-155',
    pedido_visible: 'PED-2026-D000155',
    anio: 2026,
    numero: 155,
    codigo_categoria: 'D',
    categoria_id: 'cat-d',
    categoria_nombre: 'Diseño Gráfico',
    tipo_servicio_id: 'tipo-flyer',
    tipo_nombre: 'Flyer para redes sociales',
    estado: 'Nuevo',
    responsable_user_id: undefined,
    responsable_nombre: undefined,
    informacion_especifica: {
      formato: 'Cuadrado 1:1 (Feed Instagram/Facebook)',
      texto: 'Flyer institucional para difusión de actividades de Medios.\nLínea 2 de contenido.',
      fecha_limite: '2026-09-30',
    },
    version: 1,
    archivado: false,
    created_at: '2026-09-16T04:49:29.083Z',
    updated_at: '2026-09-16T04:49:29.083Z',
    envio: {
      id: 'envio-1',
      nombre_apellido: 'Pablo Saldivia',
      telefono: '+5492964477578',
      correo: 'pablosaldiviainfo@gmail.com',
      area_solicitante: 'Secretaría de Medios',
    },
    asignaciones: [],
    notas: [
      {
        id: 'nota-1',
        autor_user_id: 'usr-admin-1',
        autor_nombre: 'Pablo Saldivia',
        visibilidad: 'interna',
        texto: 'Nota técnica interna reservada para el equipo.',
        created_at: '2026-09-16T05:00:00.000Z',
      },
      {
        id: 'nota-2',
        autor_user_id: 'usr-admin-1',
        autor_nombre: 'Pablo Saldivia',
        visibilidad: 'solicitante',
        texto: 'Mensaje público enviado para conocimiento del solicitante.',
        created_at: '2026-09-16T05:10:00.000Z',
      },
    ],
    solicitudes: [],
    archivos: [
      {
        id: 'arch-1',
        nombre_original: 'Skynet_Terminator_logo.png',
        mime_type: 'image/png',
        size_bytes: 70,
        contexto: 'solicitud',
        estado: 'verified',
        created_at: '2026-09-16T04:49:05.522Z',
      },
    ],
    enlaces: [],
    entregas: [],
  };

  const mockPedidoMotion: gestionApi.PedidoDetailItem = {
    id: 'ped-m-154',
    pedido_visible: 'PED-2026-M000154',
    anio: 2026,
    numero: 154,
    codigo_categoria: 'M',
    categoria_id: 'cat-m',
    categoria_nombre: 'Animación y Motion Graphics',
    tipo_servicio_id: 'tipo-motion',
    tipo_nombre: 'Animación y motion graphics',
    estado: 'Nuevo',
    responsable_user_id: 'usr-admin-1',
    responsable_nombre: 'Pablo Saldivia',
    informacion_especifica: {
      requiere_asesoramiento: true,
      requerimiento_inicial: 'Animación institucional para presentación de programas.',
      contacto_preferido: 'WhatsApp',
    },
    version: 1,
    archivado: false,
    created_at: '2026-09-16T04:49:29.083Z',
    updated_at: '2026-09-16T04:49:29.083Z',
    envio: {
      id: 'envio-1',
      nombre_apellido: 'Pablo Saldivia',
      telefono: '+5492964477578',
      correo: 'pablosaldiviainfo@gmail.com',
      area_solicitante: 'Secretaría de Medios',
    },
    asignaciones: [],
    notas: [],
    solicitudes: [],
    archivos: [
      {
        id: 'arch-1',
        nombre_original: 'Skynet_Terminator_logo.png',
        mime_type: 'image/png',
        size_bytes: 70,
        contexto: 'solicitud',
        estado: 'verified',
        created_at: '2026-09-16T04:49:05.522Z',
      },
    ],
    enlaces: [],
    entregas: [],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([
      {
        user_id: 'usr-admin-1',
        nombre: 'Pablo',
        apellido: 'Saldivia',
        nombre_usuario: 'psaldivia',
        app_role: 'administrador',
        estado_acceso: 'aprobado',
      },
    ]);
    vi.spyOn(gestionApi, 'fetchPedidoHistorialOperativo').mockResolvedValue([]);
  });

  it('1. Renderiza los datos del pedido Flyer con información específica legible y fecha sin desplazamiento', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedidoFlyer);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // Encabezado y contacto
    expect(screen.getByText(/Diseño Gráfico · Flyer para redes sociales/i)).toBeInTheDocument();
    expect(screen.getByText('Pablo Saldivia')).toBeInTheDocument();
    expect(screen.getByText('Secretaría de Medios')).toBeInTheDocument();
    expect(screen.getByText('pablosaldiviainfo@gmail.com')).toBeInTheDocument();

    // Información específica legible (no JSON crudo)
    expect(screen.getByText('Cuadrado 1:1 (Feed Instagram/Facebook)')).toBeInTheDocument();
    expect(screen.getByText(/Flyer institucional para difusión de actividades/i)).toBeInTheDocument();
    expect(screen.getAllByText('30/09/2026').length).toBeGreaterThan(0); // Fecha sin corrimiento UTC
  });

  it('2. Renderiza Motion Graphics con asesoramiento de forma estructurada', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedidoMotion);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-m-154']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-M000154')).toBeInTheDocument();
    });

    expect(screen.getByText('Requiere asesoramiento: Sí')).toBeInTheDocument();
    expect(screen.getByText(/Animación institucional para presentación de programas/i)).toBeInTheDocument();
    expect(screen.getByText('Canal de contacto preferido:')).toBeInTheDocument();
    expect(screen.getAllByText(/WhatsApp/i).length).toBeGreaterThan(0);
  });

  it('3. Muestra tamaño legible y botón accesible de descarga que ejecuta downloadArchivo', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedidoFlyer);
    const downloadSpy = vi.spyOn(gestionApi, 'downloadArchivo').mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Skynet_Terminator_logo.png')).toBeInTheDocument();
    });

    expect(screen.getByText(/70 Bytes/i)).toBeInTheDocument();
    expect(screen.getByText(/Verificado en almacenamiento/i)).toBeInTheDocument();

    const downloadBtn = screen.getByRole('button', { name: /Descargar archivo Skynet_Terminator_logo.png/i });
    expect(downloadBtn).toBeInTheDocument();

    fireEvent.click(downloadBtn);

    expect(downloadSpy).toHaveBeenCalledWith('arch-1', 'Skynet_Terminator_logo.png');
  });

  it('4. Manejo de error en descarga muestra mensaje amigable', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedidoFlyer);
    vi.spyOn(gestionApi, 'downloadArchivo').mockRejectedValue(new Error('Archivo temporalmente inaccesible'));

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Skynet_Terminator_logo.png')).toBeInTheDocument();
    });

    const downloadBtn = screen.getByRole('button', { name: /Descargar archivo Skynet_Terminator_logo.png/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(screen.getByText(/No se pudo descargar "Skynet_Terminator_logo.png": Archivo temporalmente inaccesible/i)).toBeInTheDocument();
    });
  });

  it('5. Modo Observador no renderiza controles de mutación ni reasignación', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockObserverProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: false,
      isTeamOrAdmin: false,
      isObserver: true,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedidoFlyer);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    expect(screen.getByText(/^Observador$/i)).toBeInTheDocument();

    // No debe mostrar botones de mutación
    expect(screen.queryByRole('button', { name: /^En revisión$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^En proceso$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Finalizar Pedido/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Cancelar$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Guardar Nota/i })).not.toBeInTheDocument();
  });

  it('6. Transiciones canónicas según estado: Nuevo solo muestra En revisión, no En proceso directo', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    // Pedido en estado Nuevo y con responsable
    const pedidoNuevoAsignado: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      responsable_user_id: 'usr-admin-1',
      responsable_nombre: 'Pablo Saldivia',
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoNuevoAsignado);
    const changeStateSpy = vi.spyOn(gestionApi, 'changePedidoState').mockResolvedValue({
      success: true,
      pedido_id: 'ped-d-155',
      estado: 'En revisión',
      version: 2,
    });

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // Debe existir botón "En revisión" y NO debe existir botón "En proceso"
    const btnEnRevision = screen.getByRole('button', { name: /^En revisión$/i });
    expect(btnEnRevision).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^En proceso$/i })).not.toBeInTheDocument();

    // Transición canónica
    expect(screen.queryByRole('button', { name: /^En proceso$/i })).not.toBeInTheDocument();

    // Al hacer clic en "En revisión", se abre modal y se confirma
    fireEvent.click(btnEnRevision);
    expect(screen.getByText(/Cambiar estado a: En revisión/i)).toBeInTheDocument();

    const btnConfirmar = screen.getByRole('button', { name: /^Confirmar$/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(changeStateSpy).toHaveBeenCalledWith('ped-d-155', 'En revisión', 1, undefined);
    });
  });

  it('7. Muestra error dentro del modal ante falla de transición de estado', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoNuevoAsignado: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      responsable_user_id: 'usr-admin-1',
      responsable_nombre: 'Pablo Saldivia',
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoNuevoAsignado);
    vi.spyOn(gestionApi, 'changePedidoState').mockRejectedValue(
      new Error('INVALID_TRANSITION: No se permite transición directa de Nuevo a En proceso')
    );

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    const btnEnRevision = screen.getByRole('button', { name: /^En revisión$/i });
    fireEvent.click(btnEnRevision);

    const btnConfirmar = screen.getByRole('button', { name: /^Confirmar$/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      // El error debe ser visible dentro del modal
      expect(screen.getByText(/INVALID_TRANSITION: No se permite transición directa/i)).toBeInTheDocument();
    });
  });

  it('8. Compositor de notas solo envía notas internas y elimina opción pública', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(mockPedidoFlyer);
    const notaSpy = vi.spyOn(gestionApi, 'createNotaPedido').mockResolvedValue({
      id: 'nota-new',
      pedido_id: 'ped-d-155',
      autor_user_id: 'usr-admin-1',
      visibilidad: 'interna',
      texto: 'Nueva nota interna de prueba',
      created_at: '2026-09-16T06:00:00.000Z',
    });

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // Sección claramente titulada
    expect(screen.getByText('Notas internas')).toBeInTheDocument();

    // NO debe existir radio button para mensaje público
    expect(screen.queryByText(/Mensaje Público (Visible para el solicitante)/i)).not.toBeInTheDocument();

    const textarea = screen.getByLabelText(/Nueva nota interna/i);
    fireEvent.change(textarea, { target: { value: 'Nueva nota interna de prueba' } });

    const btnGuardar = screen.getByRole('button', { name: /Guardar nota/i });
    fireEvent.click(btnGuardar);

    await waitFor(() => {
      expect(notaSpy).toHaveBeenCalledWith('ped-d-155', 'Nueva nota interna de prueba', 'interna');
    });
  });

  it('9. Transición "Volver a En revisión" disponible en "En proceso" con modal explicativo', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoEnProceso: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      estado: 'En proceso',
      responsable_user_id: 'usr-admin-1',
      responsable_nombre: 'Pablo Saldivia',
      version: 3,
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoEnProceso);
    const changeStateSpy = vi.spyOn(gestionApi, 'changePedidoState').mockResolvedValue({
      success: true,
      id: 'ped-d-155',
      estado: 'En revisión',
      version: 4,
    });

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    const btnRetroceso = screen.getByRole('button', { name: /Volver a En revisión/i });
    expect(btnRetroceso).toBeInTheDocument();

    fireEvent.click(btnRetroceso);

    // Modal debe mostrar título contextual
    expect(screen.getByText('¿Volver a En revisión?')).toBeInTheDocument();

    const btnConfirmar = screen.getByRole('button', { name: /^Confirmar$/i });
    fireEvent.click(btnConfirmar);

    await waitFor(() => {
      expect(changeStateSpy).toHaveBeenCalledWith('ped-d-155', 'En revisión', 3, undefined);
    });
  });

  it('10. Muestra badge "Respuesta a Info" y archivos aportados en Solicitudes de Información', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoConInfoYRespuestas: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      estado: 'En revisión',
      solicitudes: [
        {
          id: 'sol-1',
          solicitada_por: 'usr-admin-1',
          mensaje: 'Por favor adjuntar el logo en vector SVG o PNG alta resolución.',
          estado: 'respondida',
          expires_at: '2026-09-18T00:00:00.000Z',
          is_expired: false,
          respuesta_texto: 'Adjunto el logo institucional solicitado en alta calidad.',
          responded_at: '2026-09-16T12:00:00.000Z',
          created_at: '2026-09-16T06:00:00.000Z',
          archivos_respuesta: [
            {
              id: 'arch-info-1',
              nombre_original: 'Logo_Oficial_TDF.png',
              mime_type: 'image/png',
              size_bytes: 2048576,
              contexto: 'informacion_respuesta',
              estado: 'verified',
              created_at: '2026-09-16T12:00:00.000Z',
            },
          ],
        },
      ],
      archivos: [
        {
          id: 'arch-info-1',
          nombre_original: 'Logo_Oficial_TDF.png',
          mime_type: 'image/png',
          size_bytes: 2048576,
          contexto: 'informacion_respuesta',
          estado: 'verified',
          created_at: '2026-09-16T12:00:00.000Z',
        },
      ],
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoConInfoYRespuestas);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // Badge en lista de adjuntos
    expect(screen.getByText('Respuesta a Info')).toBeInTheDocument();

    // Sección de solicitudes de información
    expect(screen.getByText(/Por favor adjuntar el logo en vector SVG/i)).toBeInTheDocument();
    expect(screen.getByText(/Adjunto el logo institucional solicitado en alta calidad/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Logo_Oficial_TDF\.png/i).length).toBe(2);
  });

  it('11. Muestra enlaces aportados en respuesta dentro de la tarjeta RESPONDIDA y en la sección global', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoConLinksEnRespuesta: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      estado: 'En proceso',
      solicitudes: [
        {
          id: 'sol-2',
          solicitada_por: 'usr-admin-1',
          mensaje: 'PRUEBA FINAL ENLACE DIRECTO — Adjuntá un archivo para validar el circuito completo.',
          estado: 'respondida',
          expires_at: '2026-09-18T19:29:16.206Z',
          is_expired: false,
          respuesta_texto: 'Perfecto!',
          responded_at: '2026-09-16T19:55:53.912Z',
          created_at: '2026-09-16T19:29:16.206Z',
          archivos_respuesta: [
            {
              id: 'arch-resp-1',
              nombre_original: 'WhatsApp Image 2026-08-25 at 17.49.04.jpeg',
              mime_type: 'image/jpeg',
              size_bytes: 159069,
              contexto: 'informacion_respuesta',
              estado: 'verified',
              created_at: '2026-09-16T19:55:53.912Z',
            },
          ],
          enlaces_respuesta: [
            {
              id: 'enl-resp-1',
              url: 'https://drive.google.com/drive/u/1/folders/1A7j6LRMHGXQQiYwbHjJxYSgr43SWGdfi',
              descripcion: 'Aportado en respuesta a solicitud de información',
              created_at: '2026-09-16T19:55:53.912Z',
            },
          ],
        },
      ],
      archivos: [
        {
          id: 'arch-resp-1',
          nombre_original: 'WhatsApp Image 2026-08-25 at 17.49.04.jpeg',
          mime_type: 'image/jpeg',
          size_bytes: 159069,
          contexto: 'informacion_respuesta',
          estado: 'verified',
          created_at: '2026-09-16T19:55:53.912Z',
        },
      ],
      enlaces: [
        {
          id: 'enl-resp-1',
          url: 'https://drive.google.com/drive/u/1/folders/1A7j6LRMHGXQQiYwbHjJxYSgr43SWGdfi',
          descripcion: 'Aportado en respuesta a solicitud de información',
          created_at: '2026-09-16T19:55:53.912Z',
        },
      ],
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoConLinksEnRespuesta);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // 1. Cabecera global de Enlaces
    expect(screen.getByText('Enlaces (1)')).toBeInTheDocument();

    // 2. Tarjeta Solicitud de Información RESPONDIDA
    expect(screen.getByText(/PRUEBA FINAL ENLACE DIRECTO/i)).toBeInTheDocument();
    expect(screen.getByText('Perfecto!')).toBeInTheDocument();

    // 3. Archivo aportado en respuesta dentro de la tarjeta
    expect(screen.getByText('Archivos aportados en respuesta:')).toBeInTheDocument();
    expect(screen.getAllByText(/WhatsApp Image 2026-08-25 at 17\.49\.04\.jpeg/i).length).toBe(2);

    // 4. Enlace aportado en respuesta dentro de la tarjeta
    expect(screen.getByText('Enlaces aportados en respuesta:')).toBeInTheDocument();
    const driveLinks = screen.getAllByRole('link', { name: /drive\.google\.com/i });
    expect(driveLinks.length).toBeGreaterThanOrEqual(1);

    // 5. Botón/Enlace directo "Abrir enlace ↗"
    const openLinkBtn = screen.getByRole('link', { name: /Abrir enlace/i });
    expect(openLinkBtn).toHaveAttribute('href', 'https://drive.google.com/drive/u/1/folders/1A7j6LRMHGXQQiYwbHjJxYSgr43SWGdfi');
    expect(openLinkBtn).toHaveAttribute('target', '_blank');
    expect(openLinkBtn).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('12. Aislamiento determinístico de múltiples solicitudes (A, B, C) en el mismo pedido sin duplicación cruzada', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoConTresSolicitudes: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      estado: 'En proceso',
      solicitudes: [
        {
          id: 'sol-A',
          solicitada_por: 'usr-admin-1',
          mensaje: 'Requerimiento A — Logo vector',
          estado: 'respondida',
          expires_at: '2026-09-18T10:00:00.000Z',
          is_expired: false,
          respuesta_texto: 'Respuesta A — Adjunto vector',
          responded_at: '2026-09-16T11:00:00.000Z',
          created_at: '2026-09-16T10:00:00.000Z',
          archivos_respuesta: [
            {
              id: 'arch-A',
              nombre_original: 'logo_vector_a.svg',
              size_bytes: 1024,
              mime_type: 'image/svg+xml',
              estado: 'verified',
              created_at: '2026-09-16T11:00:00.000Z',
            },
          ],
          enlaces_respuesta: [
            {
              id: 'enl-A',
              url: 'https://drive.google.com/folder-a',
              descripcion: 'Drive A',
              created_at: '2026-09-16T11:00:00.000Z',
            },
          ],
        },
        {
          id: 'sol-B',
          solicitada_por: 'usr-admin-1',
          mensaje: 'Requerimiento B — Manual de marca',
          estado: 'respondida',
          expires_at: '2026-09-18T12:00:00.000Z',
          is_expired: false,
          respuesta_texto: 'Respuesta B — Adjunto manual',
          responded_at: '2026-09-16T13:00:00.000Z',
          created_at: '2026-09-16T12:00:00.000Z',
          archivos_respuesta: [
            {
              id: 'arch-B',
              nombre_original: 'manual_marca_b.pdf',
              size_bytes: 2048,
              mime_type: 'application/pdf',
              estado: 'verified',
              created_at: '2026-09-16T13:00:00.000Z',
            },
          ],
          enlaces_respuesta: [
            {
              id: 'enl-B',
              url: 'https://dropbox.com/folder-b',
              descripcion: 'Dropbox B',
              created_at: '2026-09-16T13:00:00.000Z',
            },
          ],
        },
        {
          id: 'sol-C',
          solicitada_por: 'usr-admin-1',
          mensaje: 'Requerimiento C — Fotos en alta',
          estado: 'respondida',
          expires_at: '2026-09-18T14:00:00.000Z',
          is_expired: false,
          respuesta_texto: 'Respuesta C — Solo enlace wetransfer',
          responded_at: '2026-09-16T15:00:00.000Z',
          created_at: '2026-09-16T14:00:00.000Z',
          archivos_respuesta: [],
          enlaces_respuesta: [
            {
              id: 'enl-C',
              url: 'https://we.tl/folder-c',
              descripcion: 'WeTransfer C',
              created_at: '2026-09-16T15:00:00.000Z',
            },
          ],
        },
      ],
      archivos: [
        {
          id: 'arch-A',
          nombre_original: 'logo_vector_a.svg',
          size_bytes: 1024,
          mime_type: 'image/svg+xml',
          contexto: 'informacion_respuesta',
          estado: 'verified',
          created_at: '2026-09-16T11:00:00.000Z',
        },
        {
          id: 'arch-B',
          nombre_original: 'manual_marca_b.pdf',
          size_bytes: 2048,
          mime_type: 'application/pdf',
          contexto: 'informacion_respuesta',
          estado: 'verified',
          created_at: '2026-09-16T13:00:00.000Z',
        },
      ],
      enlaces: [
        {
          id: 'enl-A',
          url: 'https://drive.google.com/folder-a',
          descripcion: 'Drive A',
          created_at: '2026-09-16T11:00:00.000Z',
        },
        {
          id: 'enl-B',
          url: 'https://dropbox.com/folder-b',
          descripcion: 'Dropbox B',
          created_at: '2026-09-16T13:00:00.000Z',
        },
        {
          id: 'enl-C',
          url: 'https://we.tl/folder-c',
          descripcion: 'WeTransfer C',
          created_at: '2026-09-16T15:00:00.000Z',
        },
      ],
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoConTresSolicitudes);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // 1. Resumen global consolidado
    expect(screen.getByText('Archivos (2)')).toBeInTheDocument();
    expect(screen.getByText('Enlaces (3)')).toBeInTheDocument();

    // 2. Cada archivo aparece exactamente 2 veces (1 en la lista global lateral + 1 en su tarjeta contextual correspondiente)
    expect(screen.getAllByText(/logo_vector_a\.svg/i).length).toBe(2);
    expect(screen.getAllByText(/manual_marca_b\.pdf/i).length).toBe(2);

    // 3. Cada enlace aparece exactamente 2 veces (1 en la lista global lateral + 1 en su tarjeta contextual correspondiente)
    expect(screen.getAllByText(/drive\.google\.com\/folder-a/i).length).toBe(2);
    expect(screen.getAllByText(/dropbox\.com\/folder-b/i).length).toBe(2);
    expect(screen.getAllByText(/we\.tl\/folder-c/i).length).toBe(2);

    // 4. Aislamiento estricto: Solicitud C no tiene archivos, por lo que no debe renderizar sección de archivos
    // Solicitud A, B y C tienen sus textos exclusivos
    expect(screen.getByText('Requerimiento A — Logo vector')).toBeInTheDocument();
    expect(screen.getByText('Requerimiento B — Manual de marca')).toBeInTheDocument();
    expect(screen.getByText('Requerimiento C — Fotos en alta')).toBeInTheDocument();
  });

  it('15. Pedido en estado Nuevo sin responsable muestra banner obligatorio y botón En revisión deshabilitado', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoSinAsignar: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      responsable_user_id: undefined,
      responsable_nombre: undefined,
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoSinAsignar);
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([
      {
        user_id: 'usr-admin-1',
        nombre: 'Pablo',
        apellido: 'Saldivia',
        nombre_usuario: 'psaldivia',
        app_role: 'administrador',
        estado_acceso: 'aprobado',
      },
      {
        user_id: 'usr-obs-1',
        nombre: 'Observador',
        apellido: 'Prensa',
        nombre_usuario: 'observador',
        app_role: 'observador',
        estado_acceso: 'aprobado',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // Banner de advertencia presente
    expect(screen.getByText(/Asignación pendiente:/i)).toBeInTheDocument();
    expect(screen.getByText(/Este pedido requiere un responsable asignado para comenzar su gestión/i)).toBeInTheDocument();

    // Botón En revisión deshabilitado
    const btnEnRevision = screen.getByRole('button', { name: /^En revisión$/i });
    expect(btnEnRevision).toBeDisabled();
    expect(btnEnRevision).toHaveAttribute('title', 'Debe asignar un responsable antes de pasar a En revisión');

    // Selector solo muestra administradores y equipo, excluye observadores
    expect(screen.getByText(/Pablo Saldivia \(psaldivia\) - administrador/i)).toBeInTheDocument();
    expect(screen.queryByText(/Observador Prensa \(observador\) - observador/i)).not.toBeInTheDocument();
  });

  it('16. Sincronización robusta: Si responsable_user_id no está en users list, incluye opción de respaldo', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      signOut: vi.fn(),
      refreshUser: vi.fn(),
    });

    const pedidoConResponsableExterno: gestionApi.PedidoDetailItem = {
      ...mockPedidoFlyer,
      responsable_user_id: 'usr-legacy-999',
      responsable_nombre: 'Operador Anterior',
    };

    vi.spyOn(gestionApi, 'fetchPedidoById').mockResolvedValue(pedidoConResponsableExterno);
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([
      {
        user_id: 'usr-admin-1',
        nombre: 'Pablo',
        apellido: 'Saldivia',
        nombre_usuario: 'psaldivia',
        app_role: 'administrador',
        estado_acceso: 'aprobado',
      },
    ]);

    render(
      <MemoryRouter initialEntries={['/gestion/pedido/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedido/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('PED-2026-D000155')).toBeInTheDocument();
    });

    // Opción de respaldo presente en el selector
    expect(screen.getByText(/Operador Anterior \(actual\)/i)).toBeInTheDocument();
  });

  it('15. Auth cargando: no ejecuta fetchPedidoById y muestra indicador de verificación de sesión', () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: true,
      isApproved: false,
      isAdmin: false,
      isTeamOrAdmin: false,
      isObserver: false,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });

    const fetchSpy = vi.spyOn(gestionApi, 'fetchPedidoById');

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText(/Verificando sesión/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('16. Usuario no autenticado: no consulta pedidos y redirige a /login con returnTo', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: null,
      isLoading: false,
      isApproved: false,
      isAdmin: false,
      isTeamOrAdmin: false,
      isObserver: false,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });

    const fetchSpy = vi.spyOn(gestionApi, 'fetchPedidoById');

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/ped-d-155?tab=archivos#historial']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
          <Route
            path="/login"
            element={<div data-testid="login-gate">Página de Login Mock</div>}
          />
        </Routes>
      </MemoryRouter>
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('login-gate')).toBeInTheDocument();
    });
  });

  it('17. Usuario autenticado pero no aprobado: no consulta pedidos y muestra tarjeta de acceso restringido', () => {
    const mockPending: UserProfile = {
      userId: 'usr-pen-1',
      email: 'pendiente@medios.tdf.gob.ar',
      nombre: 'Carlos',
      apellido: 'Pérez',
      nombreUsuario: 'cperez',
      appRole: 'observador',
      estadoAcceso: 'pendiente',
    };

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockPending,
      isLoading: false,
      isApproved: false,
      isAdmin: false,
      isTeamOrAdmin: false,
      isObserver: false,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });

    const fetchSpy = vi.spyOn(gestionApi, 'fetchPedidoById');

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/ped-d-155']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('Acceso pendiente')).toBeInTheDocument();
    expect(screen.getByText(/Tu cuenta está en espera de aprobación/i)).toBeInTheDocument();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('18. Usuario aprobado pero pedido inexistente: muestra error "Pedido no encontrado" solo tras confirmar 404 real', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: mockAdminProfile,
      isLoading: false,
      isApproved: true,
      isAdmin: true,
      isTeamOrAdmin: true,
      isObserver: false,
      refreshUser: vi.fn(),
      signOut: vi.fn(),
    });

    vi.spyOn(gestionApi, 'fetchPedidoById').mockRejectedValue(new Error('Pedido no encontrado'));
    vi.spyOn(gestionApi, 'fetchInternalUsers').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/gestion/pedidos/ped-inexistente']}>
        <Routes>
          <Route path="/gestion/pedidos/:id" element={<PedidoDetallePage />} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('Error al cargar el pedido')).toBeInTheDocument();
      expect(screen.getByText('Pedido no encontrado')).toBeInTheDocument();
    });
  });
});



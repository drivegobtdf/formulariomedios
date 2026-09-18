import React from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { FormularioPublicoPage } from '../pages/FormularioPublicoPage';
import { SolicitudRecibidaPage } from '../pages/SolicitudRecibidaPage';
import { MisSolicitudesPage } from '../pages/MisSolicitudesPage';
import { SeguimientoPage } from '../pages/SeguimientoPage';
import { SolicitudInformacionPage } from '../pages/SolicitudInformacionPage';
import { LoginPage } from '../pages/LoginPage';
import { SolicitarAccesoPage } from '../pages/SolicitarAccesoPage';
import { GestionDashboardPage } from '../pages/GestionDashboardPage';
import { PedidoDetallePage } from '../pages/PedidoDetallePage';
import { UsuariosAdminPage } from '../pages/UsuariosAdminPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { ConfirmarEmailPage, readAuthReturn } from '../pages/ConfirmarEmailPage';
import { getPublicConfig } from '../services/config';

const RouterContent: React.FC = () => {
  const location = useLocation();
  const [wasAuthReturn] = React.useState(() => readAuthReturn().hasAuthReturn);

  // Los enlaces antiguos vuelven a la raíz con el resultado en el hash. Se
  // interceptan antes de que la ruta pública pueda renderizar el formulario.
  if (wasAuthReturn && location.pathname !== '/confirmar-email') {
    return <ConfirmarEmailPage />;
  }

  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<FormularioPublicoPage />} />
        <Route path="solicitud-recibida" element={<SolicitudRecibidaPage />} />
        <Route path="mis-solicitudes" element={<MisSolicitudesPage />} />
        <Route path="seguimiento" element={<MisSolicitudesPage />} />
        <Route path="seguimiento-legacy" element={<SeguimientoPage />} />
        <Route path="solicitud-informacion" element={<SolicitudInformacionPage />} />
        <Route path="login" element={<LoginPage />} />
        <Route path="solicitar-acceso" element={<SolicitarAccesoPage />} />
        <Route path="confirmar-email" element={<ConfirmarEmailPage />} />
        <Route path="gestion" element={<GestionDashboardPage />} />
        <Route path="gestion/pedidos/:id" element={<PedidoDetallePage />} />
        <Route path="gestion/pedido/:id" element={<PedidoDetallePage />} />
        <Route path="pedido/:id" element={<PedidoDetallePage />} />
        <Route path="usuarios" element={<UsuariosAdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
};

export const AppRouter: React.FC = () => {
  const config = getPublicConfig();

  return (
    <BrowserRouter basename={config.basePath}>
      <RouterContent />
    </BrowserRouter>
  );
};

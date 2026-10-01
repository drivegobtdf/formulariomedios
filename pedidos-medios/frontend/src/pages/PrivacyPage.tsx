import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

export const PrivacyPage: React.FC = () => {
  useEffect(() => {
    const originalTitle = document.title;
    document.title = 'Política de Privacidad | PEDIDOS — Secretaría de Medios';

    let metaDesc = document.querySelector('meta[name="description"]');
    let originalDesc: string | null = null;
    if (metaDesc) {
      originalDesc = metaDesc.getAttribute('content');
      metaDesc.setAttribute(
        'content',
        'Política de Privacidad del Sistema PEDIDOS de la Secretaría de Medios del Gobierno de Tierra del Fuego AIAS.'
      );
    } else {
      metaDesc = document.createElement('meta');
      metaDesc.setAttribute('name', 'description');
      metaDesc.setAttribute(
        'content',
        'Política de Privacidad del Sistema PEDIDOS de la Secretaría de Medios del Gobierno de Tierra del Fuego AIAS.'
      );
      document.head.appendChild(metaDesc);
    }

    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, behavior: 'instant' });
      } catch {
        // Fallback para entornos de test (jsdom)
      }
    }

    return () => {
      document.title = originalTitle;
      if (metaDesc && originalDesc !== null) {
        metaDesc.setAttribute('content', originalDesc);
      }
    };
  }, []);

  return (
    <div className="pedidos-privacy-container">
      <div className="pedidos-privacy-card">
        <div className="pedidos-privacy-header">
          <div className="pedidos-privacy-back-nav">
            <Link to="/" className="pedidos-privacy-back-link">
              &larr; Volver al Portal Principal
            </Link>
          </div>

          <div className="pedidos-hero-badge" style={{ marginTop: '0.5rem', marginBottom: '0.75rem' }}>
            DOCUMENTO OFICIAL DE PRIVACIDAD
          </div>

          <h1 className="pedidos-privacy-title">POLÍTICA DE PRIVACIDAD</h1>

          <p className="pedidos-privacy-subtitle">
            Sistema PEDIDOS — Secretaría de Medios<br />
            Gobierno de Tierra del Fuego, Antártida e Islas del Atlántico Sur
          </p>

          <p className="pedidos-privacy-date">
            <strong>Última actualización:</strong> 1 de octubre de 2026
          </p>
        </div>

        <div className="pedidos-privacy-content">
          <section className="pedidos-privacy-section">
            <h2>1. Responsable del Sistema</h2>
            <p>
              El sistema <strong>PEDIDOS</strong> es una herramienta oficial operada por la{' '}
              <strong>
                Secretaría de Medios del Gobierno de la Provincia de Tierra del Fuego, Antártida e Islas del Atlántico Sur
              </strong>
              , destinada a la gestión, recepción, tramitación y seguimiento de solicitudes de comunicación, producción audiovisual,
              diseño gráfico, cobertura institucional y servicios conexos para dependencias y organismos públicos.
            </p>
          </section>

          <section className="pedidos-privacy-section">
            <h2>2. Finalidad del Sistema</h2>
            <p>El sistema PEDIDOS tiene como propósitos principales:</p>
            <ul>
              <li>Recibir solicitudes de servicios de comunicación y medios institucionales.</li>
              <li>Gestionar el ciclo de vida y estado de los pedidos recibidos.</li>
              <li>Intercambiar archivos, insumos y requerimientos técnicos entre solicitantes y el equipo de producción.</li>
              <li>Asignar responsables internos y coordinar las tareas operativas.</li>
              <li>Permitir el seguimiento transparente del estado de tramitación de cada solicitud.</li>
              <li>Gestionar y disponibilizar la entrega de materiales terminados.</li>
              <li>Solicitar y responder información o aclaraciones complementarias cuando sea requerido.</li>
              <li>Gestionar revisiones o retrabajos solicitados sobre entregas realizadas.</li>
              <li>Enviar notificaciones operativas vinculadas estrictamente al avance de los pedidos.</li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>3. Datos que Pueden Recopilarse</h2>
            <p>
              El sistema recopila y procesa exclusivamente las categorías de datos estrictamente necesarias para la gestión
              operativa de las solicitudes y la autenticación de usuarios:
            </p>
            <ul>
              <li>
                <strong>Datos de contacto del solicitante:</strong> Nombre y apellido, correo electrónico institucional o de
                contacto, número de teléfono / WhatsApp para coordinación operativa y área u organismo solicitante.
              </li>
              <li>
                <strong>Información técnica y descriptiva del pedido:</strong> Fechas solicitadas, descripciones, pautas de
                diseño o cobertura, lugares de realización y textos aportados.
              </li>
              <li>
                <strong>Archivos adjuntos y enlaces:</strong> Documentos, imágenes, logotipos y referencias aportadas por los
                solicitantes como insumo de trabajo.
              </li>
              <li>
                <strong>Datos de usuarios internos:</strong> Credenciales de acceso, nombre de usuario, nombre y apellido, correo
                electrónico y roles de permisos para el personal autorizado a gestionar solicitudes.
              </li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>4. Autenticación y Control de Acceso</h2>
            <p>
              Para el acceso del personal interno al módulo de gestión y administración, se utiliza la plataforma{' '}
              <strong>Supabase Auth</strong>. El sistema implementa:
            </p>
            <ul>
              <li>Confirmación obligatoria de correo electrónico para la activación de cuentas.</li>
              <li>Aprobación administrativa previa de las solicitudes de acceso por parte de administradores habilitados.</li>
              <li>Control de acceso basado en roles (RBAC) con permisos restringidos según el perfil operativo.</li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>5. Integración con Google Drive</h2>
            <p>
              El sistema PEDIDOS utiliza la API de <strong>Google Drive</strong> para el almacenamiento y la gestión segura de
              archivos aportados como insumos por los solicitantes, así como de los materiales finales entregados por el equipo.
            </p>
            <p>Respecto del uso de Google Drive y los servicios de Google:</p>
            <ul>
              <li>
                <strong>Alcance exclusivo:</strong> El acceso de la aplicación a Google Drive se limita estrictamente a los
                archivos y carpetas creados, subidos o gestionados directamente por el propio sistema PEDIDOS (alcance de acceso{' '}
                <code>drive.file</code>). La aplicación no accede, lee ni modifica archivos personales ni ajenos al sistema.
              </li>
              <li>
                <strong>Sin fines publicitarios:</strong> Los datos y archivos almacenados en Google Drive nunca son utilizados con
                fines publicitarios ni de mercadeo.
              </li>
              <li>
                <strong>No comercialización:</strong> La Secretaría de Medios no vende, comercializa ni transfiere datos ni
                archivos a terceros.
              </li>
              <li>
                <strong>No uso para entrenamiento de IA:</strong> Ningún archivo, texto o contenido gestionado a través de Google
                Drive es utilizado para entrenar modelos de Inteligencia Artificial (IA) o aprendizaje automático.
              </li>
              <li>
                <strong>Uso estrictamente operativo:</strong> El acceso a Google Drive se utiliza de forma exclusiva para permitir
                la carga, descarga y entrega de materiales solicitados en el marco del servicio institucional.
              </li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>6. Proveedores y Servicios Utilizados</h2>
            <p>Para su funcionamiento técnico, el sistema se apoya en los siguientes proveedores y servicios de infraestructura:</p>
            <ul>
              <li>
                <strong>Supabase:</strong> Plataforma para la autenticación de usuarios internos, base de datos relacional y
                ejecución de funciones backend protegidas.
              </li>
              <li>
                <strong>Google Drive:</strong> Infraestructura para el almacenamiento protegido de insumos y entregas de archivos.
              </li>
              <li>
                <strong>Gmail / Google:</strong> Servicio para el despacho de comunicaciones y notificaciones operativas por correo
                electrónico.
              </li>
              <li>
                <strong>Cloudflare Pages:</strong> Plataforma de publicación y distribución segura del frontend web mediante
                conexiones cifradas HTTPS.
              </li>
              <li>
                <strong>n8n:</strong> Motor de automatización y despacho de comunicaciones operativas vinculadas a eventos del
                sistema.
              </li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>7. Finalidad y Uso de los Datos</h2>
            <p>Los datos ingresados se utilizan exclusivamente para:</p>
            <ul>
              <li>Prestar el servicio de comunicación, diseño o cobertura solicitado.</li>
              <li>Gestionar y tramitar internamente el pedido en sus distintas etapas.</li>
              <li>Permitir el seguimiento del estado de tramitación por parte del solicitante.</li>
              <li>Establecer comunicación directa para coordinar entregas o aclaraciones técnicas.</li>
              <li>Disponibilizar las entregas de materiales digitales terminados.</li>
              <li>Mantener la trazabilidad institucional, auditoría y seguridad del servicio.</li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>8. Conservación de los Datos</h2>
            <p>
              Los datos y archivos se conservan durante el tiempo necesario para la operación, trazabilidad, gestión
              administrativa y cumplimiento de las necesidades institucionales aplicables.
            </p>
          </section>

          <section className="pedidos-privacy-section">
            <h2>9. Seguridad de la Información</h2>
            <p>
              Se aplican medidas de seguridad técnicas y organizativas orientadas a proteger la información contra accesos no
              autorizados, pérdida, alteración o divulgación indebida. Esto incluye:
            </p>
            <ul>
              <li>Cifrado de comunicaciones mediante protocolo seguro HTTPS / TLS.</li>
              <li>Políticas de seguridad a nivel de base de datos (Row Level Security - RLS).</li>
              <li>Controles estrictos de autorización y autenticación por roles.</li>
              <li>Registro de eventos y trazabilidad en logs de auditoría.</li>
              <li>Aislamiento de credenciales y claves de seguridad en entornos protegidos.</li>
            </ul>
          </section>

          <section className="pedidos-privacy-section">
            <h2>10. Derechos y Consultas</h2>
            <p>
              Para consultas relacionadas con el tratamiento de datos en este sistema o el ejercicio de derechos vinculados a la
              privacidad de la información, puede comunicarse con la Secretaría de Medios a través de los canales institucionales
              disponibles del Gobierno de la Provincia de Tierra del Fuego, Antártida e Islas del Atlántico Sur.
            </p>
          </section>

          <section className="pedidos-privacy-section">
            <h2>11. Cambios a esta Política</h2>
            <p>
              Esta Política de Privacidad puede actualizarse para reflejar cambios operativos, técnicos o normativos. La versión
              vigente será la publicada en esta página.
            </p>
          </section>
        </div>

        <div className="pedidos-privacy-footer-nav">
          <Link to="/" className="pedidos-btn-hero-primary" style={{ display: 'inline-block', textDecoration: 'none' }}>
            Volver al Portal Principal
          </Link>
        </div>
      </div>
    </div>
  );
};

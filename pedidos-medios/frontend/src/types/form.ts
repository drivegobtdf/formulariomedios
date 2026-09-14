/**
 * Tipos de datos para el Formulario Público de Servicios (Revisión 3.0)
 * Proyecto: PEDIDOS — Secretaría de Medios
 */

export type CategoriaSlug =
  | 'diseno_grafico'
  | 'cobertura_eventos'
  | 'gacetilla'
  | 'redes_sociales'
  | 'produccion_audiovisual'
  | 'motion_graphics'
  | 'streaming'
  | 'sitios_web';

export type CategoriaCodigo = 'D' | 'C' | 'G' | 'R' | 'P' | 'M' | 'S' | 'W';

export interface CategoriaMeta {
  slug: CategoriaSlug;
  codigo: CategoriaCodigo;
  nombre: string;
  descripcion: string;
  soportaAsesoramiento?: boolean;
}

export const CATEGORIAS_CONFIG: CategoriaMeta[] = [
  {
    slug: 'diseno_grafico',
    codigo: 'D',
    nombre: 'Diseño gráfico',
    descripcion: 'Flyers para redes, invitaciones digitales, certificados, diplomas y piezas gráficas.',
  },
  {
    slug: 'cobertura_eventos',
    codigo: 'C',
    nombre: 'Cobertura de eventos',
    descripcion: 'Cobertura fotográfica, audiovisual y periodística de actos y actividades oficiales.',
  },
  {
    slug: 'gacetilla',
    codigo: 'G',
    nombre: 'Gacetilla de prensa',
    descripcion: 'Redacción y difusión de gacetillas y comunicados de prensa institucional.',
  },
  {
    slug: 'redes_sociales',
    codigo: 'R',
    nombre: 'Publicaciones en redes sociales',
    descripcion: 'Publicación de contenidos y copys en canales oficiales de redes sociales.',
  },
  {
    slug: 'produccion_audiovisual',
    codigo: 'P',
    nombre: 'Producción audiovisual',
    descripcion: 'Videos institucionales, entrevistas, reels y edición de material audiovisual.',
    soportaAsesoramiento: true,
  },
  {
    slug: 'motion_graphics',
    codigo: 'M',
    nombre: 'Animación y motion graphics',
    descripcion: 'Placas animadas, títulos, infografías en movimiento y videos explicativos.',
    soportaAsesoramiento: true,
  },
  {
    slug: 'streaming',
    codigo: 'S',
    nombre: 'Transmisión en vivo / streaming',
    descripcion: 'Transmisión de eventos, salas virtuales (Zoom, Meet) y streaming en directo.',
    soportaAsesoramiento: true,
  },
  {
    slug: 'sitios_web',
    codigo: 'W',
    nombre: 'Sitios y contenidos web',
    descripcion: 'Creación y actualización de páginas web, landing pages y formularios.',
    soportaAsesoramiento: true,
  },
];

export type DisenoPiezaSlug = 'flyer_rrss' | 'invitacion_digital' | 'certificado' | 'otros_diseno';

export interface DisenoPiezaMeta {
  slug: DisenoPiezaSlug;
  nombre: string;
  descripcion: string;
}

export const DISENO_PIEZAS_CONFIG: DisenoPiezaMeta[] = [
  {
    slug: 'flyer_rrss',
    nombre: 'Flyer para redes sociales',
    descripcion: 'Formato, texto general y fecha límite de publicación.',
  },
  {
    slug: 'invitacion_digital',
    nombre: 'Invitación digital',
    descripcion: 'Evento, fecha, hora, lugar, modalidad y programa.',
  },
  {
    slug: 'certificado',
    nombre: 'Certificados y diplomas',
    descripcion: 'Nombre de actividad, autoridades firmantes y lista de destinatarios.',
  },
  {
    slug: 'otros_diseno',
    nombre: 'Otros requerimientos gráficos',
    descripcion: 'Descripción libre de la pieza y medidas o soporte técnico.',
  },
];

export interface ContactoFormState {
  nombre_apellido: string;
  telefono: string;
  telefono_pais?: string;
  telefono_local?: string;
  correo: string;
  area_solicitante: string;
}

// -----------------------------------------------------------------------------
// Modelos de datos específicos por pieza
// -----------------------------------------------------------------------------

export interface FlyerRrssData {
  formato: string;
  texto: string;
  fecha_limite: string;
}

export interface InvitacionDigitalData {
  nombre_evento: string;
  fecha: string;
  hora: string;
  lugar: string;
  modalidad: 'Presencial' | 'Virtual' | 'Híbrida' | '';
  programa: string;
}

export interface CertificadoData {
  nombre_actividad: string;
  firmantes: string;
  destinatarios: string;
}

export interface OtrosDisenoData {
  descripcion: string;
  medidas_soporte: string;
}

export interface CoberturaEventosData {
  fecha: string;
  hora_inicio: string;
  hora_fin?: string;
  lugar: string;
  ciudad: 'Ushuaia' | 'Río Grande' | 'Tolhuin' | '';
  autoridades: string;
  requerimientos: string;
}

export interface GacetillaData {
  referente_contacto: string;
  telefono_contacto: string;
  informacion_base: string;
}

export interface RedesSocialesData {
  fecha_sugerida: string;
  texto_copy: string;
  enlaces_referencia?: string;
}

export interface AsesoramientoFields {
  requiere_asesoramiento: boolean;
  objetivo_asesoramiento?: string;
  contacto_preferido?: 'whatsapp' | 'email';
}

export interface ProduccionAudiovisualData extends AsesoramientoFields {
  tipo_produccion?: string;
  descripcion_objetivo?: string;
  formato?: string;
  fecha_limite?: string;
  requiere_grabacion?: boolean;
  grabacion_fecha?: string;
  grabacion_hora?: string;
  grabacion_lugar?: string;
  grabacion_ciudad?: 'Ushuaia' | 'Río Grande' | 'Tolhuin' | '';
  material_enlace?: string;
}

export interface MotionGraphicsData extends AsesoramientoFields {
  tipo_motion?: string;
  texto_contenido?: string;
  descripcion?: string;
  formato?: string;
  duracion_aprox?: string;
  fecha_limite?: string;
  referencias?: string;
}

export interface StreamingData extends AsesoramientoFields {
  tipo_streaming?: string;
  nombre_evento?: string;
  fecha?: string;
  hora_inicio?: string;
  hora_fin?: string;
  modalidad?: 'Presencial' | 'Virtual' | 'Híbrida' | '';
  descripcion_requerimientos?: string;
  lugar?: string;
  ciudad?: 'Ushuaia' | 'Río Grande' | 'Tolhuin' | '';
  participantes_estimados?: string;
}

export interface SitiosWebData extends AsesoramientoFields {
  tipo_web?: string;
  descripcion_objetivo?: string;
  pagina_existente?: boolean;
  url_pagina?: string;
  contenido_cambios?: string;
  fecha_limite?: string;
  enlaces_referencia?: string;
}

// -----------------------------------------------------------------------------
// Pieza en el Wizard
// -----------------------------------------------------------------------------

export type PiezaData =
  | FlyerRrssData
  | InvitacionDigitalData
  | CertificadoData
  | OtrosDisenoData
  | CoberturaEventosData
  | GacetillaData
  | RedesSocialesData
  | ProduccionAudiovisualData
  | MotionGraphicsData
  | StreamingData
  | SitiosWebData
  | Record<string, unknown>;

export interface FormPieceItem {
  client_request_ref: string;
  categoria_slug: CategoriaSlug;
  tipo_slug: string;
  piece_title: string;
  codigo_ped_prefijo: CategoriaCodigo;
  data: PiezaData;
}

// -----------------------------------------------------------------------------
// Archivos y Links
// -----------------------------------------------------------------------------

export interface FormUploadedFile {
  client_file_ref: string;
  file?: File;
  name: string;
  size: number;
  mime: string;
  status: 'pending' | 'uploading' | 'verified' | 'error';
  progress: number;
  error_message?: string;
  archivo_id?: string;
  drive_file_id?: string;
  reservation_id?: string;
  targets: 'all' | string[]; // 'all' o array de client_request_ref
}

export interface FormLinkItem {
  id: string;
  url: string;
  descripcion?: string;
  targets: 'all' | string[];
}

// -----------------------------------------------------------------------------
// Estado Global del Wizard
// -----------------------------------------------------------------------------

export interface FormWizardState {
  submission_key: string;
  session_id?: string;
  capability_token?: string;
  current_step: number; // 1 | 2 | 3 | 4 | 5
  contacto: ContactoFormState;
  selected_categorias: CategoriaSlug[];
  diseno_piezas: DisenoPiezaSlug[];
  // Datos específicos indexados por pieza o categoría
  diseno_data: {
    flyer_rrss?: FlyerRrssData;
    invitacion_digital?: InvitacionDigitalData;
    certificado?: CertificadoData;
    otros_diseno?: OtrosDisenoData;
  };
  cobertura_data?: CoberturaEventosData;
  gacetilla_data?: GacetillaData;
  redes_data?: RedesSocialesData;
  audiovisual_data?: ProduccionAudiovisualData;
  motion_data?: MotionGraphicsData;
  streaming_data?: StreamingData;
  web_data?: SitiosWebData;
  archivos: FormUploadedFile[];
  links: FormLinkItem[];
  confirmado: boolean;
  submitting: boolean;
  submission_error?: string;
  submission_result?: SubmissionResponsePayload;
}

// -----------------------------------------------------------------------------
// Payload de Creación y Respuesta
// -----------------------------------------------------------------------------

export interface SubmissionPayload {
  schema_version: number;
  submission_key: string;
  session_id?: string;
  capability_token?: string;
  contacto: ContactoFormState;
  pedidos: Array<{
    client_request_ref: string;
    categoria_slug: string;
    tipo_slug: string;
    informacion_especifica: PiezaData;
  }>;
  file_bindings: Array<{
    client_file_ref: string;
    expected_name: string;
    expected_size: number;
    mime_type: string;
    targets: 'all' | string[];
  }>;
  material_links?: Array<{
    url: string;
    descripcion?: string;
    targets: 'all' | string[];
  }>;
}

export interface RawBackendPedido {
  id?: string;
  pedido_id?: string;
  client_request_ref: string;
  pedido_visible?: string;
  codigo_ped?: string;
  categoria_slug: string;
  tipo_slug: string;
  tracking_token?: string | null;
  tracking_recovery_required?: boolean;
}

export interface RawBackendSubmissionResponse {
  envio_id: string;
  submission_key?: string;
  idempotent_replay?: boolean;
  pedidos: RawBackendPedido[];
  archivos?: Array<{
    id?: string;
    archivo_id?: string;
    client_file_ref: string;
    nombre_original?: string;
    nombre?: string;
    mime_type?: string;
    size_bytes?: number;
  }>;
  archivos_count?: number;
}

export interface FrontendPedidoItem {
  pedido_id: string;
  codigo_ped: string;
  client_request_ref: string;
  categoria_slug: string;
  tipo_slug: string;
}

export interface SubmissionResponsePayload {
  envio_id: string;
  submission_key?: string;
  idempotent_replay: boolean;
  pedidos: FrontendPedidoItem[];
  archivos?: Array<{
    archivo_id: string;
    client_file_ref: string;
    nombre: string;
  }>;
  archivos_count?: number;
}

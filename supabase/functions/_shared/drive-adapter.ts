import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { getEnv } from './env.ts';

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  md5Checksum?: string;
  appProperties?: Record<string, string>;
  parents?: string[];
  trashed?: boolean;
  webViewLink?: string;
}

export interface ResumableSessionResult {
  uploadUrl: string;
  driveFileId?: string;
}

export interface FileVerificationResult {
  verified: boolean;
  file?: GoogleDriveFile;
  error?: string;
}

export interface FileDownloadStreamResult {
  stream: ReadableStream<Uint8Array> | NodeJS.ReadableStream;
  mimeType: string;
  size: number;
  name: string;
}

export interface DriveAdapter {
  getAccessToken(): Promise<string>;
  ensureRootFolder(folderName?: string): Promise<string>;
  ensureStagingFolder(rootFolderId: string, stagingFolderName?: string): Promise<string>;
  createResumableUploadSession(options: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    parentFolderId: string;
    appProperties?: Record<string, string>;
  }): Promise<ResumableSessionResult>;
  verifyUploadedFile(
    fileId: string,
    expected: {
      name?: string;
      size: number;
      mimeType: string;
      stagingFolderId?: string;
      appProperties?: Record<string, string>;
    }
  ): Promise<FileVerificationResult>;
  downloadFileStream(fileId: string): Promise<FileDownloadStreamResult>;
}

/**
 * Adaptador oficial para Google Drive API v3 con OAuth 2.0 Web Server Flow y scope drive.file
 */
export class GoogleDriveAdapter implements DriveAdapter {
  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private cachedAccessToken: string | null = null;
  private tokenExpiresAt = 0;
  private rootFolderId: string | null = null;
  private stagingFolderId: string | null = null;

  constructor(options?: {
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    rootFolderId?: string;
  }) {
    this.clientId = options?.clientId || getEnv('GOOGLE_CLIENT_ID') || '';
    this.clientSecret = options?.clientSecret || getEnv('GOOGLE_CLIENT_SECRET') || '';
    this.refreshToken = options?.refreshToken || getEnv('GOOGLE_REFRESH_TOKEN') || '';
    this.rootFolderId = options?.rootFolderId || getEnv('GOOGLE_DRIVE_ROOT_FOLDER_ID') || null;
  }

  /**
   * Obtiene un Access Token efímero renovándolo mediante el Refresh Token server-side
   */
  async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedAccessToken && this.tokenExpiresAt > now + 60000) {
      return this.cachedAccessToken;
    }

    if (!this.clientId || !this.clientSecret || !this.refreshToken) {
      throw new Error('CONFIG_ERROR: Credenciales de Google OAuth (CLIENT_ID, CLIENT_SECRET, REFRESH_TOKEN) no configuradas');
    }

    const bodyParams = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.refreshToken,
      grant_type: 'refresh_token',
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString(),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`GOOGLE_OAUTH_ERROR: Error al renovar access token: ${response.status} ${errText}`);
    }

    const data = (await response.json()) as { access_token: string; expires_in: number };
    this.cachedAccessToken = data.access_token;
    this.tokenExpiresAt = now + data.expires_in * 1000;

    return this.cachedAccessToken;
  }

  /**
   * Asegura la existencia de la carpeta raíz de la aplicación en Google Drive
   */
  async ensureRootFolder(folderName = 'PEDIDOS'): Promise<string> {
    if (this.rootFolderId) return this.rootFolderId;

    const token = await this.getAccessToken();

    // Buscar si ya existe la carpeta
    const query = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${folderName}' and trashed = false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as { files: Array<{ id: string; name: string }> };
      if (searchData.files && searchData.files.length > 0) {
        this.rootFolderId = searchData.files[0].id;
        return this.rootFolderId;
      }
    }

    // Crear la carpeta raíz si no existe
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`DRIVE_FOLDER_ERROR: Error al crear carpeta raíz: ${createRes.status} ${errText}`);
    }

    const createdData = (await createRes.json()) as { id: string };
    this.rootFolderId = createdData.id;
    return this.rootFolderId;
  }

  /**
   * Asegura la existencia de la subcarpeta de staging (_incoming) dentro de la carpeta raíz
   */
  async ensureStagingFolder(rootFolderId: string, stagingFolderName = '_incoming'): Promise<string> {
    if (this.stagingFolderId) return this.stagingFolderId;

    const token = await this.getAccessToken();

    const query = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${stagingFolderName}' and '${rootFolderId}' in parents and trashed = false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as { files: Array<{ id: string; name: string }> };
      if (searchData.files && searchData.files.length > 0) {
        this.stagingFolderId = searchData.files[0].id;
        return this.stagingFolderId;
      }
    }

    // Crear carpeta _incoming
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: stagingFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`DRIVE_STAGING_ERROR: Error al crear carpeta staging: ${createRes.status} ${errText}`);
    }

    const createdData = (await createRes.json()) as { id: string };
    this.stagingFolderId = createdData.id;
    return this.stagingFolderId;
  }

  /**
   * Inicia una sesión de subida resumible en Google Drive API
   */
  async createResumableUploadSession(options: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    parentFolderId: string;
    appProperties?: Record<string, string>;
  }): Promise<ResumableSessionResult> {
    const token = await this.getAccessToken();

    const metadata = {
      name: options.fileName,
      mimeType: options.mimeType,
      parents: [options.parentFolderId],
      appProperties: options.appProperties || {},
    };

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': options.mimeType,
        'X-Upload-Content-Length': options.fileSize.toString(),
      },
      body: JSON.stringify(metadata),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`DRIVE_UPLOAD_SESSION_ERROR: No se pudo iniciar sesión resumable: ${response.status} ${errText}`);
    }

    const uploadUrl = response.headers.get('Location');
    if (!uploadUrl) {
      throw new Error('DRIVE_UPLOAD_SESSION_ERROR: Respuesta de Google Drive no contiene cabecera Location');
    }

    return { uploadUrl };
  }

  /**
   * Verifica la metadata de un archivo subido directamente a Google Drive
   */
  async verifyUploadedFile(
    fileId: string,
    expected: {
      name?: string;
      size: number;
      mimeType: string;
      stagingFolderId?: string;
      appProperties?: Record<string, string>;
    }
  ): Promise<FileVerificationResult> {
    const token = await this.getAccessToken();

    const fields = 'id,name,mimeType,size,md5Checksum,appProperties,parents,trashed';
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return { verified: false, error: `Archivo no encontrado en Google Drive (${response.status})` };
    }

    const file = (await response.json()) as {
      id: string;
      name: string;
      mimeType: string;
      size?: string;
      md5Checksum?: string;
      appProperties?: Record<string, string>;
      parents?: string[];
      trashed?: boolean;
    };

    if (file.trashed) {
      return { verified: false, error: 'El archivo en Google Drive se encuentra en la papelera' };
    }

    const actualSize = Number(file.size || 0);
    if (actualSize !== expected.size) {
      return {
        verified: false,
        error: `Tamaño no coincide: esperado ${expected.size} bytes, real ${actualSize} bytes`,
      };
    }

    if (expected.stagingFolderId && file.parents && !file.parents.includes(expected.stagingFolderId)) {
      return { verified: false, error: 'El archivo no se encuentra en la carpeta staging autorizada' };
    }

    if (expected.appProperties && file.appProperties) {
      for (const [key, val] of Object.entries(expected.appProperties)) {
        if (file.appProperties[key] !== val) {
          return { verified: false, error: `appProperty ${key} no coincide` };
        }
      }
    }

    const driveFile: GoogleDriveFile = {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      size: actualSize,
      md5Checksum: file.md5Checksum,
      appProperties: file.appProperties,
      parents: file.parents,
      trashed: file.trashed,
    };

    return { verified: true, file: driveFile };
  }

  /**
   * Descarga el stream binario de un archivo autorizado desde Google Drive
   */
  async downloadFileStream(fileId: string): Promise<FileDownloadStreamResult> {
    const token = await this.getAccessToken();

    // Obtener metadata
    const metaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,mimeType,size`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!metaRes.ok) {
      throw new Error(`DRIVE_DOWNLOAD_ERROR: No se encontró metadata del archivo ${fileId}`);
    }

    const meta = (await metaRes.json()) as { id: string; name: string; mimeType: string; size?: string };

    // Obtener media stream
    const mediaRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!mediaRes.ok || !mediaRes.body) {
      throw new Error(`DRIVE_DOWNLOAD_ERROR: Error al obtener contenido del archivo ${fileId}`);
    }

    return {
      stream: mediaRes.body,
      mimeType: meta.mimeType || 'application/octet-stream',
      size: Number(meta.size || 0),
      name: meta.name || 'archivo',
    };
  }
}

/**
 * Adaptador Mock determinístico de Google Drive para pruebas locales y CI/CD reproducible
 */
export class MockDriveAdapter implements DriveAdapter {
  private inMemoryFiles = new Map<string, {
    metadata: GoogleDriveFile;
    content: Buffer;
  }>();

  private activeUploadSessions = new Map<string, {
    options: {
      fileName: string;
      mimeType: string;
      fileSize: number;
      parentFolderId: string;
      appProperties?: Record<string, string>;
    };
    driveFileId: string;
    expiresAt: number;
  }>();

  async getAccessToken(): Promise<string> {
    return 'mock_access_token_' + crypto.randomBytes(8).toString('hex');
  }

  async ensureRootFolder(folderName = 'PEDIDOS'): Promise<string> {
    return `mock_root_folder_${folderName.toLowerCase()}`;
  }

  async ensureStagingFolder(rootFolderId: string, stagingFolderName = '_incoming'): Promise<string> {
    return `mock_staging_folder_${rootFolderId}_${stagingFolderName}`;
  }

  async createResumableUploadSession(options: {
    fileName: string;
    mimeType: string;
    fileSize: number;
    parentFolderId: string;
    appProperties?: Record<string, string>;
  }): Promise<ResumableSessionResult> {
    const sessionId = crypto.randomUUID();
    const driveFileId = `mock_drive_file_${crypto.randomUUID()}`;

    this.activeUploadSessions.set(sessionId, {
      options,
      driveFileId,
      expiresAt: Date.now() + 7200 * 1000,
    });

    // Simular URL de sesión resumible
    const baseUrl = getEnv('MOCK_DRIVE_SERVER_URL') || 'http://127.0.0.1:54351/mock-drive-upload';
    const uploadUrl = `${baseUrl}?session_id=${sessionId}&file_id=${driveFileId}`;

    return { uploadUrl, driveFileId };
  }

  /**
   * Permite inyectar contenido subido en el mock (usado por el endpoint mock o tests)
   */
  storeFileBuffer(fileId: string, name: string, mimeType: string, content: Buffer, appProperties?: Record<string, string>, parentFolderId?: string): GoogleDriveFile {
    const file: GoogleDriveFile = {
      id: fileId,
      name,
      mimeType,
      size: content.length,
      md5Checksum: crypto.createHash('md5').update(content).digest('hex'),
      appProperties: appProperties || {},
      parents: parentFolderId ? [parentFolderId] : ['mock_staging_folder'],
      trashed: false,
    };

    this.inMemoryFiles.set(fileId, { metadata: file, content });
    return file;
  }

  async verifyUploadedFile(
    fileId: string,
    expected: {
      name?: string;
      size: number;
      mimeType: string;
      stagingFolderId?: string;
      appProperties?: Record<string, string>;
    }
  ): Promise<FileVerificationResult> {
    const entry = this.inMemoryFiles.get(fileId);

    // Si no está cargado físicamente en memoria pero proviene de una sesión mock válida, registrarlo sintéticamente
    if (!entry) {
      // Buscar si proviene de una sesión activa
      let foundSession: {
        options: {
          fileName: string;
          mimeType: string;
          fileSize: number;
          parentFolderId: string;
          appProperties?: Record<string, string>;
        };
        driveFileId: string;
      } | undefined;
      for (const s of this.activeUploadSessions.values()) {
        if (s.driveFileId === fileId) {
          foundSession = s;
          break;
        }
      }

      if (foundSession) {
        const syntheticBuffer = Buffer.alloc(expected.size);
        const synthFile = this.storeFileBuffer(
          fileId,
          foundSession.options.fileName,
          foundSession.options.mimeType,
          syntheticBuffer,
          foundSession.options.appProperties,
          foundSession.options.parentFolderId
        );
        return { verified: true, file: synthFile };
      }

      return { verified: false, error: `Archivo mock ${fileId} no encontrado` };
    }

    const file = entry.metadata;
    if (file.trashed) {
      return { verified: false, error: 'El archivo mock se encuentra en la papelera' };
    }

    if (file.size !== expected.size) {
      return { verified: false, error: `Tamaño mock no coincide: esperado ${expected.size}, real ${file.size}` };
    }

    if (expected.stagingFolderId && file.parents && !file.parents.includes(expected.stagingFolderId)) {
      return { verified: false, error: 'El archivo mock no se encuentra en la carpeta staging esperada' };
    }

    if (expected.appProperties && file.appProperties) {
      for (const [key, val] of Object.entries(expected.appProperties)) {
        if (file.appProperties[key] !== val) {
          return { verified: false, error: `appProperty mock ${key} no coincide` };
        }
      }
    }

    return { verified: true, file };
  }

  async downloadFileStream(fileId: string): Promise<FileDownloadStreamResult> {
    const entry = this.inMemoryFiles.get(fileId);
    if (!entry) {
      throw new Error(`DRIVE_DOWNLOAD_ERROR: Archivo mock ${fileId} no existe en memoria`);
    }

    const readable = Readable.from(entry.content);

    return {
      stream: readable,
      mimeType: entry.metadata.mimeType,
      size: entry.metadata.size,
      name: entry.metadata.name,
    };
  }
}

// Singleton de adaptadores
let defaultAdapterInstance: DriveAdapter | null = null;

export function getDriveAdapter(): DriveAdapter {
  if (defaultAdapterInstance) return defaultAdapterInstance;

  const useMock = getEnv('USE_DRIVE_MOCK') === 'true' ||
    !getEnv('GOOGLE_CLIENT_ID') ||
    !getEnv('GOOGLE_CLIENT_SECRET') ||
    !getEnv('GOOGLE_REFRESH_TOKEN');

  if (useMock) {
    defaultAdapterInstance = new MockDriveAdapter();
  } else {
    defaultAdapterInstance = new GoogleDriveAdapter();
  }

  return defaultAdapterInstance;
}

export function setDriveAdapter(adapter: DriveAdapter): void {
  defaultAdapterInstance = adapter;
}

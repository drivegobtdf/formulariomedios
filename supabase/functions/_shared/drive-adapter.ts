import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getEnv, getSupabaseConfig } from './env.ts';

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

export interface DriveItemCleanupResult {
  success: boolean;
  status: 'deleted' | 'already_missing' | 'failed';
  httpStatus?: number;
  error?: string;
}

export interface DriveAdapter {
  getAccessToken(): Promise<string>;
  ensureRootFolder(folderName?: string): Promise<string>;
  ensureStagingFolder(rootFolderId: string, stagingFolderName?: string): Promise<string>;
  ensureFolder(parentFolderId: string, folderName: string): Promise<string>;
  moveFile(fileId: string, targetFolderId: string, sourceFolderId?: string): Promise<void>;
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
  deleteItem(fileOrFolderId: string): Promise<boolean>;
  trashItem(fileOrFolderId: string): Promise<DriveItemCleanupResult>;
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
    const effectiveName = getEnv('GOOGLE_DRIVE_ROOT_FOLDER_NAME') || folderName || 'PEDIDOS';
    if (this.rootFolderId) return this.rootFolderId;

    const token = await this.getAccessToken();

    // Buscar si ya existe la carpeta
    const query = encodeURIComponent(`mimeType = 'application/vnd.google-apps.folder' and name = '${effectiveName}' and trashed = false`);
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
        name: effectiveName,
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
   * Asegura la existencia de una carpeta específica bajo una carpeta padre en Google Drive
   */
  async ensureFolder(parentFolderId: string, folderName: string): Promise<string> {
    const token = await this.getAccessToken();

    const sanitizedName = folderName.replace(/'/g, "\\'");
    const query = encodeURIComponent(
      `mimeType = 'application/vnd.google-apps.folder' and name = '${sanitizedName}' and '${parentFolderId}' in parents and trashed = false`
    );
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)&spaces=drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (searchRes.ok) {
      const searchData = (await searchRes.json()) as { files: Array<{ id: string; name: string }> };
      if (searchData.files && searchData.files.length > 0) {
        return searchData.files[0].id;
      }
    }

    // Crear la carpeta si no existe
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parentFolderId],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new Error(`DRIVE_FOLDER_ERROR: Error al crear carpeta '${folderName}': ${createRes.status} ${errText}`);
    }

    const createdData = (await createRes.json()) as { id: string };
    return createdData.id;
  }

  /**
   * Mueve un archivo de Google Drive agregando targetFolderId y removiendo sourceFolderId
   */
  async moveFile(fileId: string, targetFolderId: string, sourceFolderId?: string): Promise<void> {
    const token = await this.getAccessToken();

    let removeParents = sourceFolderId || '';

    // Si no se proporcionó el folder origen, consultar los parents actuales del archivo
    if (!removeParents) {
      const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (getRes.ok) {
        const data = (await getRes.json()) as { parents?: string[] };
        if (data.parents && data.parents.length > 0) {
          if (data.parents.includes(targetFolderId)) {
            return;
          }
          removeParents = data.parents.join(',');
        }
      }
    }

    const patchUrl = new URL(`https://www.googleapis.com/drive/v3/files/${fileId}`);
    patchUrl.searchParams.set('addParents', targetFolderId);
    if (removeParents) {
      patchUrl.searchParams.set('removeParents', removeParents);
    }
    patchUrl.searchParams.set('fields', 'id,parents');

    const patchRes = await fetch(patchUrl.toString(), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!patchRes.ok) {
      const errText = await patchRes.text();
      throw new Error(`DRIVE_MOVE_ERROR: Error al mover archivo ${fileId} a carpeta ${targetFolderId}: ${patchRes.status} ${errText}`);
    }
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
        if (file.appProperties[key] && file.appProperties[key] !== val) {
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

  /**
   * Mueve un archivo o carpeta a la papelera de Google Drive de forma segura (recuperable)
   */
  async trashItem(fileOrFolderId: string): Promise<DriveItemCleanupResult> {
    if (!fileOrFolderId || !fileOrFolderId.trim()) {
      return { success: true, status: 'already_missing' };
    }
    const id = fileOrFolderId.trim();
    try {
      const token = await this.getAccessToken();
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?supportsAllDrives=true`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trashed: true }),
      });

      if (res.status === 200) {
        return { success: true, status: 'deleted', httpStatus: 200 };
      }
      if (res.status === 404) {
        return { success: true, status: 'already_missing', httpStatus: 404 };
      }
      const errText = await res.text().catch(() => '');
      return {
        success: false,
        status: 'failed',
        httpStatus: res.status,
        error: `Drive trash HTTP ${res.status}: ${errText.slice(0, 300)}`,
      };
    } catch (err: any) {
      return {
        success: false,
        status: 'failed',
        error: err.message || 'Error de conexión con Google Drive',
      };
    }
  }

  /**
   * Elimina un archivo o carpeta en Google Drive de forma idempotente
   */
  async deleteItem(fileOrFolderId: string): Promise<boolean> {
    const res = await this.trashItem(fileOrFolderId);
    return res.success;
  }
}

/**
 * Directorio de almacenamiento persistente para MockDriveAdapter en entorno LOCAL.
 * Resuelve de forma determinística a .mock_drive_storage en la raíz del proyecto.
 */
export function getMockStorageDir(): string {
  const envDir = getEnv('MOCK_DRIVE_STORAGE_DIR');
  if (envDir && envDir.trim()) {
    return path.resolve(envDir.trim());
  }
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      return fileURLToPath(new URL('../../../.mock_drive_storage', import.meta.url));
    }
  } catch {
    // fallback
  }
  let baseDir = '.';
  if (typeof Deno !== 'undefined' && typeof (Deno as any).cwd === 'function') {
    try {
      baseDir = (Deno as any).cwd();
    } catch {
      baseDir = '.';
    }
  } else if (typeof process !== 'undefined' && typeof process.cwd === 'function') {
    baseDir = process.cwd();
  }
  return path.resolve(baseDir, '.mock_drive_storage');
}

/**
 * Valida y genera rutas absolutas seguras dentro de .mock_drive_storage previniendo Path Traversal.
 */
export function getSafeMockStoragePaths(fileId: string): { dataPath: string; metaPath: string } {
  const storageDir = getMockStorageDir();
  const cleaned = fileId ? fileId.trim() : '';
  if (!cleaned) {
    throw new Error('INVALID_FILE_ID: Identificador de archivo inválido para almacenamiento');
  }
  const sanitized = path.basename(cleaned).replace(/[^a-zA-Z0-9_-]/g, '_').replace(/^_+$/, '');
  if (!sanitized) {
    throw new Error('INVALID_FILE_ID: Identificador de archivo inválido para almacenamiento');
  }
  const dataPath = path.resolve(storageDir, `${sanitized}.bin`);
  const metaPath = path.resolve(storageDir, `${sanitized}.meta.json`);

  const normalizedStorageDir = path.normalize(storageDir);
  if (!path.normalize(dataPath).startsWith(normalizedStorageDir) || !path.normalize(metaPath).startsWith(normalizedStorageDir)) {
    throw new Error('SECURITY_ERROR: Path traversal detectado en fileId');
  }
  return { dataPath, metaPath };
}

/**
 * Escritura atómica de contenido binario y metadatos en disco local mediante archivos temporales y renombrado.
 */
export function writeMockFileAtomic(fileId: string, metadata: GoogleDriveFile, content: Uint8Array | Buffer): void {
  const storageDir = getMockStorageDir();
  fs.mkdirSync(storageDir, { recursive: true });
  const { dataPath, metaPath } = getSafeMockStoragePaths(fileId);

  const randSuffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const tmpDataPath = `${dataPath}.tmp.${randSuffix}`;
  const tmpMetaPath = `${metaPath}.tmp.${randSuffix}`;

  try {
    fs.writeFileSync(tmpDataPath, content);
    fs.writeFileSync(tmpMetaPath, JSON.stringify(metadata, null, 2), 'utf-8');
    fs.renameSync(tmpDataPath, dataPath);
    fs.renameSync(tmpMetaPath, metaPath);
  } catch (err) {
    try { if (fs.existsSync(tmpDataPath)) fs.unlinkSync(tmpDataPath); } catch {}
    try { if (fs.existsSync(tmpMetaPath)) fs.unlinkSync(tmpMetaPath); } catch {}
    throw err;
  }
}

/**
 * Lectura segura de archivo mock y sus metadatos desde el disco local.
 */
export function readMockFileFromDisk(fileId: string): { metadata: GoogleDriveFile; content: Buffer } | null {
  try {
    const { dataPath, metaPath } = getSafeMockStoragePaths(fileId);
    if (!fs.existsSync(dataPath) || !fs.existsSync(metaPath)) {
      return null;
    }
    const metaRaw = fs.readFileSync(metaPath, 'utf-8');
    const metadata = JSON.parse(metaRaw) as GoogleDriveFile;
    const content = fs.readFileSync(dataPath);

    // Verificación de integridad interna: el tamaño en disco debe coincidir exactamente con el metadato
    if (content.length !== metadata.size) {
      return null;
    }

    // Verificación MD5 si está presente en metadatos
    if (metadata.md5Checksum) {
      const actualMd5 = crypto.createHash('md5').update(content).digest('hex');
      if (actualMd5 !== metadata.md5Checksum) {
        return null;
      }
    }

    return { metadata, content };
  } catch {
    return null;
  }
}

/**
 * Adaptador Mock determinístico de Google Drive para pruebas locales y CI/CD reproducible,
 * con persistencia física real de bytes y metadatos (capa dual: disco local .mock_drive_storage + PostgreSQL _mock_drive_storage).
 */
/**
 * Resuelve el cliente Supabase de forma compatible tanto con Deno (npm: specifier) como con Node.js.
 */
async function getSupabaseAdminClient(): Promise<any> {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
  if (!supabaseUrl || !serviceRoleKey) return null;
  let createClientFn: any;
  try {
    const mod = await import('@supabase/supabase-js');
    createClientFn = mod.createClient;
  } catch {
    const mod = await import('npm:@supabase/supabase-js@2.116.0');
    createClientFn = mod.createClient;
  }
  return createClientFn(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

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

  async ensureFolder(parentFolderId: string, folderName: string): Promise<string> {
    return `mock_folder_${parentFolderId}_${folderName.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  }

  async moveFile(fileId: string, targetFolderId: string, _sourceFolderId?: string): Promise<void> {
    let entry = this.inMemoryFiles.get(fileId);
    if (!entry) {
      entry = readMockFileFromDisk(fileId) || undefined;
    }
    if (entry) {
      entry.metadata.parents = [targetFolderId];
      this.inMemoryFiles.set(fileId, entry);
      try {
        const { metaPath } = getSafeMockStoragePaths(fileId);
        if (fs.existsSync(metaPath)) {
          fs.writeFileSync(metaPath, JSON.stringify(entry.metadata, null, 2), 'utf-8');
        }
      } catch {}
    }
    try {
      const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = await getSupabaseAdminClient();
        await adminClient.from('_mock_drive_storage').update({
          parent_folder_id: targetFolderId,
          updated_at: new Date().toISOString(),
        }).eq('file_id', fileId);
      }
    } catch {}
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

    const baseUrl = getEnv('MOCK_DRIVE_SERVER_URL') || 'http://127.0.0.1:54351/mock-drive-upload';
    const uploadUrl = `${baseUrl}?session_id=${sessionId}&file_id=${driveFileId}`;

    return { uploadUrl, driveFileId };
  }

  /**
   * Permite inyectar contenido subido en el mock persistiendo físicamente los bytes.
   */
  storeFileBuffer(
    fileId: string,
    name: string,
    mimeType: string,
    content: Buffer,
    appProperties?: Record<string, string>,
    parentFolderId?: string
  ): GoogleDriveFile {
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

    // 1. Persistencia en disco local (cuando el runtime lo permite)
    try {
      writeMockFileAtomic(fileId, file, content);
    } catch {}

    // 2. Persistencia en PostgreSQL (_mock_drive_storage) para compartir entre isolates Deno
    void (async () => {
      try {
        const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = await getSupabaseAdminClient();
        await adminClient.from('_mock_drive_storage').upsert({
          file_id: fileId,
          name,
          mime_type: mimeType,
          size_bytes: content.length,
          md5_checksum: file.md5Checksum,
          app_properties: appProperties || {},
          parent_folder_id: parentFolderId || 'mock_staging_folder',
          content_base64: Buffer.from(content).toString('base64'),
          trashed: false,
          updated_at: new Date().toISOString(),
        });
      }
      } catch (dbErr) {
        // Ignorar si no hay conexión en unit tests
      }
    })();

    // 3. Cache en memoria sincronizado
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
    let entry = this.inMemoryFiles.get(fileId) || readMockFileFromDisk(fileId);

    // Si no está en memoria ni en disco local, consultar PostgreSQL (_mock_drive_storage)
    if (!entry) {
      try {
        const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
        if (supabaseUrl && serviceRoleKey) {
          const adminClient = await getSupabaseAdminClient();
          const { data: dbRow } = await adminClient
            .from('_mock_drive_storage')
            .select('*')
            .eq('file_id', fileId)
            .maybeSingle();

          if (dbRow && dbRow.content_base64) {
            const buf = Buffer.from(dbRow.content_base64, 'base64');
            // Verificación de consistencia: los bytes en DB deben coincidir con size_bytes registrado
            if (buf.length !== Number(dbRow.size_bytes)) {
              return {
                verified: false,
                error: `DRIVE_VERIFY_ERROR: Inconsistencia en almacenamiento PostgreSQL para ${fileId}: tamaño registrado ${dbRow.size_bytes}, bytes reales ${buf.length}`,
              };
            }
            if (dbRow.md5_checksum) {
              const actualMd5 = crypto.createHash('md5').update(buf).digest('hex');
              if (actualMd5 !== dbRow.md5_checksum) {
                return {
                  verified: false,
                  error: `DRIVE_VERIFY_ERROR: Fallo de integridad MD5 en PostgreSQL para ${fileId}`,
                };
              }
            }
            const meta: GoogleDriveFile = {
              id: dbRow.file_id,
              name: dbRow.name,
              mimeType: dbRow.mime_type,
              size: Number(dbRow.size_bytes),
              md5Checksum: dbRow.md5_checksum,
              appProperties: dbRow.app_properties || {},
              parents: dbRow.parent_folder_id ? [dbRow.parent_folder_id] : ['mock_staging_folder'],
              trashed: dbRow.trashed || false,
            };
            entry = { metadata: meta, content: buf };
            this.inMemoryFiles.set(fileId, entry);
          }
        }
      } catch (err) {
        console.error('Error al consultar _mock_drive_storage en verify:', err);
      }
    }

    // PROHIBICIÓN EXPLÍCITA DE ARCHIVOS SINTÉTICOS:
    // Si los bytes originales no existen físicamente en ningún almacenamiento, devolver error explícito
    if (!entry) {
      return {
        verified: false,
        error: `DRIVE_VERIFY_ERROR: Archivo mock ${fileId} no existe en almacenamiento físico local. Se prohíbe verificar archivos sintéticos o ausentes.`,
      };
    }

    const file = entry.metadata;
    if (file.trashed) {
      return { verified: false, error: 'El archivo mock se encuentra en la papelera' };
    }

    // Comprobar tanto el metadato como el contenido real en memoria/disco/DB
    if (file.size !== expected.size || entry.content.length !== expected.size) {
      return {
        verified: false,
        error: `Tamaño mock no coincide: esperado ${expected.size}, metadato ${file.size}, bytes reales ${entry.content.length}`,
      };
    }

    if (entry.content.length !== file.size) {
      return {
        verified: false,
        error: `Inconsistencia interna: metadato declara ${file.size} bytes pero el buffer contiene ${entry.content.length} bytes`,
      };
    }

    if (file.md5Checksum) {
      const actualMd5 = crypto.createHash('md5').update(entry.content).digest('hex');
      if (actualMd5 !== file.md5Checksum) {
        return {
          verified: false,
          error: `Fallo de verificación de integridad MD5: esperado ${file.md5Checksum}, real ${actualMd5}`,
        };
      }
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
    let entry = this.inMemoryFiles.get(fileId) || readMockFileFromDisk(fileId);

    if (!entry) {
      try {
        const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
        if (supabaseUrl && serviceRoleKey) {
          const adminClient = await getSupabaseAdminClient();
          const { data: dbRow } = await adminClient
            .from('_mock_drive_storage')
            .select('*')
            .eq('file_id', fileId)
            .maybeSingle();

          if (dbRow && dbRow.content_base64) {
            const buf = Buffer.from(dbRow.content_base64, 'base64');
            const meta: GoogleDriveFile = {
              id: dbRow.file_id,
              name: dbRow.name,
              mimeType: dbRow.mime_type,
              size: Number(dbRow.size_bytes),
              md5Checksum: dbRow.md5_checksum,
              appProperties: dbRow.app_properties || {},
              parents: dbRow.parent_folder_id ? [dbRow.parent_folder_id] : ['mock_staging_folder'],
              trashed: dbRow.trashed || false,
            };
            entry = { metadata: meta, content: buf };
            this.inMemoryFiles.set(fileId, entry);
          }
        }
      } catch (err) {
        console.error('Error al consultar _mock_drive_storage en download:', err);
      }
    }

    if (!entry) {
      throw new Error(`DRIVE_DOWNLOAD_ERROR: Archivo mock ${fileId} no existe en almacenamiento físico local`);
    }

    if (entry.metadata.trashed) {
      throw new Error(`DRIVE_DOWNLOAD_ERROR: Archivo mock ${fileId} se encuentra en la papelera`);
    }

    // Convertir Buffer a Readable Stream estándar compatible con Deno y Node.js
    const readable = typeof (Readable as any).toWeb === 'function'
      ? (Readable as any).toWeb(Readable.from(entry.content))
      : Readable.from(entry.content);

    return {
      stream: readable,
      mimeType: entry.metadata.mimeType,
      size: entry.metadata.size,
      name: entry.metadata.name,
    };
  }

  async trashItem(fileOrFolderId: string): Promise<DriveItemCleanupResult> {
    if (!fileOrFolderId || !fileOrFolderId.trim()) {
      return { success: true, status: 'already_missing' };
    }
    const id = fileOrFolderId.trim();
    const hadInMemory = this.inMemoryFiles.has(id);
    this.inMemoryFiles.delete(id);

    let foundOnDisk = false;
    try {
      const { dataPath, metaPath } = getSafeMockStoragePaths(id);
      if (fs.existsSync(dataPath)) {
        fs.unlinkSync(dataPath);
        foundOnDisk = true;
      }
      if (fs.existsSync(metaPath)) {
        fs.unlinkSync(metaPath);
        foundOnDisk = true;
      }
    } catch {}

    let foundInDb = false;
    try {
      const { supabaseUrl, serviceRoleKey } = getSupabaseConfig();
      if (supabaseUrl && serviceRoleKey) {
        const adminClient = await getSupabaseAdminClient();
        const { data } = await adminClient
          .from('_mock_drive_storage')
          .delete()
          .eq('file_id', id)
          .select('file_id');
        if (data && data.length > 0) {
          foundInDb = true;
        }
      }
    } catch {}

    if (hadInMemory || foundOnDisk || foundInDb) {
      return { success: true, status: 'deleted', httpStatus: 200 };
    }
    return { success: true, status: 'already_missing', httpStatus: 404 };
  }

  async deleteItem(fileOrFolderId: string): Promise<boolean> {
    const res = await this.trashItem(fileOrFolderId);
    return res.success;
  }
}
// Singleton de adaptadores
let defaultAdapterInstance: DriveAdapter | null = null;

export function getDriveAdapter(): DriveAdapter {
  if (defaultAdapterInstance) return defaultAdapterInstance;

  const envRaw = (getEnv('ENVIRONMENT') || getEnv('APP_ENV') || '').toLowerCase().trim();
  const isProductionOrTest = envRaw === 'production' || envRaw === 'test';

  const hasFullGoogleCredentials = Boolean(
    getEnv('GOOGLE_CLIENT_ID') &&
    getEnv('GOOGLE_CLIENT_SECRET') &&
    getEnv('GOOGLE_REFRESH_TOKEN')
  );

  // 1. En entornos production o test, MockDriveAdapter está TERMINANTEMENTE PROHIBIDO.
  //    Incluso si USE_DRIVE_MOCK=true, LOCAL_DEV=true, VITEST=true o NODE_ENV=test fueron definidos.
  if (isProductionOrTest) {
    if (hasFullGoogleCredentials) {
      defaultAdapterInstance = new GoogleDriveAdapter();
      return defaultAdapterInstance;
    }
    throw new Error(
      `CONFIG_ERROR: Credenciales incompletas de Google Drive (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN). ` +
      `MockDriveAdapter está estrictamente prohibido en entorno ${envRaw.toUpperCase()}.`
    );
  }

  // 2. Fuera de production/test: si existen credenciales completas de Google y no se fuerza mock, usar GoogleDriveAdapter
  if (hasFullGoogleCredentials && getEnv('USE_DRIVE_MOCK') !== 'true') {
    defaultAdapterInstance = new GoogleDriveAdapter();
    return defaultAdapterInstance;
  }

  // 3. Permitir MockDriveAdapter únicamente en LOCAL explícitamente validado o en pruebas unitarias aisladas
  const isExplicitLocal =
    envRaw === 'local' ||
    getEnv('LOCAL_DEV') === 'true' ||
    (getEnv('SUPABASE_URL') || '').includes('127.0.0.1') ||
    (getEnv('SUPABASE_URL') || '').includes('localhost');

  const isIsolatedUnitTest =
    getEnv('VITEST') === 'true' ||
    getEnv('NODE_ENV') === 'test';

  const isMockAuthorized =
    (isExplicitLocal && (getEnv('USE_DRIVE_MOCK') === 'true' || getEnv('LOCAL_DEV') === 'true')) ||
    isIsolatedUnitTest;

  if (isMockAuthorized) {
    defaultAdapterInstance = new MockDriveAdapter();
    return defaultAdapterInstance;
  }

  // 4. Fail-closed por defecto ante cualquier otra condición
  throw new Error(
    'CONFIG_ERROR: Credenciales incompletas de Google Drive (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN). ' +
    'MockDriveAdapter está estrictamente prohibido fuera de entornos locales de desarrollo o pruebas autorizadas.'
  );
}

export function setDriveAdapter(adapter: DriveAdapter): void {
  defaultAdapterInstance = adapter;
}

export function resetDriveAdapter(): void {
  defaultAdapterInstance = null;
}

/**
 * Genera un nombre de archivo único si ya existe en la lista dada
 * Ejemplo: archivo.pdf -> archivo (2).pdf -> archivo (3).pdf
 */
export function computeUniqueFileName(existingFileNames: string[], originalName: string): string {
  if (!existingFileNames.includes(originalName)) {
    return originalName;
  }
  const lastDot = originalName.lastIndexOf('.');
  const baseName = lastDot > 0 ? originalName.substring(0, lastDot) : originalName;
  const ext = lastDot > 0 ? originalName.substring(lastDot) : '';

  let counter = 2;
  while (true) {
    const candidate = `${baseName} (${counter})${ext}`;
    if (!existingFileNames.includes(candidate)) {
      return candidate;
    }
    counter++;
  }
}

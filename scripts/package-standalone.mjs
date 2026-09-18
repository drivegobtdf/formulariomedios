import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const standaloneDir = path.join(rootDir, 'pedidos-standalone');

console.log('=== [STANDALONE] PACKAGING STATIC SPA (POSIX ZIP & SINGLE ROOT) ===\n');

// 1. Ejecutar postbuild para asegurar documentación y checksums actualizados
console.log('[1/4] Ejecutando postbuild standalone y actualizando metadatos...');
execSync(`node "${path.join(rootDir, 'scripts', 'postbuild-standalone.mjs')}"`, { stdio: 'inherit' });

// 2. Escaneo de seguridad estricto contra secretos en el paquete standalone
console.log('\n[2/4] Ejecutando escaneo de seguridad de secretos antes de empaquetar...');
const FORBIDDEN_PATTERNS = [
  /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]*service_role/i,
  /service_role_key/i,
  /COMMS_TOKEN_SECRET/i,
  /N8N_DISPATCH_SECRET/i,
  /N8N_INTEGRATION_SECRET/i,
  /BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i,
  /client_secret_[a-zA-Z0-9_-]+\.apps\.googleusercontent/i,
  /"client_secret"\s*:\s*"[^"]+"/i,
  /"refresh_token"\s*:\s*"[^"]+"/i,
];

function scanDirForSecrets(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      scanDirForSecrets(fullPath);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (['.js', '.css', '.html', '.json', '.txt', '.md', '.example'].includes(ext)) {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const pat of FORBIDDEN_PATTERNS) {
          if (pat.test(text)) {
            console.error(`\n[CRITICAL SECURITY ALERT] Se detectó un posible patrón de secreto en: ${fullPath}`);
            console.error(`Patrón coincidente: ${pat.toString()}`);
            process.exit(1);
          }
        }
      }
    }
  }
}

scanDirForSecrets(standaloneDir);
console.log('       Escaneo de seguridad exitoso: 0 secretos detectados.');

// 3. Crear ZIP usando Python zipfile con separadores POSIX estrictos (/) y raíz pedidos-standalone/
console.log('\n[3/4] Generando archivo ZIP portable (POSIX forward-slashes)...');
const versionMatch = fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8').match(/"version":\s*"([^"]+)"/);
const version = versionMatch ? versionMatch[1] : '0.1.0-beta2';

const zipFileName = `pedidos-standalone-${version}.zip`;
const zipOutputPath = path.join(rootDir, zipFileName);

const pythonScript = `
import os
import sys
import zipfile

source_dir = sys.argv[1]
zip_path = sys.argv[2]
root_prefix = "pedidos-standalone"

entries = []
for root, dirs, files in os.walk(source_dir):
    for f in sorted(files):
        full_path = os.path.join(root, f)
        rel_path = os.path.relpath(full_path, source_dir).replace('\\\\\\\\', '/').replace('\\\\', '/')
        arcname = f"{root_prefix}/{rel_path}"
        entries.append((full_path, arcname))

if os.path.exists(zip_path):
    os.remove(zip_path)

with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
    for full_path, arcname in entries:
        zf.write(full_path, arcname=arcname)

print(f"Generado: {zip_path} ({len(entries)} archivos)")
`;

const pyScriptPath = path.join(rootDir, 'scripts', '_make_standalone_zip.py');
fs.writeFileSync(pyScriptPath, pythonScript, 'utf8');

try {
  execSync(`python "${pyScriptPath}" "${standaloneDir}" "${zipOutputPath}"`, {
    stdio: 'inherit',
  });
} catch (zipErr) {
  console.error('Error generando archivo ZIP con Python:', zipErr.message);
  process.exit(1);
} finally {
  if (fs.existsSync(pyScriptPath)) {
    fs.unlinkSync(pyScriptPath);
  }
}

// 4. Verificación estricta de estructura y POSIX slashes del ZIP generado
console.log('\n[4/4] Verificando integridad, estructura canónica y metadatos del ZIP generado...');

const verifyScript = `
import sys
import zipfile

zip_path = sys.argv[1]
with zipfile.ZipFile(zip_path, 'r') as zf:
    namelist = zf.namelist()
    
    # 1. Verificar que no haya backslashes
    backslashes = [n for n in namelist if '\\\\' in n]
    if backslashes:
        print(f"ERROR: Se encontraron entradas con backslashes en {zip_path}: {backslashes}")
        sys.exit(1)
        
    # 2. Verificar que todas las entradas comiencen con pedidos-standalone/
    invalid_roots = [n for n in namelist if not n.startswith('pedidos-standalone/')]
    if invalid_roots:
        print(f"ERROR: Se encontraron entradas fuera de la raiz pedidos-standalone/ en {zip_path}: {invalid_roots}")
        sys.exit(1)
        
    # 3. Verificar que pedidos-standalone/web/index.html exista exactamente
    if 'pedidos-standalone/web/index.html' not in namelist:
        print(f"ERROR: No se encontro pedidos-standalone/web/index.html en {zip_path}")
        sys.exit(1)
        
    # 4. Verificar que pedidos-standalone/web/pedidos-config.js exista
    if 'pedidos-standalone/web/pedidos-config.js' not in namelist:
        print(f"ERROR: No se encontro pedidos-standalone/web/pedidos-config.js en {zip_path}")
        sys.exit(1)

    print(f"Verificacion exitosa: {len(namelist)} entradas en {zip_path}. Estructura canonica POSIX confirmada.")
`;

const pyVerifyPath = path.join(rootDir, 'scripts', '_verify_standalone_zip.py');
fs.writeFileSync(pyVerifyPath, verifyScript, 'utf8');

try {
  execSync(`python "${pyVerifyPath}" "${zipOutputPath}"`, { stdio: 'inherit' });
} finally {
  if (fs.existsSync(pyVerifyPath)) {
    fs.unlinkSync(pyVerifyPath);
  }
}

const stats = fs.statSync(zipOutputPath);
const buffer = fs.readFileSync(zipOutputPath);
const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

console.log('\n=== RESUMEN DE EMPAQUETADO STANDALONE (STATIC SPA) ===');
console.log(`* Archivo ZIP:           ${zipFileName}`);
console.log(`* Ruta absoluta:         ${zipOutputPath}`);
console.log(`* Versión:               ${version}`);
console.log(`* Tamaño:                ${(stats.size / 1024).toFixed(2)} KiB (${stats.size} bytes)`);
console.log(`* SHA-256:               ${sha256}`);
console.log(`* Raíz del ZIP:          pedidos-standalone/`);
console.log(`* Target Inicial:        https://formulariomedios.tierradelfuego.gob.ar/`);
console.log('======================================================\n');

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pluginDir = path.join(rootDir, 'pedidos-medios');
const distDir = path.join(pluginDir, 'dist');

console.log('=== [F11 HOTFIX] PACKAGING WORDPRESS PLUGIN (MULTISITE & POSIX ZIP) ===\n');

// 1. Validar que dist exista y tenga manifest y assets
const manifestVite = path.join(distDir, '.vite', 'manifest.json');
const manifestRoot = path.join(distDir, 'manifest.json');
if (!fs.existsSync(manifestVite) && !fs.existsSync(manifestRoot)) {
  console.error('ERROR: No se encontro manifest.json en pedidos-medios/dist. Ejecute npm run build:wordpress primero.');
  process.exit(1);
}

// 2. Escaneo de seguridad estricto contra secretos en el paquete
console.log('[1/4] Ejecutando escaneo de seguridad de secretos antes de empaquetar...');
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
      if (['.php', '.js', '.css', '.html', '.json', '.txt', '.md'].includes(ext)) {
        const text = fs.readFileSync(fullPath, 'utf8');
        for (const pat of FORBIDDEN_PATTERNS) {
          if (pat.test(text)) {
            console.error(`\n[CRITICAL SECURITY ALERT] Se detecto un posible patron de secreto en: ${fullPath}`);
            console.error(`Patron coincidente: ${pat.toString()}`);
            process.exit(1);
          }
        }
      }
    }
  }
}

scanDirForSecrets(path.join(pluginDir, 'src', 'PHP'));
scanDirForSecrets(distDir);
console.log('       Escaneo de seguridad exitoso: 0 secretos detectados.');

// 3. Preparar staging directory para empaquetado limpio
console.log('[2/4] Preparando estructura limpia para el ZIP...');
const versionMatch = fs.readFileSync(path.join(pluginDir, 'pedidos-medios.php'), 'utf8').match(/Version:\s*([0-9a-zA-Z.-]+)/);
const version = versionMatch ? versionMatch[1] : '0.1.0-alpha';

const currentUiZipFileName = `pedidos-medios-${version}-current-ui.zip`;
const routefix3ZipFileName = `pedidos-medios-${version}-routefix3.zip`;
const routerfixZipFileName = `pedidos-medios-${version}-routerfix.zip`;
const fixedZipFileName = `pedidos-medios-${version}-fixed.zip`;
const zipFileName = `pedidos-medios-${version}.zip`;
const canonicalZipFileName = `pedidos-medios.zip`;

const currentUiZipOutputPath = path.join(rootDir, currentUiZipFileName);
const routefix3ZipOutputPath = path.join(rootDir, routefix3ZipFileName);
const routerfixZipOutputPath = path.join(rootDir, routerfixZipFileName);
const fixedZipOutputPath = path.join(rootDir, fixedZipFileName);
const zipOutputPath = path.join(rootDir, zipFileName);
const canonicalZipPath = path.join(rootDir, canonicalZipFileName);

const stagingDir = path.join(rootDir, '.wp-staging');
const stagedPluginDir = path.join(stagingDir, 'pedidos-medios');

if (fs.existsSync(stagingDir)) {
  fs.rmSync(stagingDir, { recursive: true, force: true });
}
fs.mkdirSync(stagedPluginDir, { recursive: true });

// Copiar archivos esenciales del plugin
fs.copyFileSync(path.join(pluginDir, 'pedidos-medios.php'), path.join(stagedPluginDir, 'pedidos-medios.php'));
fs.copyFileSync(path.join(pluginDir, 'readme.txt'), path.join(stagedPluginDir, 'readme.txt'));

// Copiar src/PHP
function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyRecursive(path.join(pluginDir, 'src', 'PHP'), path.join(stagedPluginDir, 'src', 'PHP'));
copyRecursive(distDir, path.join(stagedPluginDir, 'dist'));

// 4. Crear ZIP usando Python zipfile con separadores POSIX estrictos (/)
console.log(`[3/4] Generando archivos ZIP portables (POSIX forward-slashes)...`);

const pythonScript = `
import os
import sys
import zipfile

staging_dir = sys.argv[1]
output_zips = sys.argv[2:]

entries = []
for root, dirs, files in os.walk(staging_dir):
    for f in sorted(files):
        full_path = os.path.join(root, f)
        rel_path = os.path.relpath(full_path, staging_dir).replace('\\\\\\\\', '/').replace('\\\\', '/')
        entries.append((full_path, rel_path))

for zip_path in output_zips:
    if os.path.exists(zip_path):
        os.remove(zip_path)
    with zipfile.ZipFile(zip_path, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for full_path, arcname in entries:
            zf.write(full_path, arcname=arcname)
    print(f"Generado: {zip_path} ({len(entries)} archivos)")
`;

const pyScriptPath = path.join(rootDir, 'scripts', '_make_zip.py');
fs.writeFileSync(pyScriptPath, pythonScript, 'utf8');

try {
  execSync(`python "${pyScriptPath}" "${stagingDir}" "${routefix3ZipOutputPath}" "${currentUiZipOutputPath}" "${routerfixZipOutputPath}" "${fixedZipOutputPath}" "${zipOutputPath}" "${canonicalZipPath}"`, {
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

// Limpiar staging
fs.rmSync(stagingDir, { recursive: true, force: true });

// 5. Verificación estricta de estructura y POSIX slashes del ZIP generado
console.log('[4/4] Verificando integridad, estructura canonica y metadatos del ZIP generado...');

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
        
    # 2. Verificar que todas las entradas comiencen con pedidos-medios/
    invalid_roots = [n for n in namelist if not n.startswith('pedidos-medios/')]
    if invalid_roots:
        print(f"ERROR: Se encontraron entradas fuera de la raiz pedidos-medios/ en {zip_path}: {invalid_roots}")
        sys.exit(1)
        
    # 3. Verificar que pedidos-medios/pedidos-medios.php exista exactamente
    if 'pedidos-medios/pedidos-medios.php' not in namelist:
        print(f"ERROR: No se encontro pedidos-medios/pedidos-medios.php en {zip_path}")
        sys.exit(1)
        
    # 4. Verificar que pedidos-medios/src/PHP/Plugin.php exista
    if 'pedidos-medios/src/PHP/Plugin.php' not in namelist:
        print(f"ERROR: No se encontro pedidos-medios/src/PHP/Plugin.php en {zip_path}")
        sys.exit(1)

    print(f"Verificacion exitosa: {len(namelist)} entradas en {zip_path}. Estructura canonica POSIX confirmada.")
`;

const pyVerifyPath = path.join(rootDir, 'scripts', '_verify_zip.py');
fs.writeFileSync(pyVerifyPath, verifyScript, 'utf8');

try {
  execSync(`python "${pyVerifyPath}" "${routefix3ZipOutputPath}"`, { stdio: 'inherit' });
  execSync(`python "${pyVerifyPath}" "${currentUiZipOutputPath}"`, { stdio: 'inherit' });
  execSync(`python "${pyVerifyPath}" "${routerfixZipOutputPath}"`, { stdio: 'inherit' });
  execSync(`python "${pyVerifyPath}" "${fixedZipOutputPath}"`, { stdio: 'inherit' });
  execSync(`python "${pyVerifyPath}" "${zipOutputPath}"`, { stdio: 'inherit' });
  execSync(`python "${pyVerifyPath}" "${canonicalZipPath}"`, { stdio: 'inherit' });
} finally {
  if (fs.existsSync(pyVerifyPath)) {
    fs.unlinkSync(pyVerifyPath);
  }
}

function getZipMetadata(filePath) {
  const stats = fs.statSync(filePath);
  const buffer = fs.readFileSync(filePath);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    filename: path.basename(filePath),
    sizeBytes: stats.size,
    sizeKiB: (stats.size / 1024).toFixed(2),
    sha256,
  };
}

const metaRoutefix3 = getZipMetadata(routefix3ZipOutputPath);
const metaCurrentUi = getZipMetadata(currentUiZipOutputPath);
const metaRouterfix = getZipMetadata(routerfixZipOutputPath);
const metaFixed = getZipMetadata(fixedZipOutputPath);
const metaVersioned = getZipMetadata(zipOutputPath);
const metaCanonical = getZipMetadata(canonicalZipPath);

console.log('\n=== RESUMEN DE EMPAQUETADO WORDPRESS (F11 ROUTEFIX 3) ===');
console.log(`* Plugin Basename:       pedidos-medios/pedidos-medios.php`);
console.log(`* Version de plugin:     ${version}`);
console.log(`* Archivo ROUTEFIX 3:    ${metaRoutefix3.filename}`);
console.log(`  - Ruta:                ${routefix3ZipOutputPath}`);
console.log(`  - Tamano:              ${metaRoutefix3.sizeKiB} KiB (${metaRoutefix3.sizeBytes} bytes)`);
console.log(`  - SHA-256:             ${metaRoutefix3.sha256}`);
console.log(`* Archivo CURRENT UI:    ${metaCurrentUi.filename}`);
console.log(`  - Ruta:                ${currentUiZipOutputPath}`);
console.log(`  - Tamano:              ${metaCurrentUi.sizeKiB} KiB (${metaCurrentUi.sizeBytes} bytes)`);
console.log(`  - SHA-256:             ${metaCurrentUi.sha256}`);
console.log(`* Archivo Routerfix:     ${metaRouterfix.filename}`);
console.log(`  - Ruta:                ${routerfixZipOutputPath}`);
console.log(`  - Tamano:              ${metaRouterfix.sizeKiB} KiB (${metaRouterfix.sizeBytes} bytes)`);
console.log(`  - SHA-256:             ${metaRouterfix.sha256}`);
console.log(`* Archivo Fixed:         ${metaFixed.filename}`);
console.log(`  - Ruta:                ${fixedZipOutputPath}`);
console.log(`  - Tamano:              ${metaFixed.sizeKiB} KiB (${metaFixed.sizeBytes} bytes)`);
console.log(`  - SHA-256:             ${metaFixed.sha256}`);
console.log(`* Archivo Versionado:    ${metaVersioned.filename}`);
console.log(`  - Ruta:                ${zipOutputPath}`);
console.log(`  - Tamano:              ${metaVersioned.sizeKiB} KiB (${metaVersioned.sizeBytes} bytes)`);
console.log(`  - SHA-256:             ${metaVersioned.sha256}`);
console.log(`* Archivo Canonico:      ${metaCanonical.filename}`);
console.log(`  - Ruta:                ${canonicalZipPath}`);
console.log(`  - Tamano:              ${metaCanonical.sizeKiB} KiB (${metaCanonical.sizeBytes} bytes)`);
console.log(`  - SHA-256:             ${metaCanonical.sha256}`);
console.log('=========================================================\n');

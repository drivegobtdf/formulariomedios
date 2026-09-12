import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pluginDir = path.join(rootDir, 'pedidos-medios');

function getPhpFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getPhpFiles(fullPath));
    } else if (file.endsWith('.php')) {
      results.push(fullPath);
    }
  });
  return results;
}

const phpFiles = getPhpFiles(pluginDir);
console.log(`Ejecutando validación de sintaxis PHP 8.2 en ${phpFiles.length} archivos...`);

let hasError = false;

for (const filePath of phpFiles) {
  const relPath = path.relative(pluginDir, filePath).replace(/\\/g, '/');
  try {
    const output = execSync(
      `docker run --rm -v "${pluginDir}:/app" -w /app php:8.2-cli php -l "${relPath}"`,
      { encoding: 'utf-8' }
    );
    process.stdout.write(output);
  } catch (err) {
    console.error(`Error de sintaxis en ${relPath}:`, err.message);
    hasError = true;
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log('Validación PHP 8.2 completada: Todos los archivos sin errores de sintaxis.');
}

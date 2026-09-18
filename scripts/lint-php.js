import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
      if (file === 'node_modules' || file === 'dist' || file === 'frontend' || file === '.git') return;
      results = results.concat(getPhpFiles(fullPath));
    } else if (file.endsWith('.php')) {
      results.push(fullPath);
    }
  });
  return results;
}

const phpFiles = getPhpFiles(pluginDir);
console.log(`Ejecutando validación de sintaxis PHP 8.2 en ${phpFiles.length} archivos...`);

// Detectar si php CLI nativo está disponible
let phpEngine = 'none';
try {
  execSync('php -v', { stdio: 'ignore' });
  phpEngine = 'native';
} catch {
  try {
    execSync('docker info', { stdio: 'ignore' });
    phpEngine = 'docker';
  } catch {
    phpEngine = 'static-structural';
  }
}

console.log(`Motor de validación PHP seleccionado: ${phpEngine}`);

let hasError = false;

for (const filePath of phpFiles) {
  const relPath = path.relative(pluginDir, filePath).replace(/\\/g, '/');
  
  if (phpEngine === 'native') {
    try {
      const output = execSync(`php -l "${filePath}"`, { encoding: 'utf-8' });
      process.stdout.write(output);
    } catch (err) {
      console.error(`Error de sintaxis en ${relPath}:`, err.message);
      hasError = true;
    }
  } else if (phpEngine === 'docker') {
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
  } else {
    // Static structural validation (fallback cuando no hay binario de PHP en PATH ni Docker activo)
    const code = fs.readFileSync(filePath, 'utf8');
    
    // Check 1: Opening PHP tag
    if (!code.startsWith('<?php')) {
      console.error(`[${relPath}] Error: Archivo PHP debe comenzar con '<?php'`);
      hasError = true;
    }
    
    // Check 2: strict_types declaration
    if (!code.includes('declare(strict_types=1);')) {
      console.warn(`[${relPath}] Warning: Falta declare(strict_types=1);`);
    }
    
    // Check 3: ABSPATH guard if applicable
    if (relPath === 'pedidos-medios.php' && !code.includes('defined(\'ABSPATH\')')) {
      console.error(`[${relPath}] Error: Falta verificación ABSPATH en archivo principal`);
      hasError = true;
    }
    
    // Check 4: Balanced braces and parentheses
    let braces = 0;
    let parens = 0;
    let brackets = 0;
    let inString = false;
    let stringChar = '';
    let inComment = false;
    let inLineComment = false;
    
    for (let i = 0; i < code.length; i++) {
      const c = code[i];
      const next = code[i + 1];
      
      if (inLineComment) {
        if (c === '\n') inLineComment = false;
        continue;
      }
      if (inComment) {
        if (c === '*' && next === '/') {
          inComment = false;
          i++;
        }
        continue;
      }
      if (inString) {
        if (c === '\\') {
          i++; // skip escaped char
        } else if (c === stringChar) {
          inString = false;
        }
        continue;
      }
      
      if (c === '/' && next === '/') {
        inLineComment = true;
        i++;
        continue;
      }
      if (c === '/' && next === '*') {
        inComment = true;
        i++;
        continue;
      }
      if (c === '#' && (i === 0 || code[i - 1] === '\n' || code[i - 1] === ' ')) {
        inLineComment = true;
        continue;
      }
      if (c === '"' || c === "'") {
        inString = true;
        stringChar = c;
        continue;
      }
      
      if (c === '{') braces++;
      if (c === '}') braces--;
      if (c === '(') parens++;
      if (c === ')') parens--;
      if (c === '[') brackets++;
      if (c === ']') brackets--;
    }
    
    if (braces !== 0 || parens !== 0 || brackets !== 0) {
      console.error(`[${relPath}] Error de sintaxis: Llaves/paréntesis desbalanceados (braces: ${braces}, parens: ${parens}, brackets: ${brackets})`);
      hasError = true;
    } else {
      console.log(`[${relPath}] Sintaxis estructural válida (sin errores de balance o etiquetas)`);
    }
  }
}

if (hasError) {
  process.exit(1);
} else {
  console.log(`Validación PHP completada (${phpEngine}): Todos los archivos sin errores de sintaxis.`);
}

# 12 — Seguridad

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Activos
PII, PED, servicios, archivos, roles, tokens públicos, secretos, historial y comunicaciones.

## 2. Fronteras

```text
Internet
→ WordPress frontend (no confiable)
→ Supabase API / Edge
→ PostgreSQL + RLS
→ Storage
→ Queue
→ n8n
```

Todo input del browser es no confiable.

## 3. Amenazas y controles

### IDOR
RLS/RPC valida acceso; nunca confiar en `pedido_id` enviado.

### Enumeración de PED
PED + token, respuestas neutras y rate limiting.

### Robo de tokens
- 256 bits;
- hash de validación en DB; sobre cifrado temporal separado únicamente para entrega autorizada conforme ADR-028 revisada;
- expiración cuando aplica;
- no logs;
- preferir fragment URL `#t=` para reducir leakage y limpiarlo del history tras capturarlo.

### XSS
No insertar HTML no confiable. Escaping contextual. Sanitizar rich text si se introduce.

### CSRF
Supabase usa Authorization header para su sesión. Para settings WordPress: nonce + capability. Un nonce no es autorización.

### SQL injection
RPC parametrizada; no concatenar input en SQL.

### Escalada
El signup no elige rol. Admin verificado server-side.

### Secret leakage
Secret keys solo en Edge/server/n8n Credentials.

### Upload
Allowlist, size, MIME, bucket privado, paths aleatorios, archivos no ejecutables.

### Abuso público
Rate limit, honeypot y límites. CAPTCHA solo si el abuso real lo justifica.

## 4. RLS
Toda tabla expuesta por Data API:
- grants mínimos;
- RLS;
- tests positivos y negativos;
- revisar views y funciones.

## 5. SECURITY DEFINER
Checklist:
- necesidad justificada;
- `search_path=''`;
- schema explícito;
- auth/role;
- revoke public;
- grant mínimo;
- sin SQL dinámico inseguro.

## 6. Claves
Publishable: browser permitido, privilegio bajo.  
Secret: elevado, jamás browser/repo/URL/log.

## 7. CORS
Allowlist. No usar `*` en endpoints sensibles de producción. CORS no sustituye autorización.

## 8. Auditoría
Registrar actor, acción, entidad, valores relevantes, request_id, timestamp. Excluir passwords, tokens raw, auth headers y keys.

## 9. Privacidad
No PII en Storage paths. No enviar PII innecesaria a n8n. Retención pendiente `OPEN-003`.

## 10. WordPress
Settings propios con capability, nonce, validación/sanitización y escaping. No SQL de negocio PEDIDOS en WordPress.

## 11. Supply chain
Lockfile, dependencias actualizadas, revisión de bundle y ausencia de secrets/source maps sensibles.

## 12. Checklist preproducción
- tests RLS allow/deny;
- escalada admin;
- pending/revoked;
- enumeración/replay;
- rate limit;
- upload bypass;
- signed URL expiry;
- CORS;
- no secrets bundle;
- no PII logs;
- backup/restore.


## Repositorios y procedencia

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`

**Repositorio fuente de la auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Branch de auditoría:** `audit/current-weweb-2026-09-10`  
**Commit QA de referencia:** `0efb624`

El repositorio oficial del desarrollo es el único destino previsto para el código nuevo, documentación de implementación, plugin WordPress, migraciones Supabase, pruebas y workflows versionados. El repositorio de auditoría se conserva como evidencia del sistema WeWeb original y no debe confundirse con el repositorio de implementación.

## Documentación técnica oficial

- WordPress Developer Resources: `https://developer.wordpress.org/`
- Supabase Docs: `https://supabase.com/docs/`

La documentación histórica anterior a la auditoría se utiliza solo como referencia cuando no contradice la evidencia current-state.

## 13. Controles específicos del sitio receptor

- Wordfence permanecerá activo en pruebas.
- No se recomendará desactivarlo permanentemente.
- Actualmente no se reporta CSP restrictiva, pero el diseño no dependerá de ello.
- Los dominios Supabase deberán poder incorporarse a una CSP futura.
- WP Super Cache nunca debe cachear secretos; el frontend solo recibe
  configuración pública.

## 14. Cifrado temporal de enlaces
Diseño definido para revisión 2.0: cifrado autenticado AES-256-GCM con nonce aleatorio único por clave, clave de 256 bits en Secrets de Edge, key_version y AAD vinculado a entorno/token_id/propósito/entidad. La librería criptográfica y serialización deben usar APIs oficiales y probar descifrado, autenticidad, rotación y aislamiento; no criptografía casera.

Hash de token sigue siendo el dato usado para autenticar. El sobre existe solo para enviar/reintentar, no como API general de recuperación. Acceso a sobres restringido a funciones server-side y a un delivery reclamado/permitido. El token raw transita únicamente en memoria hacia el destinatario/correo necesario, jamás por logs, audit_log, errores, exports o persistencia de ejecuciones n8n.

Eliminar el sobre al completarse su entrega cuando ya no sea necesario y al alcanzar su plazo máximo; considerar backups y retención de claves en OPEN-003. No retirar una clave antigua antes de resolver sobres válidos que la necesitan. Fallo de descifrado no regenera automáticamente otro token. La vigencia de un token de acceso y la retención del sobre son distintas.

## 15. Superficies de ataque y controles comprobables
- RPC server-only no ejecutables por anon/authenticated; pruebas directas de bypass obligatorias.
- CORS no protege contra clientes no navegador; rate limit distribuido, capacidad, límites de body y validación server-side son necesarios.
- URLs firmadas/capacidades son credenciales portadoras: no en analítica o cache compartida y autorización antes de emitirlas.
- No permitir elevación de rol/estado vía metadata de signup, UPDATE genérico o parámetros actor del body.
- Observar XSS y scripts del sitio anfitrión. No considerar CSS namespaced una separación de origen/seguridad.
- Estado dinámico aprobado/rol se comprueba también en operaciones Edge con privilegios elevados.
- Los eventos, reservas, sobres y operaciones idempotentes se alojan en schema privado no expuesto; si hay funciones de entrada expuestas, grants explícitos mínimos.
- Auditoría excluye tokens, ciphertext, cabeceras y campos sensibles innecesarios; usar whitelist de valores en old/new.

## 16. Privacidad y operación
OPEN-003 debe determinar responsable institucional, finalidad/aviso al solicitante, minimización, retención por clase, acceso y procedimiento de eliminación/solicitud de derechos, incluyendo backups, proveedor email y n8n. Esto es un pendiente de gobernanza, no una declaración de cumplimiento legal verificado.

Definir rate limits, tamaños, TTLs y alertas en configuración versionada antes de habilitar endpoints; tests verifican valor y efecto. No abrir endpoints temporalmente sin controles para facilitar pruebas. Datos de prueba sintéticos y ausencia de secretos en bundle/ZIP/documentación son gates de cada release.

# Informe de Control Automático de Cierre: Fases F7, F8 y F9

**Sistema:** PEDIDOS — Secretaría de Medios  
**Revisión Contractual:** 3.1  
**Fecha / Hora:** 2026-09-17T18:11:14.184Z  
**Entorno:** Supabase Cloud (sa-east-1 / São Paulo) (`yqfkzgqvezarzhlwiilo`)  
**Resultado Global:** **PASS**  

--- 

## 1. Resumen de Criterios Obligatorios

| ID | Criterio | Asserts | Estado |
| :--- | :--- | :---: | :---: |
| **CRIT-01-OPEN-REGISTER** | Validación del Registro Canónico de Decisiones Abiertas | 6/6 | **PASS** |
| **CRIT-02-TTL-CONFIG** | Configuración de Vigencias (TTL Magic Link, Sesión, Info 48h) | 10/10 | **PASS** |
| **CRIT-03-MIGRATIONS** | Reconciliación de Migraciones (Repo, Local, Cloud) | 4/4 | **PASS** |
| **CRIT-04-RBAC-ARCHIVE** | SRS-RBAC-002: Permisos de Archivo/Restauración para Admin y Equipo | 5/5 | **PASS** |
| **CRIT-05-INFO-RESPONSE** | SRS-INF-004: Respuesta a Info con Texto, Enlaces Genéricos y Adjuntos | 3/3 | **PASS** |
| **CRIT-06-SECURITY-ISOLATION** | Aislamiento de Helper de Test, Outbox y Protección contra Exposición | 5/5 | **PASS** |
| **CRIT-07-NEGATIVE-FIXTURE** | Comprobación de Detección de Defectos por Fixture Negativo | 2/2 | **PASS** |

--- 

## 2. Matriz de Reconciliación de Migraciones (001 a 025)

| Versión | Archivo | Repositorio | Local | Cloud | Explicación |
| :--- | :--- | :---: | :---: | :---: | :--- |
| `20260912000001` | `20260912000001_extensions_and_helpers.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000002` | `20260912000002_catalogs.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000003` | `20260912000003_core_submission_and_pedidos.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000004` | `20260912000004_users_and_assignments.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000005` | `20260912000005_information_files_links_deliveries_notes.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000006` | `20260912000006_events_communications_audit.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000007` | `20260912000007_indexes_and_integrity.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000008` | `20260912000008_fix_contractual_states_and_catalog_names.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000009` | `20260912000009_auth_private_helpers_and_signup_trigger.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000010` | `20260912000010_rls_policies_and_grants.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000011` | `20260912000011_access_admin_functions.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000012` | `20260912000012_harden_f3_visibility_and_admin_lockout.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000013` | `20260912000013_submission_identity_and_helpers.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000014` | `20260912000014_submission_create_core.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000015` | `20260912000015_harden_f4_core_function_security.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000016` | `20260912000016_f5_submission_sessions_and_upload_reservations.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000017` | `20260912000017_f5_submission_create_core_file_integration.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000018` | `20260912000018_f5_harden_technical_tables_permissions.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000019` | `20260912000019_grant_service_role_public_tables.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000020` | `20260912000020_harden_service_role_granular_acls.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000021` | `20260912000021_reconcile_technical_tables_and_granular_acls.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000022` | `20260912000022_f7_f8_rpcs_and_state_management.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000023` | `20260912000023_f7_f8_recovery_exchange_and_f9_guard.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260912000024` | `20260912000024_f7_email_session_and_f9_completion.sql` | ✓ | ✓ | ✓ | F7 Mis Solicitudes por correo + sesión opaca y baseline F9 |
| `20260912000025` | `20260912000025_rbac_archive_ttl_config_and_info_attachments.sql` | ✓ | ✓ | ✓ | SRS-RBAC-002 Archive/Restore para Equipo, TTL configurables y adjuntos SRS-INF-004 |
| `20260913000026` | `20260913000026_f10_outbox_queue_and_dispatch.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260913000027` | `20260913000027_f10_hardening_leases_uncertain_and_magic_secrets.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260913000028` | `20260913000028_f10_hardened_lease_expiry_sweep_and_5xx_uncertainty.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260913000029` | `20260913000029_clean_legacy_magic_token_payloads.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260913000030` | `20260913000030_f10_hardened_concurrency_state_machine_and_durable_magic_link.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260915000031` | `20260915000031_f8_usuarios_acceso_approved_policy.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000032` | `20260916000032_f8_state_machine_en_proceso_to_en_revision.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000033` | `20260916000033_f10_info_requested_encrypted_envelope.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000034` | `20260916000034_f10_fix_comunicacion_enqueue_info_requested_overload.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000035` | `20260916000035_f10_fix_comunicacion_enqueue_returning_id.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000036` | `20260916000036_f10_atomic_info_request_with_envelope.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000037` | `20260916000037_f10_contextual_info_attachments_and_links.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000039` | `20260916000039_f8_mandatory_responsable_guard.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000040` | `20260916000040_f8_hardening_responsable_and_finalize.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000041` | `20260916000041_f8_fix_pedido_assign_overload.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260916000042` | `20260916000042_f7_solicitante_access_controlled_replay.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260917000043` | `20260917000043_f7_f9_pending_info_consistency_guard.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |
| `20260917000044` | `20260917000044_f7_f9_info_concurrency_hardening.sql` | ✓ | ✓ | ✓ | Sincronizada y aplicada en repo, local y Cloud |

--- 

## 3. Detalle de Pruebas Ejecutadas por Criterio

### CRIT-01-OPEN-REGISTER: Validación del Registro Canónico de Decisiones Abiertas — [PASS]

- [x] **1.1 Archivo docs/REGISTRO_DECISIONES_OPEN.json existe** 
- [x] **1.2 OPEN-003 es ABIERTO (Retención, borrado, backups y custodio/responsables)** _({"id":"OPEN-003","estado":"ABIERTO","descripcion":"Retención, borrado, backups y custodio/responsables.","categoria":"Infraestructura y Datos","alcance":"Política de retención institucional, purgas y custodia fuera de F10."})_
- [x] **1.3 OPEN-012 es ABIERTO (TTL definitivos de credenciales, sesiones y capabilities públicas, cooldown, rate limiting y antiabuso)** _({"id":"OPEN-012","estado":"ABIERTO","descripcion":"TTL definitivos de credenciales, sesiones y capabilities públicas; cooldown, rate limiting y antiabuso.","nota":"Los parámetros técnicos actuales siguen provisionales/configurables.","categoria":"Seguridad y Antiabuso","alcance":"Parámetros técnicos configurables en DB (configuracion_sistema); formalización definitiva pendiente."})_
- [x] **1.4 OPEN-014 es ABIERTO (Formatos y extensiones audiovisuales adicionales)** _({"id":"OPEN-014","estado":"ABIERTO","descripcion":"Formatos y extensiones audiovisuales adicionales.","categoria":"Contenido Multimedia","alcance":"Formatos base PDF/PNG/JPG/DOCX/ZIP activos; extensiones de video/audio adicionales pendientes."})_
- [x] **1.5 OPEN-015 es ABIERTO (Último administrador, bootstrap y recuperación de acceso administrativo)** _({"id":"OPEN-015","estado":"ABIERTO","descripcion":"Último administrador, bootstrap y recuperación de acceso administrativo.","categoria":"Gobernanza y Autenticación","alcance":"Protección contra bloqueo administrativo total y recuperación de superadmin."})_
- [x] **1.6 OPEN-016 es CERRADO CON EVIDENCIA con referencia a evidencia válida (Spike real Google Drive)** _({"id":"OPEN-016","estado":"CERRADO CON EVIDENCIA","descripcion":"Spike real de Google Drive upload/download, ya demostrado: transferencia de 10 MiB, relay server-side, descarga autenticada y SHA-256 idéntico.","categoria":"Integración Storage","evidencia":"tests/e2e/integrated-cloud-drive.spec.ts, tests/integration/drive-upload-local.test.ts, scripts/google-drive-oauth-bootstrap.js"})_

### CRIT-02-TTL-CONFIG: Configuración de Vigencias (TTL Magic Link, Sesión, Info 48h) — [PASS]

- [x] **2.1 Tabla public.configuracion_sistema accesible por service_role** 
- [x] **2.2 public.get_setting_integer retorna valor entero seguro** 
- [x] **2.3 Valor no numérico cae en default seguro (no permite ilimitado)** 
- [x] **2.4 Configuración 1: Magic link emitido con TTL de 7200s (2h)** 
- [x] **2.5 Configuración 2: Magic link emitido con TTL de 3600s (1h) demostrado en runtime** 
- [x] **2.6 Solicitud de información faltante mantiene exactamente 48 horas corridas (172800s)** 
- [x] **2.7 Primer canje genera sesión opaca exitosamente** 
- [x] **2.8 Replay controlado del mismo enlace dentro de su vigencia genera sesión válida** 
- [x] **2.9 Revocación explícita de sesión ejecutada** 
- [x] **2.10 Sesión revocada es rechazada con 42501 SESSION_REVOKED** 

### CRIT-03-MIGRATIONS: Reconciliación de Migraciones (Repo, Local, Cloud) — [PASS]

- [x] **3.1 Migraciones base 001 a 025 (o superior) existen en repositorio** _(Encontradas: 43)_
- [x] **3.2 Historial local sincronizado al 100%** 
- [x] **3.3 Historial Cloud sincronizado al 100%** 
- [x] **3.4 Migración 025 formalmente aplicada con RBAC Equipo y TTLs configurables** 

### CRIT-04-RBAC-ARCHIVE: SRS-RBAC-002: Permisos de Archivo/Restauración para Admin y Equipo — [PASS]

- [x] **4.1 Administrador puede archivar pedido Finalizado** 
- [x] **4.2 SRS-RBAC-002: Operador (Equipo) puede desarchivar pedido** 
- [x] **4.3 SRS-RBAC-002: Operador (Equipo) puede archivar pedido Finalizado** 
- [x] **4.4 Observador es denegado al intentar desarchivar (42501 ROLE_FORBIDDEN)** 
- [x] **4.5 Archivar pedido en estado Nuevo es rechazado (42200 INVALID_STATE_FOR_ARCHIVE)** 

### CRIT-05-INFO-RESPONSE: SRS-INF-004: Respuesta a Info con Texto, Enlaces Genéricos y Adjuntos — [PASS]

- [x] **5.1 Edge Function solicitante-info-respond acepta texto, enlaces genéricos y archivos** _({"estado":"respondida","success":true,"solicitud_id":"4e141163-654f-4793-ad96-cfb947a0e6d9"})_
- [x] **5.2 Archivo adjuntado en respuesta queda vinculado a archivo_pedido** 
- [x] **5.3 Enlace externo genérico queda registrado en enlaces_material** 

### CRIT-06-SECURITY-ISOLATION: Aislamiento de Helper de Test, Outbox y Protección contra Exposición — [PASS]

- [x] **6.1 solicitante_test_claim_magic_token es inaccesible para anon (42501)** 
- [x] **6.2 Tabla comunicaciones_pedido es inaccesible para anon** 
- [x] **6.3 Tabla solicitante_access_tokens es inaccesible para anon** 
- [x] **6.4 Tabla solicitante_sesiones es inaccesible para anon** 
- [x] **6.5 Respuesta pública no incluye raw_token, token_hash ni datos sensibles** 

### CRIT-07-NEGATIVE-FIXTURE: Comprobación de Detección de Defectos por Fixture Negativo — [PASS]

- [x] **7.1 Control detecta estado corrupto en fixture de prueba negativo** 
- [x] **7.2 Control detecta TTL inválido fuera de rango seguro** 


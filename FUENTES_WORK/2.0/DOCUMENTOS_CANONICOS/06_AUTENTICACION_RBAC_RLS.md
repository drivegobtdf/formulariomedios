# 06 — Autenticación, RBAC y RLS

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


## 1. Modelo
Supabase Auth autentica al personal interno. El público no crea cuenta.

```text
auth.users
   1
   │
   1
usuarios_acceso
   ├─ estado_acceso
   └─ app_role
```

## 2. Claves API
Usar publishable key en navegador y secret key solo server-side. La publishable key mapea a `anon` sin usuario y `authenticated` con sesión; RLS decide acceso. La secret key es elevada y no se expone.

## 3. Capas de identidad
**Rol técnico:** `anon`, `authenticated`, `service_role`.  
**Rol de aplicación:** `equipo_interno`, `admin`.  
**Estado:** `pendiente`, `aprobado`, `revocado`.

Autenticarse no equivale a ser autorizado.

## 4. Alta
1. `signUp`.
2. Crear `usuarios_acceso` pending.
3. No acceso operativo.
4. Admin aprueba y asigna rol.
5. RLS habilita operaciones desde ese momento.

El cliente nunca elige su rol.

## 5. Matriz
| Recurso | anon | pending/revoked | equipo aprobado | admin |
|---|---:|---:|---:|---:|
| catálogo público mínimo | SELECT | SELECT | SELECT | SELECT |
| pedidos | no | no | SELECT | SELECT |
| servicios | no | no | SELECT | SELECT |
| info interna | no | no | SELECT | SELECT |
| archivos | no directo | no | según permiso | según permiso |
| comunicaciones | no | no | lectura necesaria | lectura |
| usuarios | no | propio mínimo | responsables vía RPC | administrar |
| audit | no | no | limitado/ninguno | lectura |

## 6. Grants + RLS
Por cada tabla expuesta:
1. revocar privilegios innecesarios;
2. conceder solo operaciones requeridas;
3. habilitar RLS;
4. crear policies;
5. test allow/deny.

No dar `INSERT/UPDATE/DELETE` genérico a `anon`.

## 7. Patrón de aprobación
Policy/RPC debe comprobar:
- `auth.uid()`;
- fila `usuarios_acceso`;
- `estado_acceso='aprobado'`;
- rol permitido.

Evitar policies recursivas sobre `usuarios_acceso`.

## 8. SECURITY DEFINER
Solo si es necesario:
- función pequeña;
- `SET search_path=''`;
- schemas explícitos;
- auth/role dentro;
- `REVOKE EXECUTE FROM PUBLIC`;
- grants mínimos;
- sin SQL dinámico proveniente de usuario.

## 9. RPC críticas
Las tablas pueden negar UPDATE directo y exponer RPCs que limitan exactamente qué campos/acciones son válidos.

## 10. Primer administrador
No auto-elevar signup. Crear identidad por canal administrativo, verificarla y elevarla mediante migration/SQL controlada y auditada.

## 11. Sesión frontend
Usar `supabase-js` con refresh/persistencia apropiados. No loguear JWT. Logout explícito.

## 12. Revocación
RLS consulta `estado_acceso`; un JWT aún vigente no debe mantener permisos de negocio después de revocar.

## 13. WordPress
La sesión `wp_users` no autoriza PEDIDOS. WordPress admin y PEDIDOS admin son roles independientes.


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

## 14. Matriz de exposición efectiva requerida
| Superficie | Público sin Auth | Auth pendiente/revocado/sin perfil | Equipo aprobado | Admin aprobado | Backend controlado |
|---|---|---|---|---|---|
| Catálogo mínimo activo | Lectura DTO | Lectura DTO | Lectura DTO | Lectura DTO | Mantenimiento controlado |
| Datos PED/servicios | Solo Edge + token válido | Sin lectura operativa por sesión | Lectura operativa mínima | Lectura operativa mínima | Según operación |
| Escrituras operativas genéricas | No | No | No | No | No interfaz arbitraria |
| RPC internas permitidas | No | No | Según operación y matriz funcional | Según operación | Según necesidad |
| Perfiles | No | Propio mínimo | Propio mínimo / responsables DTO | Administración controlada | Alta validada |
| Hashes/sobres/reservas/colas | No | No | No | No SELECT directo | Funciones específicas |
| Storage | Capacidades firmadas/contexto | Sin permiso operativo por sesión | Autorización por archivo | Autorización por archivo | Operación específica |

El acceso con un token público válido es independiente de una sesión interna pendiente: no debe convertirla en autorizada. Un anon o usuario interno no puede saltarse Edge invocando pedidos_create u otras RPC server-only. Revocar EXECUTE de PUBLIC, anon y authenticated en esas RPC y otorgarlo exclusivamente al rol backend requerido. La política por defecto de nuevas funciones también debe quedar restringida. Revisar views, grants de columnas y funciones expuestas: RLS filtra filas, no sustituye minimización de columnas.

## 15. Alta, recuperación y administración
La creación de perfil debe ser coherente con Auth: trigger/control server-side que normaliza y valida metadatos permitidos, fija pendiente y rol no elevado, y rechaza username conflictivo sin permitir perfiles parciales con acceso. No confiar en app_role o estado recibidos en signup. Definir recuperación de alta fallida y probar colisiones concurrentes.

Login por email o username, significado de rechazo, confirmación de correo y gestión del último administrador quedan OPEN-006. Hasta cerrarlo, no implementar una pantalla o RPC que adopte silenciosamente una alternativa. Cualquier identidad no aprobada queda denegada por defecto.

El primer admin se crea por procedimiento administrativo auditado vinculado a su UUID verificado; no poner cuentas reales o credenciales en seeds. Evitar autoaprobación pública. Gestión posterior de roles requiere comprobación de admin aprobado y preservación del último admin según regla pendiente.

Auth callbacks y reset password deben tener URLs allowlisted por entorno. Los emails de autenticación nativos pertenecen al flujo Supabase Auth; ADR-021 se refiere a comunicaciones de negocio PEDIDOS. No reconstruir Auth en n8n. La entrega de correos Auth/SMTP también se valida antes de producción.

## 16. Revocación y alcance
Comprobar aprobación en cada lectura/escritura protegida, incluidas Edge con cliente elevado, descargas, firma de URLs y RPC. No confiar solo en claims viejos del JWT. Una revocación impide emitir nuevos accesos; documentar el tiempo residual de capacidades ya emitidas y no prometer revocar archivos que ya se descargaron. Si negocio exige revocación inmediata de cada descarga, diseñar autorización por solicitud antes de aprobar ese contrato.

El alcance global de lectura de equipo está documentado en la matriz original y se conserva. Permisos de modificación globales/por área/por responsable deben fijarse antes de las RPC operativas. Cualquier segmentación nueva modifica una decisión funcional y no se presupone.

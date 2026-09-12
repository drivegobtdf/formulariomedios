# 19 — Especificación de formulario y servicios

**Revisión documental:** 3.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión documenta decisiones aprobadas, no ejecuta desarrollo.  
**Autoridad:** decisiones funcionales aprobadas por el propietario el 2026-09-11, ADR vigentes y requisitos de esta revisión.  
**Arquitectura:** `PEDIDOS-WSN-GD-v2` — WordPress.org + Supabase + n8n + Google Drive, con Supabase como fuente de verdad de negocio.  
**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Sustituye:** revisión documental 2.0 del 2026-09-11.  


## 1. Datos personales

| Campo | Requerido |
|---|---:|
| Nombre y apellido | Sí |
| Teléfono / WhatsApp | Sí |
| Correo electrónico | Sí |
| Área/dependencia solicitante | Sí |
| ¿Qué necesitás solicitar? | mínimo 1 |

## 2. Categorías y códigos PED

| Categoría | slug | código |
|---|---|---|
| Diseño gráfico | diseno_grafico | D |
| Cobertura de eventos | cobertura_eventos | C |
| Gacetilla de prensa | gacetilla | G |
| Publicaciones en redes sociales | redes_sociales | R |
| Producción audiovisual | produccion_audiovisual | P |
| Animación y motion graphics | motion_graphics | M |
| Transmisión en vivo / streaming | streaming | S |
| Sitios y contenidos web | sitios_web | W |

Cada pieza/servicio genera un PED.

## 3. Diseño gráfico

Puede elegir una o varias piezas.

### `flyer_rrss`
- Formato.
- Texto.
- Fecha límite.

**No** dividir el texto en título/fecha/hora/lugar salvo cambio futuro.

### `invitacion_digital`
- Nombre del evento.
- Fecha.
- Hora.
- Lugar.
- Modalidad.
- Programa.

### `certificado`
- Nombre de la actividad.
- Firmantes.
- Lista de destinatarios.

### `otros_diseno`
- Descripción de la pieza.
- Medidas o soporte técnico.

Cada pieza seleccionada genera un PED D independiente.

## 4. Cobertura de eventos

`cobertura_eventos`

- Fecha.
- Hora de inicio.
- **Hora de fin (opcional)**.
- Lugar.
- Ciudad.
- Autoridades asistentes.
- Requerimientos de cobertura.

Ciudad baseline: Ushuaia, Río Grande o Tolhuin, salvo ampliación explícita futura.

## 5. Gacetilla de prensa

`gacetilla`

- Referente de contacto.
- Teléfono de contacto directo.
- Datos del hecho noticioso / información base.

## 6. Publicaciones en redes sociales

`redes_sociales`

- Fecha sugerida de publicación.
- Texto / copy.
- Enlaces de referencia.

## 7. Patrón de asesoramiento para 4 categorías nuevas

Mostrar al inicio:

**¿Necesitás asesoramiento para definir la pieza?**

Opciones:
- Sí, necesito asesoramiento.
- No, sé lo que necesito.

Si Sí:
- `objetivo_asesoramiento`: texto breve requerido;
- `contacto_preferido`: WhatsApp | email;
- reutilizar teléfono/email de Datos personales;
- permitir `Editar mis datos de contacto`;
- opcionalmente botones `Abrir WhatsApp` / `Enviar correo` cuando existan contactos institucionales configurados;
- no exigir campos técnicos restantes;
- crear igualmente un PED de esa categoría;
- mostrar en gestión `Requiere asesoramiento`.

## 8. Producción audiovisual

`produccion_audiovisual`

Si no necesita asesoramiento:

**Tipo de producción**
- Video institucional.
- Entrevista.
- Reel.
- Edición de material existente.
- Otro.

Campos:
- Descripción / objetivo.
- Formato: Horizontal 16:9 | Vertical 9:16 | Cuadrado 1:1 | No estoy seguro.
- Fecha límite.
- ¿Requiere grabación?: Sí/No.

Si requiere grabación:
- Fecha de grabación.
- Hora.
- Lugar.
- Ciudad.

Si es edición de material existente:
- Material a editar / enlace de referencia (opcional).
- Adjuntos generales según límites.

No pedir codec/FPS/resolución avanzada al solicitante.

## 9. Animación y motion graphics

`motion_graphics`

Tipo:
- Placa animada.
- Títulos animados.
- Infografía en movimiento.
- Video explicativo animado.
- Otro.

Campos:
- Texto / contenido.
- Descripción de lo que necesita.
- Formato: 16:9 | 9:16 | 1:1 | No estoy seguro.
- Duración aproximada (opcional).
- Fecha límite.
- Referencias o ejemplos (opcional).

## 10. Transmisión en vivo / streaming

`streaming`

Tipo:
- Transmisión en vivo de un evento.
- Link / sala de Zoom.
- Link / sala de Google Meet.
- Sala de streaming.
- Otro.

Campos generales:
- Nombre del evento / actividad.
- Fecha.
- Hora de inicio.
- Hora de fin (opcional).
- Modalidad: Presencial | Virtual | Híbrida.
- Descripción / requerimientos.

Si Presencial/Híbrida:
- Lugar.
- Ciudad.

Si requiere sala/link:
- Cantidad estimada de participantes (opcional).

## 11. Sitios y contenidos web

`sitios_web`

Tipo:
- Crear una página.
- Actualizar una página existente.
- Landing page.
- Formulario.
- Actualizar contenido.
- Otro.

Campos:
- Descripción / objetivo.
- ¿Existe actualmente una página relacionada?: Sí/No.
- Si Sí: URL.
- Contenido o cambios solicitados.
- Fecha límite.
- Enlaces de referencia (opcional).

No pedir CMS, hosting, DNS o HTML al solicitante salvo necesidad futura.

## 12. Adjuntos

- Máximo 10 archivos por presentación inicial.
- Máximo 10 MB por archivo.
- Baseline MIME/extensiones aún aprobado: PDF, PNG, JPG/JPEG, DOCX, ZIP.
- `OPEN-014`: decidir MP4/MOV/u otros si se quieren subir pequeños audiovisuales.
- Material superior al límite: `Link al material (opcional)`.

### Un solo PED
No preguntar asociación: aplica a ese PED.

### Varios PED
Por archivo/link:
- Todas las solicitudes.
- Una solicitud específica.

La UI debe usar nombres de pieza, no UUID.

## 13. Resumen y confirmación

Mostrar:
- contacto;
- cada pieza;
- campos;
- adjuntos;
- asociación;
- links.

Permitir Editar por bloque.

Checkbox:
`Confirmo que revisé los datos y que la información ingresada es correcta.`

Botón:
`Enviar solicitudes`.

## 14. Resultado

Ejemplo:

- Flyer — `PED-2026-D000101`.
- Invitación — `PED-2026-D000102`.
- Cobertura — `PED-2026-C000103`.

Un único email inicial contiene todos.

## 15. Numeración

El código refleja categoría; la secuencia `000101/000102/000103` es global anual.

## 16. Validación

UI y server-side deben compartir contrato versionado. Longitudes, bytes exactos de 10 MB y MIME finales se fijan como constantes de schema; no esconder reglas solo en frontend.

## 17. Criterio de cierre

No considerar implementado hasta probar:
- cada campo/condicional;
- asesoramiento;
- multi-PED;
- asociación de material;
- límites;
- resumen;
- idempotencia;
- accesibilidad.

# 19 — Especificación de formulario y servicios

**Revisión documental:** 2.0 · 2026-09-11  
**Estado de implementación:** NO VERIFICADO; esta revisión no ejecuta desarrollo.  
**Autoridad:** ADR/requisitos aprobados y registro de pendientes del documento 17.  
**Evidencia:** el baseline receptor es DOCUMENTADO por informe previo; los resultados de QA son planificados salvo evidencia explícita.

**Repositorio oficial del desarrollo:** `https://github.com/drivegobtdf/formulariomedios`  
**Repositorio fuente de auditoría WeWeb:** `https://github.com/saldiviapablo/formulariopedidos`  
**Arquitectura:** `PEDIDOS-WSN-SC-v1`


Este documento congela los campos funcionales verificados que deben servir como baseline de paridad. La implementación podrá mejorar labels/validación sin eliminar información necesaria.

## 1. Paso 1 — Datos

| Campo | Tipo | Requerido | Baseline |
|---|---|---:|---|
| Nombre y apellido | text | Sí | mínimo 3 caracteres, trim |
| Teléfono | tel/text | Sí | formato de contacto válido |
| Correo electrónico | email | Sí | formato email |
| Área solicitante | select/text | Sí | Ministerio/Secretaría/Ente |
| ¿Qué necesitás solicitar? | checkboxes | Sí | mínimo 1 |

Categorías:
- `diseno_grafico` — Diseño gráfico
- `cobertura_eventos` — Cobertura de eventos
- `gacetilla` — Gacetilla de prensa
- `redes_sociales` — Publicaciones en redes sociales

**Terminología:** `area_solicitante` es el organismo de origen. Las cuatro opciones son áreas/categorías internas de producción y no deben confundirse con el organismo.

## 2. Paso 2 — Diseño gráfico
Permite elegir una o varias piezas.

### `flyer_rrss`
- formato: 1:1, 9:16, historia u opción vigente;
- texto principal/copy;
- fecha límite.

### `invitacion_digital`
- nombre del evento;
- fecha;
- hora;
- lugar;
- modalidad;
- programa.

### `certificado`
- nombre de la actividad;
- firmantes;
- lista de destinatarios.

### `otros_diseno`
- descripción de la pieza;
- medidas o soporte técnico.

## 3. Cobertura de eventos
Tipo `cobertura_eventos`.

Campos baseline obligatorios auditados:
- fecha;
- hora inicio;
- hora fin;
- lugar;
- ciudad: Ushuaia, Río Grande o Tolhuin;
- autoridades asistentes;
- requerimientos de cobertura.

## 4. Gacetilla
Tipo `gacetilla`.

Campos:
- referente de contacto;
- teléfono de contacto directo;
- datos del hecho noticioso / información base.

## 5. Redes sociales
Tipo `redes_sociales`.

Campos:
- fecha sugerida de publicación;
- texto/copy;
- enlaces de referencia.

## 6. Paso 3
- dropzone;
- máximo 5;
- PDF, PNG, JPG/JPEG, DOCX, ZIP;
- máximo 25 MB c/u;
- resumen read-only;
- botón volver;
- botón enviar.

## 7. Extracto de campos de servicios
Cada opción concreta genera un objeto de `servicios[]`; varias piezas de Diseño generan varios servicios dentro del **mismo PED**. El siguiente ejemplo ilustra solo los campos funcionales: no es un request completo. El contrato completo del documento 11 exige además sesión/capacidad, versiones, client_service_ref y reservation_id para adjuntos.

```json
{
  "servicios": [
    {
      "area_slug": "diseno_grafico",
      "tipo_slug": "flyer_rrss",
      "informacion_especifica": {
        "formato": "1:1",
        "copy": "...",
        "fecha_limite": "YYYY-MM-DD"
      }
    },
    {
      "area_slug": "cobertura_eventos",
      "tipo_slug": "cobertura_eventos",
      "informacion_especifica": {
        "fecha": "YYYY-MM-DD",
        "hora_inicio": "HH:mm",
        "hora_fin": "HH:mm",
        "lugar": "...",
        "ciudad": "Ushuaia",
        "autoridades": "...",
        "requerimientos": "..."
      }
    }
  ]
}
```

## 8. Validación
Las reglas exactas adicionales (longitudes máximas, formatos de fecha, etc.) deben definirse como contrato explícito antes de codificar y aplicarse tanto en UI como server-side. No inventar restricciones no presentes en el baseline sin decisión de producto.

## 9. Paridad
El criterio de paridad no exige replicar IDs/variables de WeWeb; exige que el solicitante pueda proporcionar la misma información y que se transforme correctamente en 1 PED + N servicios.


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

## 10. Diccionario contractual y pendientes explícitos
Esta matriz conserva todos los campos del baseline. PENDIENTE significa que no hay decisión suficiente para un validador definitivo; no equivale a opcional. Las claves API ya presentes en ejemplos se conservan; las restantes se fijan junto con el contrato versionado antes de implementar.

| Tipo | Campos preservados | Requerimiento documentado | Pendiente de cierre OPEN-005 |
|---|---|---|---|
| solicitante | nombre_apellido, telefono, correo, area_solicitante | Todos requeridos; nombre trim mínimo 3; email con formato | Máximos, formato de teléfono, select/text y opciones de dependencia |
| selección | Cuatro categorías y tipos asociados | >=1 categoría; Diseño >=1 pieza | Repetir mismo tipo, máximo servicios, cambio de selección con datos |
| flyer_rrss | formato, copy, fecha_limite | Campos existentes; obligatoriedad completa PENDIENTE | Enum exacto 1:1/9:16/historia, longitud y fechas |
| invitacion_digital | nombre evento, fecha, hora, lugar, modalidad, programa | Campos existentes; obligatoriedad PENDIENTE | Claves API, enum modalidad, formato de programa y límites |
| certificado | actividad, firmantes, destinatarios | Campos existentes; obligatoriedad PENDIENTE | Texto vs listas, máximos y tratamiento de datos personales |
| otros_diseno | descripción, medidas/soporte | Campos existentes; obligatoriedad PENDIENTE | Unidades, estructura y límites |
| cobertura_eventos | fecha, hora_inicio, hora_fin, lugar, ciudad, autoridades, requerimientos | Todos obligatorios según baseline | Reglas de medianoche/fechas, múltiples jornadas, longitudes |
| gacetilla | referente, teléfono directo, datos del hecho | Campos existentes; obligatoriedad PENDIENTE | Claves, formato, límites |
| redes_sociales | fecha sugerida, copy, enlaces | Campos existentes; obligatoriedad PENDIENTE | Cantidad/formato enlaces, fechas, longitudes |
| adjuntos iniciales | PDF/PNG/JPG/JPEG/DOCX/ZIP | Máx. cinco por presentación, 25 MB cada uno | Bytes exactos (OPEN-012), control visual de asociación por servicio |
| respuesta información | texto y/o archivos autorizados | Token vigente; una respuesta efectiva | Si basta uno de los dos, cupos y longitudes |
| entrega | URL HTTPS + nota según baseline | Entrega válida al finalizar | Destinos admitidos, nota requerida/opcional, alternativa por archivo estable |

## 11. Contrato de fechas y numeración
Guardar instantes técnicos como timestamptz. El significado de fechas y horas de evento debe tener zona definida sin convertir silenciosamente una fecha civil en otro día. Recomendación pendiente de aprobación: zona institucional America/Argentina/Ushuaia para eventos y año PED. Resolver qué ocurre con eventos que cruzan medianoche, fechas pasadas y desborde de seis dígitos. No derivar el año del reloj del navegador.

## 12. Contrato de cada servicio
Toda instancia incluye client_service_ref, tipo_slug, área derivada/validada, form_schema_version e información tipada. El servidor rechaza tipo inactivo, relación área/tipo inválida, versión no soportada y campos arbitrarios fuera del contrato. Se conservan versiones anteriores para lectura de pedidos históricos. La base técnica de versionado está definida; los enums/longitudes aún pendientes no se completan por intuición.

## 13. Criterio de cierre
Antes de programar validadores/UX, cada fila debe tener nombres API, tipo, obligatoriedad, rango/enum, formato, ejemplo válido, ejemplo inválido y mensaje de error. Producto decide cambios respecto al baseline. Una vez cerrado se actualizan SRS, API, validación DB/Edge y casos QA por tipo. No declarar este documento listo para implementación de campos mientras existan celdas PENDIENTE.

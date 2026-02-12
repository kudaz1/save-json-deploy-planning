# Respaldo: lógica actual de la API save-json

**Fecha del respaldo:** 2026-02-11  
**Archivo de código respaldado:** `server-backup-2026-02-11-complete.js` (copia íntegra de `server.js`)

Este documento describe **toda** la lógica que ejecuta actualmente el endpoint `POST /save-json`.

---

## 1. Middleware previo al handler

- **Ruta:** Solo para `POST /save-json`.
- **Función:** Lee el body en crudo, limpia el JSON (reemplazo de `\'` por `'`, eliminación de caracteres de control), parsea el body y lo asigna a `req.body`. Si falla el parseo, responde 400 y opcionalmente guarda el body en un archivo de debug en `os.tmpdir()`.
- **Ubicación en server.js:** aprox. líneas 801-865.

---

## 2. Flujo del handler POST /save-json (paso a paso)

### Paso 1 – Logging inicial
- Log de keys del body, Content-Type, Content-Length.

### Paso 1.5 – Guardar request original
- **Ruta de guardado:** `jsonControlm/request-{timestamp}.json` (dentro del proyecto).
- **Contenido:** `req.body` tal cual (sin modificar, sin `_capturedAt`).

### Paso 2 – Validaciones
- Extrae: `ambiente`, `token`, `filename`, `jsonData`, `controlm_api`, `script_path`, `returnJsonDataBeforeSave`.
- Aplica `trim` a los strings.
- **Requeridos:** `ambiente`, `token`, `filename`, `jsonData`. Si falta alguno → 400.
- **controlm_api:** si viene, debe ser URL (empezar por `http`) → si no, 400.
- **ambiente:** solo `DEV` o `QA` (normalizado a mayúsculas) → si no, 400.

### Paso 2.5 – Opcional jsonData antes de guardar
- Si `returnJsonDataBeforeSave === true`, se prepara una muestra de `jsonData` para incluir en la respuesta.

### Paso 3 – Parsear jsonData
- Si `jsonData` es **string:** se llama a `convertJsonDataFromJavaMap(jsonData)`:
  - Intenta `JSON.parse`.
  - Si falla, usa `javaMapStringToObject` / `deepParseJavaMap` para convertir formato Java/Map (key=value) a objeto.
  - Luego aplica `normalizeControlMStructure` al resultado.
- Si `jsonData` es **objeto:** se usa directamente.
- Si algo falla → 400 con mensaje de error.

### Paso 4 – Nombre de archivo
- Se usa `filename` (trim).
- Se eliminan caracteres no permitidos: `<>:"|?*` y caracteres de control; se normalizan `_` repetidos.
- Si no termina en `.json`, se añade. Si queda vacío, se usa `archivo.json`.

### Paso 4.5 – Normalización Control-M (primera pasada)
- `parsedJson = normalizeControlMStructure(parsedJson)`.

### Paso 5 – Rutas de almacenamiento
- **Linux (EC2):** `storagePath = path.resolve(__dirname, 'jsonControlm')`.
- **Windows (local):** `storagePath = os.homedir() + '/Desktop/jsonControlm'`.
- **Fallback (si EPERM en Desktop):** `path.resolve(__dirname, 'jsonControlm')`.
- `filePath = path.resolve(storagePath, fileName)`.

### Paso 6 – Crear carpetas
- Se crean `Desktop` (solo en no-Linux) y `storagePath` con `fs.mkdirSync(..., { recursive: true })`.

### Paso 7 – Pipeline de transformación Control-M (orden fijo)
1. **ensureControlMNameValueArrays(parsedJson)** – Recorre el árbol; no convierte a `{ name, value }` explícito (la API rechaza "name" en muchos contextos).
2. **ensureControlMTypeFirst(parsedJson)** – Pone `Type` primero donde exista; envuelve en tipo:
   - `DestinationFilename` → `{ DestinationFilename: v }`
   - `FileWatcherOptions` → `{ FileWatcherOptions: v }`
   - **FileTransfers / FileTransfer (array):** se filtra los ítems que son otro Job (ej. Job:OS400); el resto se procesa y se asigna a **`FileTransfers`** como objeto: `{ "0": { FileTransfer: item1 }, "1": { FileTransfer: item2 } }`.
3. **fixControlMFinal(parsedJson)** – Pase final:
   - Objetos con `ModifyCase` y sin Type/DestinationFilename primero → se envuelve en `{ DestinationFilename: { DestinationFilename: inner } }`.
   - Objetos cuya primera clave es **ABSTIME** → se aplana: se sustituye por `{ Type: 'When', ...contenido de ABSTIME }` (no se conserva la clave `ABSTIME`).
   - Resto de objetos: se recorren las claves y se aplica `fixControlMFinal` a los valores.
- Después se hace `JSON.stringify(parsedJson, null, 2)` para obtener el string a escribir.

### Paso 8 – Escribir archivo
- `fs.writeFileSync(filePath, jsonString, 'utf8')`.
- Si falla con EPERM/EACCES y no estamos ya en `projectStoragePath`, se intenta escribir en `path.resolve(__dirname, 'jsonControlm')` y se actualiza `storagePath` y `filePath`.

### Paso 8.5 – Guardar request (segunda copia)
- **Ruta:** `storagePath/request-{basename del filename}.json`.
- **Contenido:** Objeto con `timestamp`, `ambiente`, `token` (enmascarado), `filename`, `controlm_api`, `script_path`, `returnJsonDataBeforeSave`, `jsonData`.

### Pasos 9–11 – Verificación
- Comprobar que el archivo existe, que tiene tamaño > 0, leer contenido y validar con `JSON.parse`.

### Después del guardado – Control-M (opcional)
- Si existen `controlm_api` (URL) y `token`, se llama a **executeControlMApi(controlm_api, token, filePath)**:
  - Crea FormData con `definitionsFile` = stream del archivo JSON.
  - POST a la URL con header `Authorization: Bearer {token}` y `rejectUnauthorized: false`.
  - El resultado se devuelve en la respuesta como `controlMResult`.

### Respuesta exitosa
- JSON con `success`, `message`, `filename`, `filePath`, `storagePath`, `fileSize`, `ambiente`, `verified`, `received`, y si aplica `convertedFromJavaMap`, `jsonDataFormat`, `controlMResult`, `jsonDataBeforeSave` (si se pidió).

---

## 3. Funciones auxiliares usadas por save-json (y dónde están)

| Función | Aprox. líneas | Uso en save-json |
|--------|----------------|-------------------|
| **convertJsonDataFromJavaMap** | 323-351 | Paso 3: convertir string Java/Map o JSON a objeto. |
| **normalizeControlMStructure** | 731-798 | Paso 3 (dentro de convert si viene Java/Map), Paso 4.5. Variables, RerunLimit, When, JobAFT, eventsToWaitFor, claves anidadas key=value, Message/Subject, AttachOutput. |
| **javaMapStringToObject** | 38-225 | Usado por convertJsonDataFromJavaMap y por parseKeyValueString. |
| **deepParseJavaMap** | 278-321 | Convierte recursivamente valores en formato Java/Map. |
| **parseKeyValueString** | 23-27 | Valores tipo "Key=Value, ..." dentro de normalizeControlMStructure. |
| **normalizeVariablesField** | 415-455 | Dentro de normalizeControlMStructure para el campo Variables. |
| **ensureRerunLimit** | 469-480 | normalizeControlMStructure. |
| **ensureWhen** | 526-573 | normalizeControlMStructure (When: WeekDays, MonthDays, FromTime, etc.). |
| **ensureJobAFT** | 565-576 | normalizeControlMStructure. |
| **ensureEventsToWaitFor** | 578-591 | normalizeControlMStructure. |
| **ensureAttachOutput** | 597-601 | normalizeControlMStructure. |
| **ensureControlMNameValueArrays** | 609-620 | Paso 7 (primera transformación). |
| **ensureControlMTypeFirst** | 627-681 | Paso 7 (Type primero, FileTransfers como objeto con "0","1" y { FileTransfer }). |
| **fixControlMFinal** | 689-722 | Paso 7 (DestinationFilename wrap, ABSTIME → Type When aplanado). |
| **executeControlMApi** | 1339-1480 | Llamada a Control-M después de guardar (Bearer, form-data definitionsFile). |

Otras funciones que intervienen en el servidor pero no son específicas del “parseo” del JSON: `getStoragePath`, `getDesktopPath`, `getCurrentUser`, etc., para rutas y permisos.

---

## 4. Resumen de decisiones de formato Control-M (actual)

- **ABSTIME:** Objetos con primera clave `ABSTIME` se sustituyen por `{ Type: 'When', ...contenido }` (sin clave ABSTIME).
- **FileTransfers:** Siempre se escribe la clave `FileTransfers` con un objeto cuyas claves son `"0"`, `"1"`, … y cada valor es `{ FileTransfer: <objeto procesado> }`. Se excluyen ítems cuyo `Type` es un Job que no es FileTransfer (ej. Job:OS400).
- **Request guardado:** En paso 1.5 se guarda `req.body` sin modificar en `jsonControlm/request-{timestamp}.json`. En paso 8.5 se guarda un objeto construido (con token enmascarado, etc.) en `storagePath/request-{basename}.json`.

---

Cuando definas la nueva lógica oficial, puedes usar este documento y el archivo `server-backup-2026-02-11-complete.js` como referencia exacta del comportamiento actual.

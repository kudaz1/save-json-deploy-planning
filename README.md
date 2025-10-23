# API para Guardar Archivos JSON y Ejecutar Control-M

Esta API permite recibir un nombre y un JSON, guardar ese JSON como archivo en el escritorio dentro de una carpeta llamada "controlM", y automáticamente ejecutar la API de Control-M correspondiente según el ambiente especificado.

## Instalación

1. Instalar las dependencias:
```bash
npm install
```

## Uso

### Iniciar el servidor localmente

```bash
npm start
```

O para desarrollo con recarga automática:
```bash
npm run dev
```

El servidor se ejecutará en `http://localhost:3000`

### Despliegue en Railway

La API está desplegada en Railway. Para obtener el endpoint público:

1. Ve a tu proyecto en Railway
2. En la sección "Architecture", haz clic en el servicio "save-json-deploy-planning"
3. Ve a la pestaña "Settings"
4. En la sección "Networking", activa "Generate Domain" para exponer el servicio públicamente
5. Railway generará automáticamente una URL pública como: `https://save-json-deploy-planning-production.up.railway.app`

**Endpoint público**: Una vez expuesto, podrás usar la URL generada por Railway para hacer peticiones a la API.

### Endpoints

#### POST /save-json

Guarda un archivo JSON en el escritorio/controlM y ejecuta automáticamente la API de Control-M correspondiente según el ambiente.

**Parámetros del body:**
- `ambiente` (string): Ambiente donde se ejecuta - solo permite "DEV" o "QA"
- `token` (string): Token de autenticación/autorización
- `filename` (string): Nombre del archivo (sin extensión .json)
- `jsonData` (object/string): El JSON a guardar

**Ejemplo de uso:**

```bash
curl -X POST http://localhost:3000/save-json \
  -H "Content-Type: application/json" \
  -d '{
    "ambiente": "DEV",
    "token": "mi-token-123",
    "filename": "mi-archivo",
    "jsonData": {
      "nombre": "ejemplo",
      "valor": 123,
      "array": [1, 2, 3]
    }
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Archivo JSON guardado exitosamente y API ejecutada",
  "filePath": "C:\\Users\\Usuario\\Desktop\\controlM\\mi-archivo.json",
  "filename": "mi-archivo.json",
  "ambiente": "DEV",
  "token": "mi-token-123",
  "controlMApi": {
    "success": true,
    "status": 200,
    "data": { "deploymentId": "12345" },
    "message": "API ejecutada exitosamente para ambiente DEV"
  }
}
```

#### GET /

Endpoint de prueba que muestra información sobre la API y ejemplos de uso.

## Características

- ✅ Crea automáticamente la carpeta "controlM" en el escritorio si no existe
- ✅ Valida que el JSON sea válido antes de guardarlo
- ✅ Agrega automáticamente la extensión .json al nombre del archivo
- ✅ Ejecuta automáticamente la API de Control-M después de guardar el archivo
- ✅ Selecciona automáticamente el servidor correcto según el ambiente (DEV/QA)
- ✅ Envía el archivo JSON como form-data a Control-M con Bearer token
- ✅ Manejo de errores completo
- ✅ Soporte para CORS
- ✅ Formato JSON legible con indentación

## Integración con Control-M

Después de guardar el archivo JSON, la API ejecuta automáticamente:

- **Ambiente DEV**: `https://controlms1de01:8446/automation-api/deploy`
- **Ambiente QA**: `https://controlms2qa01:8446/automation-api/deploy`

La petición se realiza con:
- **Authorization**: Bearer token (usando el campo `token` enviado)
- **Content-Type**: multipart/form-data
- **definitionsFile**: El archivo JSON guardado

## Estructura de archivos generados

Los archivos se guardan en:
```
{Usuario}/Desktop/controlM/
├── archivo1.json
├── archivo2.json
└── ...
```

## Manejo de errores

La API devuelve errores HTTP apropiados:

- `400`: Datos de entrada inválidos
- `500`: Error interno del servidor

Ejemplos de respuestas de error:
```json
{
  "success": false,
  "error": "Se requieren los campos 'ambiente', 'token', 'filename' y 'jsonData'"
}
```

```json
{
  "success": false,
  "error": "El campo 'ambiente' solo puede tener los valores 'DEV' o 'QA'"
}
```

**Nota**: Si la API de Control-M falla, la respuesta incluirá información del error en el campo `controlMApi`:

```json
{
  "success": true,
  "message": "Archivo JSON guardado exitosamente y API ejecutada",
  "filePath": "C:\\Users\\Usuario\\Desktop\\controlM\\mi-archivo.json",
  "filename": "mi-archivo.json",
  "ambiente": "DEV",
  "token": "mi-token-123",
  "controlMApi": {
    "success": false,
    "error": "Request failed with status code 401",
    "status": 401,
    "message": "Error ejecutando API para ambiente DEV"
  }
}
```

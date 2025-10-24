# API para Guardar Archivos JSON y Ejecutar Control-M

Esta API permite recibir un nombre y un JSON, y automáticamente ejecutar la API de Control-M correspondiente enviando el JSON directamente como archivo según el ambiente especificado.

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

Envía directamente el JSON a la API de Control-M correspondiente según el ambiente, sin necesidad de guardar archivos físicamente.

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
  "message": "JSON enviado directamente a Control-M API",
  "filename": "mi-archivo.json",
  "ambiente": "DEV",
  "token": "mi-token-123",
  "jsonSize": 156,
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

- ✅ Envía directamente el JSON a Control-M sin guardar archivos físicamente
- ✅ Valida que el JSON sea válido antes de enviarlo
- ✅ Selecciona automáticamente el servidor correcto según el ambiente (DEV/QA)
- ✅ Envía el JSON como form-data a Control-M con Bearer token
- ✅ Convierte el JSON a Buffer en memoria para envío eficiente
- ✅ Manejo de errores completo
- ✅ Soporte para CORS
- ✅ Optimizado para entornos cloud (Railway, Heroku, etc.)

## Integración con Control-M

La API envía directamente el JSON a Control-M sin guardar archivos físicamente:

- **Ambiente DEV**: `https://controlms1de01:8446/automation-api/deploy`
- **Ambiente QA**: `https://controlms2qa01:8446/automation-api/deploy`

La petición se realiza con:
- **Authorization**: Bearer token (usando el campo `token` enviado)
- **Content-Type**: multipart/form-data
- **definitionsFile**: El JSON convertido a Buffer en memoria

## Ventajas de esta implementación

- **Sin archivos físicos**: El JSON se envía directamente en memoria
- **Más eficiente**: No hay I/O de disco
- **Cloud-friendly**: Funciona perfectamente en Railway, Heroku, etc.
- **Más rápido**: Elimina el paso de guardar y leer archivos
- **Más seguro**: No deja archivos temporales en el servidor

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
  "message": "JSON enviado directamente a Control-M API",
  "filename": "mi-archivo.json",
  "ambiente": "DEV",
  "token": "mi-token-123",
  "jsonSize": 156,
  "controlMApi": {
    "success": false,
    "error": "Request failed with status code 401",
    "status": 401,
    "message": "Error ejecutando API para ambiente DEV"
  }
}
```

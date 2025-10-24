# API para Guardar Archivos JSON y Ejecutar Control-M

Esta API permite recibir un nombre y un JSON, y retorna toda la información necesaria para que el cliente ejecute directamente la API de Control-M desde su máquina local.

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

Retorna toda la información necesaria para que el cliente ejecute directamente la API de Control-M desde su máquina local.

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
  "message": "Información de Control-M lista para ejecutar desde el cliente",
  "filename": "mi-archivo.json",
  "ambiente": "DEV",
  "token": "mi-token-123",
  "jsonSize": 156,
  "controlMInfo": {
    "url": "https://controlms1de01:8446/automation-api/deploy",
    "method": "POST",
    "headers": {
      "Authorization": "Bearer mi-token-123"
    },
    "jsonData": { "jobType": "Job", "application": "MiApp" },
    "filename": "mi-archivo.json"
  },
  "clientInstructions": {
    "message": "Usa la información en controlMInfo para ejecutar la API de Control-M desde tu máquina local",
    "example": "Ver documentación para ejemplos de implementación"
  }
}
```

#### GET /

Endpoint de prueba que muestra información sobre la API y ejemplos de uso.

## Características

- ✅ Retorna información completa para ejecutar Control-M desde el cliente
- ✅ Valida que el JSON sea válido antes de procesarlo
- ✅ Selecciona automáticamente el servidor correcto según el ambiente (DEV/QA)
- ✅ Distribuye la carga: API principal prepara, cliente ejecuta Control-M
- ✅ Clientes disponibles en Node.js y Python
- ✅ Manejo de errores completo
- ✅ Soporte para CORS
- ✅ Optimizado para entornos cloud (Railway, Heroku, etc.)

## Uso del Cliente

La API retorna toda la información necesaria para que ejecutes Control-M desde tu máquina local. Esto tiene varias ventajas:

- **Distribución de carga**: Tu API principal solo prepara la información
- **Ejecución local**: Control-M se ejecuta desde tu máquina, no desde el servidor
- **Mayor control**: Puedes manejar la ejecución y errores localmente
- **Menos dependencias**: El servidor no necesita conectarse a Control-M

### Cliente Node.js

```javascript
const { processWithControlM } = require('./client-control-m');

const result = await processWithControlM(
    'https://tu-url-railway.up.railway.app/save-json',
    {
        ambiente: 'DEV',
        token: 'tu-bearer-token',
        filename: 'mi-archivo',
        jsonData: { "jobType": "Job", "application": "MiApp" }
    }
);
```

### Cliente Python

```python
from client_control_m import ControlMClient

client = ControlMClient()
result = client.process_with_control_m(
    'https://tu-url-railway.up.railway.app/save-json',
    {
        'ambiente': 'DEV',
        'token': 'tu-bearer-token',
        'filename': 'mi-archivo',
        'jsonData': { "jobType": "Job", "application": "MiApp" }
    }
)
```

## Integración con Control-M

La API prepara toda la información necesaria para que el cliente ejecute Control-M:

- **Ambiente DEV**: `https://controlms1de01:8446/automation-api/deploy`
- **Ambiente QA**: `https://controlms2qa01:8446/automation-api/deploy`

La petición se configura con:
- **Authorization**: Bearer token (usando el campo `token` enviado)
- **Content-Type**: multipart/form-data
- **definitionsFile**: El JSON convertido a Buffer en memoria

El cliente ejecuta la petición desde su máquina local usando la información proporcionada.

## Ventajas de esta implementación

- **Distribución de carga**: El servidor solo prepara, el cliente ejecuta
- **Sin archivos físicos**: El JSON se maneja directamente en memoria
- **Más eficiente**: No hay I/O de disco en el servidor
- **Cloud-friendly**: Funciona perfectamente en Railway, Heroku, etc.
- **Mayor control**: El cliente maneja la ejecución y errores localmente
- **Más seguro**: No deja archivos temporales en el servidor
- **Escalabilidad**: El servidor no necesita conectarse a Control-M

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

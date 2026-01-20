# API para Guardar Archivos JSON y Ejecutar Control-M

API Node.js/Express que guarda archivos JSON en una instancia EC2 y ejecuta la API de Control-M usando los archivos guardados. Los archivos se almacenan en `/Desktop/jsonControlm` dentro de la instancia EC2.

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

### Despliegue en EC2

La API está diseñada para ejecutarse en una instancia EC2. Los archivos JSON se guardan en `/Desktop/jsonControlm` dentro de la instancia.

**Configuración en EC2:**

1. Clonar el repositorio:
```bash
git clone https://github.com/kudaz1/save-json.git
cd save-json
```

2. Instalar dependencias:
```bash
npm install
```

3. Crear la carpeta de almacenamiento (si no existe):
```bash
sudo mkdir -p /Desktop/jsonControlm
sudo chmod 755 /Desktop
sudo chmod 755 /Desktop/jsonControlm
```

4. Iniciar el servidor:
```bash
npm start
```

O usar PM2 para producción:
```bash
npm install -g pm2
pm2 start server.js --name save-json-api
pm2 save
pm2 startup
```

**Nota**: Si no tienes permisos para crear `/Desktop`, la API usará automáticamente `~/Desktop/jsonControlm` como fallback.

### Endpoints

#### POST /save-json

Guarda un archivo JSON en `/Desktop/jsonControlm` dentro de la instancia EC2.

**Parámetros del body:**
- `ambiente` (string): Ambiente donde se ejecuta - solo permite "DEV" o "QA"
- `token` (string): Token de autenticación/autorización para Control-M
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
  "message": "Archivo guardado exitosamente en EC2",
  "filename": "mi-archivo.json",
  "filePath": "/Desktop/jsonControlm/mi-archivo.json",
  "storagePath": "/Desktop/jsonControlm",
  "ambiente": "DEV"
}
```

#### POST /execute-controlm

Ejecuta la API de Control-M usando un archivo previamente guardado en EC2.

**Parámetros del body:**
- `ambiente` (string): Ambiente donde se ejecuta - solo permite "DEV" o "QA"
- `token` (string): Token de autenticación/autorización para Control-M
- `filename` (string): Nombre del archivo (sin extensión .json)

**Ejemplo de uso:**

```bash
curl -X POST http://localhost:3000/execute-controlm \
  -H "Content-Type: application/json" \
  -d '{
    "ambiente": "DEV",
    "token": "mi-token-123",
    "filename": "mi-archivo"
  }'
```

**Respuesta exitosa:**
```json
{
  "success": true,
  "message": "Control-M ejecutado exitosamente",
  "ambiente": "DEV",
  "filename": "mi-archivo.json",
  "filePath": "/Desktop/jsonControlm/mi-archivo.json",
  "controlMResponse": { ... },
  "status": 200
}
```

#### POST /save-and-execute

Guarda el archivo JSON y ejecuta Control-M en un solo paso.

**Parámetros del body:**
- `ambiente` (string): Ambiente donde se ejecuta - solo permite "DEV" o "QA"
- `token` (string): Token de autenticación/autorización para Control-M
- `filename` (string): Nombre del archivo (sin extensión .json)
- `jsonData` (object/string): El JSON a guardar y ejecutar

**Ejemplo de uso:**

```bash
curl -X POST http://localhost:3000/save-and-execute \
  -H "Content-Type: application/json" \
  -d '{
    "ambiente": "DEV",
    "token": "mi-token-123",
    "filename": "mi-archivo",
    "jsonData": {
      "jobType": "Job",
      "application": "MiApp"
    }
  }'
```

#### GET /diagnostic

Muestra información de diagnóstico del sistema EC2, incluyendo la ruta de almacenamiento y los archivos guardados.

#### GET /

Endpoint raíz que muestra información sobre la API y ejemplos de uso de todos los endpoints.

## Características

- ✅ Guarda archivos JSON en `/Desktop/jsonControlm` dentro de EC2
- ✅ Ejecuta Control-M API usando archivos guardados en el sistema de archivos
- ✅ Valida que el JSON sea válido antes de procesarlo
- ✅ Selecciona automáticamente el servidor correcto según el ambiente (DEV/QA)
- ✅ Crea automáticamente la carpeta de almacenamiento si no existe
- ✅ Manejo de errores completo
- ✅ Soporte para CORS
- ✅ Optimizado para instancias EC2
- ✅ Endpoint de diagnóstico para monitoreo

## Almacenamiento

Los archivos JSON se guardan en:
- **Ruta preferida**: `/Desktop/jsonControlm/` (requiere permisos)
- **Ruta fallback**: `~/Desktop/jsonControlm/` (si no se puede crear /Desktop)

La carpeta se crea automáticamente al iniciar el servidor si no existe.

## Integración con Control-M

La API ejecuta Control-M directamente desde la instancia EC2 usando los archivos guardados:

- **Ambiente DEV**: `https://controlms1de01:8446/automation-api/deploy`
- **Ambiente QA**: `https://controlms2qa01:8446/automation-api/deploy`

La petición se configura con:
- **Authorization**: Bearer token (usando el campo `token` enviado)
- **Content-Type**: multipart/form-data
- **definitionsFile**: El archivo JSON leído desde `/Desktop/jsonControlm/`

El archivo se lee directamente del sistema de archivos de EC2 antes de enviarse a Control-M.

## Ventajas de esta implementación

- **Persistencia**: Los archivos se guardan en el sistema de archivos de EC2
- **Trazabilidad**: Puedes ver qué archivos se han guardado usando `/diagnostic`
- **Reutilización**: Puedes ejecutar Control-M múltiples veces con el mismo archivo
- **Almacenamiento centralizado**: Todos los archivos en una ubicación conocida
- **Ejecución desde EC2**: Control-M se ejecuta directamente desde la instancia
- **Manejo de errores**: Validación completa antes de guardar y ejecutar

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

# Cómo Verificar que Control-M se Llama Correctamente

## Método 1: Usar el Endpoint de Verificación (Más Fácil)

Después de ejecutar tu `curl` a `/save-json`, puedes verificar exactamente cómo se llamó a Control-M usando:

```bash
curl http://localhost:3000/last-controlm-call
```

Este endpoint te mostrará:
- ✅ URL exacta que se usó
- ✅ Token (primeros y últimos caracteres)
- ✅ Archivo que se envió
- ✅ Headers de la petición
- ✅ Respuesta de Control-M (si fue exitosa)
- ✅ Errores (si hubo alguno)
- ✅ Comparación con lo esperado

### Ejemplo de respuesta:

```json
{
  "success": true,
  "message": "Información de la última llamada a Control-M",
  "call": {
    "timestamp": "2024-01-15T10:30:00.000Z",
    "url": "https://controlms1de01:8446/automation-api/deploy",
    "token": "3DFAE7FC808867A6E3...A613",
    "filePath": "/root/Desktop/jsonControlm/archivo.json",
    "fileName": "archivo.json",
    "fileSize": 1234,
    "fileExists": true,
    "status": "success",
    "headers": {
      "Content-Type": "multipart/form-data; boundary=...",
      "Authorization": "Bearer 3DFAE7FC808867A6E3...A613"
    },
    "formData": {
      "field": "definitionsFile",
      "filename": "archivo.json",
      "contentType": "application/json",
      "filePath": "/root/Desktop/jsonControlm/archivo.json"
    },
    "response": {
      "status": 200,
      "statusText": "OK",
      "duration": 1234,
      "data": {...}
    }
  },
  "comparison": {
    "matches": {
      "url": true,
      "hasToken": true,
      "hasFormField": true,
      "fileExists": true
    }
  }
}
```

## Método 2: Ver Logs en Tiempo Real

### Si usas PM2:

```bash
# Ver logs en tiempo real
pm2 logs save-json-api --lines 0

# O en otra terminal, ver solo logs de Control-M
pm2 logs save-json-api | grep "\[CONTROL-M\]"
```

### Si ejecutas directamente:

Los logs aparecen en la consola donde ejecutaste `node server.js`.

## Qué Buscar en los Logs

Cuando ejecutas tu `curl`, deberías ver estos logs:

### 1. Configuración de la Llamada:
```
[CONTROL-M] ========================================
[CONTROL-M] 📋 CONFIGURACIÓN DE LA LLAMADA:
[CONTROL-M]   URL: https://controlms1de01:8446/automation-api/deploy
[CONTROL-M]   Método: POST
[CONTROL-M]   Headers:
[CONTROL-M]     - Content-Type: multipart/form-data; boundary=...
[CONTROL-M]     - Authorization: Bearer 3DFAE7FC808867A6E3...A613
[CONTROL-M]   Form Data:
[CONTROL-M]     - Field: definitionsFile
[CONTROL-M]     - Filename: archivo.json
[CONTROL-M]     - Content-Type: application/json
[CONTROL-M]     - File Path: /root/Desktop/jsonControlm/archivo.json
[CONTROL-M] ========================================
```

### 2. Respuesta de Control-M:
```
[CONTROL-M] ========================================
[CONTROL-M] ✅ RESPUESTA DE CONTROL-M:
[CONTROL-M]   Status: 200 OK
[CONTROL-M]   Tiempo de respuesta: 1234ms
[CONTROL-M]   Body: {...}
[CONTROL-M] ========================================
```

### 3. Si hay Error:
```
[CONTROL-M] ========================================
[CONTROL-M] ❌ ERROR EJECUTANDO CONTROL-M:
[CONTROL-M]   Mensaje: ...
[CONTROL-M]   Status: 401
[CONTROL-M]   Body de error: {...}
[CONTROL-M] ========================================
```

## Comparación con tu Curl Esperado

Tu curl esperado es:
```bash
curl --location 'https://controlms1de01:8446/automation-api/deploy' \
--header 'Authorization: Bearer TOKEN' \
--form 'definitionsFile=@"/ruta/archivo.json"'
```

### Verificación:

1. **URL**: Debe ser exactamente `https://controlms1de01:8446/automation-api/deploy`
   - ✅ Verifica en logs: `[CONTROL-M] URL: ...`
   - ✅ O en endpoint: `curl http://localhost:3000/last-controlm-call | jq '.call.url'`

2. **Authorization Header**: Debe ser `Bearer TOKEN`
   - ✅ Verifica en logs: `[CONTROL-M] Authorization: Bearer ...`
   - ✅ O en endpoint: `curl http://localhost:3000/last-controlm-call | jq '.call.headers.Authorization'`

3. **Form Field**: Debe ser `definitionsFile`
   - ✅ Verifica en logs: `[CONTROL-M] Field: definitionsFile`
   - ✅ O en endpoint: `curl http://localhost:3000/last-controlm-call | jq '.call.formData.field'`

4. **Archivo**: Debe ser el archivo guardado en EC2
   - ✅ Verifica en logs: `[CONTROL-M] File Path: /root/Desktop/jsonControlm/archivo.json`
   - ✅ O en endpoint: `curl http://localhost:3000/last-controlm-call | jq '.call.filePath'`

## Comandos Útiles

### Ver solo la configuración de la última llamada:
```bash
curl http://localhost:3000/last-controlm-call | jq '.call'
```

### Ver solo si coinciden los parámetros:
```bash
curl http://localhost:3000/last-controlm-call | jq '.comparison.matches'
```

### Ver solo errores:
```bash
curl http://localhost:3000/last-controlm-call | jq '.call.error'
```

### Ver logs de Control-M en tiempo real:
```bash
# Terminal 1: Ver logs
pm2 logs save-json-api --lines 0 | grep "\[CONTROL-M\]"

# Terminal 2: Ejecutar tu curl
curl -X POST http://localhost:3000/save-json ...
```

## Troubleshooting

### Si no se ejecuta Control-M:

1. **Verifica que enviaste `controlm_api`**:
   ```bash
   # Tu curl debe incluir:
   "controlm_api": "https://controlms1de01:8446/automation-api/deploy"
   ```

2. **Verifica que el archivo se guardó**:
   ```bash
   # En EC2:
   ls -la ~/Desktop/jsonControlm/
   ```

3. **Verifica los logs**:
   ```bash
   pm2 logs save-json-api | grep "Control-M no se ejecutará"
   ```

### Si Control-M falla:

1. **Verifica el token**:
   ```bash
   curl http://localhost:3000/last-controlm-call | jq '.call.token'
   ```

2. **Verifica la URL**:
   ```bash
   curl http://localhost:3000/last-controlm-call | jq '.call.url'
   ```

3. **Verifica el error**:
   ```bash
   curl http://localhost:3000/last-controlm-call | jq '.call.error'
   ```

## Resumen

La forma más fácil de verificar es:

1. Ejecuta tu `curl` a `/save-json`
2. Inmediatamente después, ejecuta:
   ```bash
   curl http://localhost:3000/last-controlm-call
   ```
3. Revisa la respuesta JSON para ver exactamente cómo se llamó a Control-M

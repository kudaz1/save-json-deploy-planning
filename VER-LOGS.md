# Cómo Ver los Logs de la API

## Ubicación de los Logs

Los logs de la API se escriben en la **consola (stdout/stderr)**. Dependiendo de cómo ejecutes el servidor, los logs estarán en diferentes lugares:

### 1. Si usas PM2 (Recomendado)

```bash
# Ver logs en tiempo real
pm2 logs save-json-api

# Ver últimas 100 líneas
pm2 logs save-json-api --lines 100

# Ver solo errores
pm2 logs save-json-api --err

# Ver solo output normal
pm2 logs save-json-api --out

# Ver logs de todas las aplicaciones
pm2 logs
```

**Ubicación de archivos de log de PM2:**
```bash
# Logs de PM2 están en:
~/.pm2/logs/save-json-api-out.log  # Output normal
~/.pm2/logs/save-json-api-error.log # Errores

# Ver estos archivos directamente:
tail -f ~/.pm2/logs/save-json-api-out.log
tail -f ~/.pm2/logs/save-json-api-error.log
cat ~/.pm2/logs/save-json-api-out.log
cat ~/.pm2/logs/save-json-api-error.log
```

### 2. Si ejecutas directamente con `node server.js`

Los logs aparecen directamente en la **terminal/consola** donde ejecutaste el comando.

### 3. Si usas systemd

```bash
# Ver logs del servicio
sudo journalctl -u save-json-api -f

# Ver últimas 100 líneas
sudo journalctl -u save-json-api -n 100

# Ver logs desde hoy
sudo journalctl -u save-json-api --since today
```

## Endpoint para Ver Logs (NUEVO)

He agregado un endpoint que muestra información de los logs:

```bash
curl http://localhost:3003/logs
```

## Comandos Útiles para Debugging

### Ver logs en tiempo real mientras pruebas

```bash
# Terminal 1: Ver logs
pm2 logs save-json-api --lines 0

# Terminal 2: Ejecutar curl
curl --location --request POST 'http://localhost:3003/save-json' ...
```

### Buscar errores específicos

```bash
# Buscar errores en los logs
pm2 logs save-json-api --err | grep ERROR

# Buscar logs de save-json
pm2 logs save-json-api | grep "save-json"

# Buscar logs de guardado
pm2 logs save-json-api | grep "GUARDAR\|Archivo"
```

### Ver logs de las últimas 5 minutos

```bash
# Si usas PM2
pm2 logs save-json-api --lines 200

# Si usas systemd
sudo journalctl -u save-json-api --since "5 minutes ago"
```

## Qué Buscar en los Logs

Cuando ejecutas el curl, deberías ver:

1. **Logs del middleware raw-body:**
   ```
   [RAW-BODY] ========================================
   [RAW-BODY] Body recibido, longitud: ...
   [RAW-BODY] ✅ JSON parseado exitosamente
   ```

2. **Logs del endpoint:**
   ```
   === INICIO POST /save-json ===
   [1] Request recibido
   [2] Datos extraídos: ...
   [5] File path: ...
   [8] ✅ Archivo escrito exitosamente
   [9] ✅ Archivo existe
   [11] ✅ Verificación final exitosa
   === ✅ ÉXITO: Archivo guardado ===
   ```

3. **Logs de Control-M (si se ejecuta automáticamente):**
   ```
   === EJECUTANDO CONTROL-M AUTOMÁTICAMENTE ===
   [CONTROL-M] ========================================
   [CONTROL-M] Ejecutando API de Control-M
   [CONTROL-M] URL: https://controlms1de01:8446/automation-api/deploy
   [CONTROL-M] Archivo: /root/Desktop/jsonControlm/archivo.json
   [CONTROL-M] Token: 3DFAE7FC808867A6E3...
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
   [CONTROL-M] 🚀 Enviando petición POST a Control-M...
   [CONTROL-M] ✅ RESPUESTA DE CONTROL-M:
   [CONTROL-M]   Status: 200 OK
   [CONTROL-M]   Tiempo de respuesta: 1234ms
   [CONTROL-M]   Body: {...}
   ```

4. **Si hay errores:**
   ```
   [RAW-BODY] ❌ ERROR parseando: ...
   [8] ❌ ERROR al escribir: ...
   [9] ❌ ERROR: Archivo no existe después de escribirlo
   [CONTROL-M] ❌ ERROR EJECUTANDO CONTROL-M:
   [CONTROL-M]   Mensaje: ...
   [CONTROL-M]   Status: 401
   ```

## Cómo Verificar que Control-M se Llama Correctamente

### 1. Buscar logs de Control-M específicamente

```bash
# Ver solo logs de Control-M
pm2 logs save-json-api | grep "\[CONTROL-M\]"

# Ver configuración de la llamada
pm2 logs save-json-api | grep -A 10 "CONFIGURACIÓN DE LA LLAMADA"

# Ver respuesta de Control-M
pm2 logs save-json-api | grep -A 5 "RESPUESTA DE CONTROL-M"
```

### 2. Verificar los parámetros enviados

Los logs mostrarán exactamente:
- ✅ **URL**: La URL completa de Control-M que se está usando
- ✅ **Token**: El token Bearer (primeros y últimos caracteres)
- ✅ **Archivo**: La ruta completa del archivo que se está enviando
- ✅ **Headers**: Todos los headers de la petición
- ✅ **Form Data**: El campo `definitionsFile` con el nombre del archivo

### 3. Comparar con tu curl esperado

Tu curl esperado es:
```bash
curl --location 'https://controlms1de01:8446/automation-api/deploy' \
--header 'Authorization: Bearer TOKEN' \
--form 'definitionsFile=@"/ruta/archivo.json"'
```

En los logs deberías ver:
- URL: `https://controlms1de01:8446/automation-api/deploy` ✅
- Authorization: `Bearer TOKEN` ✅
- Form field: `definitionsFile` ✅
- Filename: `archivo.json` ✅
- File path: `/root/Desktop/jsonControlm/archivo.json` ✅

### 4. Verificar errores específicos

```bash
# Ver errores de Control-M
pm2 logs save-json-api --err | grep "\[CONTROL-M\]"

# Ver si el archivo no existe
pm2 logs save-json-api | grep "El archivo no existe"

# Ver errores de conexión
pm2 logs save-json-api | grep "ECONNREFUSED\|ETIMEDOUT"
```

## Si No Ves Logs

1. **Verificar que el servidor esté corriendo:**
   ```bash
   pm2 list
   # o
   ps aux | grep node
   ```

2. **Verificar que PM2 esté guardando logs:**
   ```bash
   pm2 info save-json-api
   ```

3. **Reiniciar PM2 con logging explícito:**
   ```bash
   pm2 delete save-json-api
   pm2 start server.js --name save-json-api --log-date-format="YYYY-MM-DD HH:mm:ss"
   pm2 save
   ```

## Archivos de Debug

Si hay errores de parsing, el servidor guarda archivos de debug en:
```bash
/tmp/debug-*.txt
```

Puedes verlos con:
```bash
ls -la /tmp/debug-*.txt
cat /tmp/debug-*.txt
```

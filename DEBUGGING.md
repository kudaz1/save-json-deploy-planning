# Guía de Debugging - Problemas con Creación de Carpetas

Si la API no está creando la carpeta `~/Desktop/jsonControlm` en EC2, sigue estos pasos:

## 1. Verificar que el servidor esté corriendo

```bash
# Verificar que el proceso está activo
ps aux | grep node

# O si usas PM2
pm2 list
pm2 logs save-json-api
```

## 2. Revisar los logs del servidor

Al iniciar el servidor, deberías ver mensajes como:
```
Home directory detectado: /root
Intentando crear Desktop en: /root/Desktop
Ruta de almacenamiento será: /root/Desktop/jsonControlm
✅ Carpeta Desktop creada: /root/Desktop
✅ Carpeta jsonControlm creada: /root/Desktop/jsonControlm
✅ Ruta de almacenamiento lista: /root/Desktop/jsonControlm
```

Si no ves estos mensajes, hay un problema.

## 3. Usar el endpoint de diagnóstico

```bash
curl http://localhost:3000/diagnostic
```

Esto mostrará:
- La ruta de almacenamiento detectada
- Si la carpeta existe
- Archivos guardados
- Información del sistema

## 4. Forzar creación de carpeta (NUEVO)

```bash
curl http://localhost:3000/create-storage
```

Este endpoint:
- Fuerza la creación de la carpeta
- Verifica permisos de escritura
- Intenta crear un archivo de prueba
- Retorna información detallada del estado

**Ejemplo de respuesta exitosa:**
```json
{
  "success": true,
  "message": "Carpeta de almacenamiento creada y verificada exitosamente",
  "storagePath": "/root/Desktop/jsonControlm",
  "exists": true,
  "canWrite": true,
  "testFileCreated": true,
  "homeDir": "/root",
  "currentUser": "root"
}
```

## 5. Verificar permisos manualmente

```bash
# Verificar que el usuario tiene permisos
whoami

# Verificar el home directory
echo $HOME

# Intentar crear la carpeta manualmente
mkdir -p ~/Desktop/jsonControlm

# Verificar que se creó
ls -la ~/Desktop/

# Verificar permisos
ls -ld ~/Desktop/jsonControlm
```

## 6. Problemas comunes y soluciones

### Problema: "Permission denied"

**Solución:**
```bash
# Verificar permisos del home
ls -ld ~

# Si es necesario, cambiar permisos
chmod 755 ~
chmod 755 ~/Desktop
```

### Problema: "No such file or directory"

**Solución:**
```bash
# Crear Desktop manualmente si no existe
mkdir -p ~/Desktop
chmod 755 ~/Desktop
```

### Problema: El servidor no inicia

**Solución:**
```bash
# Verificar que Node.js está instalado
node --version

# Verificar que las dependencias están instaladas
npm install

# Verificar errores de sintaxis
node -c server.js
```

### Problema: La carpeta se crea pero no se puede escribir

**Solución:**
```bash
# Verificar permisos
ls -ld ~/Desktop/jsonControlm

# Cambiar permisos si es necesario
chmod 755 ~/Desktop/jsonControlm

# Verificar que el usuario del proceso tiene permisos
ps aux | grep node
```

## 7. Verificar logs detallados

Si usas PM2:
```bash
pm2 logs save-json-api --lines 100
```

Si ejecutas directamente:
```bash
node server.js
# Verás los logs en la consola
```

## 8. Probar guardar un archivo

```bash
curl -X POST http://localhost:3000/save-json \
  -H "Content-Type: application/json" \
  -d '{
    "ambiente": "DEV",
    "token": "test-token",
    "filename": "test-file",
    "jsonData": {"test": "data"}
  }'
```

Luego verificar:
```bash
ls -la ~/Desktop/jsonControlm/
```

## 9. Si nada funciona

1. **Detener el servidor:**
   ```bash
   pm2 stop save-json-api
   # o
   pkill node
   ```

2. **Crear la carpeta manualmente:**
   ```bash
   mkdir -p ~/Desktop/jsonControlm
   chmod 755 ~/Desktop/jsonControlm
   ```

3. **Verificar que existe:**
   ```bash
   ls -la ~/Desktop/jsonControlm
   ```

4. **Reiniciar el servidor:**
   ```bash
   pm2 start server.js --name save-json-api
   # o
   node server.js
   ```

5. **Probar el endpoint create-storage:**
   ```bash
   curl http://localhost:3000/create-storage
   ```

## 10. Información útil para reportar problemas

Si necesitas ayuda, proporciona:

1. **Salida de `/diagnostic`:**
   ```bash
   curl http://localhost:3000/diagnostic | jq
   ```

2. **Salida de `/create-storage`:**
   ```bash
   curl http://localhost:3000/create-storage | jq
   ```

3. **Logs del servidor:**
   ```bash
   pm2 logs save-json-api --lines 50
   ```

4. **Información del sistema:**
   ```bash
   whoami
   echo $HOME
   pwd
   node --version
   ```

5. **Permisos de carpetas:**
   ```bash
   ls -la ~
   ls -la ~/Desktop
   ls -la ~/Desktop/jsonControlm 2>/dev/null || echo "Carpeta no existe"
   ```

# Instrucciones para Usar la API de Railway

## 🚨 IMPORTANTE
La API en Railway **NO puede** crear carpetas ni guardar archivos directamente en tu computadora. Necesitas usar un **cliente local** para guardar los archivos.

## 📋 Cómo Usar

### Opción 1: Script Automático (Recomendado)

1. **Instala Node.js** en tu computadora si no lo tienes
2. **Copia el archivo `usar-api.js`** a tu computadora
3. **Edita la configuración** en el archivo:
   ```javascript
   const CONFIG = {
       apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
       ambiente: 'DEV', // o 'QA'
       token: 'tu-bearer-token-aqui', // CAMBIA ESTE TOKEN
       filename: 'mi-archivo-controlm', // CAMBIA ESTE NOMBRE
       jsonData: {
           // CAMBIA ESTOS DATOS SEGÚN TUS NECESIDADES
       }
   };
   ```
4. **Ejecuta el script**:
   ```bash
   node usar-api.js
   ```

### Opción 2: Uso Manual

1. **Haz una petición POST** a la API:
   ```
   POST https://save-json-deploy-planning-production.up.railway.app/save-json
   ```
   
2. **Cuerpo de la petición**:
   ```json
   {
     "ambiente": "DEV",
     "token": "tu-bearer-token",
     "filename": "nombre-del-archivo",
     "jsonData": {
       "tus": "datos",
       "json": "aqui"
     }
   }
   ```

3. **Copia el `jsonContent`** de la respuesta
4. **Crea la carpeta** `jsonControlm` en tu Escritorio
5. **Guarda el archivo** con el nombre especificado

## 📁 Ubicación de los Archivos

Los archivos se guardarán en:
- **OneDrive**: `C:\Users\[usuario]\OneDrive\Escritorio\jsonControlm\`
- **Sistema**: `C:\Users\[usuario]\Desktop\jsonControlm\`

## 🔧 Solución de Problemas

### Error: "No se puede conectar a la API"
- Verifica que la URL sea correcta
- Verifica tu conexión a internet

### Error: "Token inválido"
- Verifica que el token sea correcto
- Contacta al administrador para obtener un token válido

### Error: "No se puede crear la carpeta"
- Verifica que tengas permisos de escritura en el Escritorio
- Ejecuta como administrador si es necesario

## 📞 Soporte

Si tienes problemas:
1. Verifica que Node.js esté instalado
2. Verifica que la API esté funcionando
3. Revisa los logs de error
4. Contacta al administrador del sistema

## ✅ Verificación

Para verificar que funciona:
1. Ejecuta el script
2. Verifica que aparezca el mensaje "ARCHIVO GUARDADO EXITOSAMENTE"
3. Navega a la carpeta jsonControlm en tu Escritorio
4. Verifica que el archivo JSON esté ahí

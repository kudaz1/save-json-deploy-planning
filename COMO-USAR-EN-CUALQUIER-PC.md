# Cómo Usar la API en Cualquier Computadora

## 🚨 IMPORTANTE
La API en Railway **NO puede** guardar archivos directamente en tu computadora. Necesitas usar un **script local** en cada computadora.

## 📋 Pasos para Usar en Cualquier Computadora

### 1. Preparar la Computadora
- ✅ Instalar **Node.js** (si no lo tienes)
- ✅ Descargar el archivo `guardar-archivo-cualquier-pc.js`

### 2. Configurar el Script
Abre el archivo `guardar-archivo-cualquier-pc.js` y cambia estos valores:

```javascript
const CONFIG = {
    // URL de tu API (ya está configurada)
    apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
    
    // CAMBIA ESTOS VALORES:
    ambiente: 'DEV', // o 'QA'
    token: 'tu-bearer-token-aqui', // TU TOKEN
    filename: 'mi-archivo-controlm', // NOMBRE DEL ARCHIVO
    
    // TUS DATOS JSON:
    jsonData: {
        "MI_JOB": {
            // ... tus datos aquí
        }
    }
};
```

### 3. Ejecutar el Script
```bash
node guardar-archivo-cualquier-pc.js
```

### 4. Verificar el Resultado
- ✅ El script mostrará mensajes de progreso
- ✅ El archivo se guardará en `Escritorio/jsonControlm/`
- ✅ Se abrirá automáticamente la carpeta (en Windows)

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

### Error: "Node.js no está instalado"
- Descarga e instala Node.js desde https://nodejs.org
- Reinicia la computadora después de la instalación

## ✅ Verificación

Para verificar que funciona:
1. Ejecuta el script
2. Verifica que aparezca "ARCHIVO GUARDADO EXITOSAMENTE"
3. Navega a la carpeta jsonControlm en tu Escritorio
4. Verifica que el archivo JSON esté ahí

## 📞 Soporte

Si tienes problemas:
1. Verifica que Node.js esté instalado
2. Verifica que la API esté funcionando
3. Revisa los logs de error
4. Contacta al administrador del sistema


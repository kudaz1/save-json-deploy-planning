# Instrucciones para usar el cliente como Postman

## 🎯 Objetivo
Ejecutar Control-M desde tu máquina local, exactamente como lo haces en Postman.

## 📋 Pasos para usar:

### 1. **Instalar dependencias** (si no las tienes):
```bash
npm install axios form-data
```

### 2. **Configurar el cliente**:

#### Opción A: Ejecutar Control-M directamente (como en Postman)
```bash
node test-postman-client.js
```

**Antes de ejecutar, edita el archivo `test-postman-client.js` y cambia:**
- `url`: Tu URL de Control-M
- `token`: Tu Bearer token
- `filename`: Nombre del archivo
- `jsonData`: Tu JSON completo

#### Opción B: Usar tu API de Railway + Control-M local
```bash
node test-full-process.js
```

**Antes de ejecutar, edita el archivo `test-full-process.js` y cambia:**
- `apiUrl`: Tu URL de Railway
- `token`: Tu Bearer token
- `filename`: Nombre del archivo
- `jsonData`: Tu JSON completo

### 3. **Ejemplo de configuración**:

```javascript
const config = {
    url: 'https://controlms1de01:8446/automation-api/deploy',
    token: 'tu-bearer-token-real',
    filename: 'BORRA-GUI-DESARROLLO_hold_deploy.json',
    jsonData: {
        // Tu JSON completo aquí
        jobType: 'Job',
        application: 'MiApp',
        // ... todos los campos
    }
};
```

## 🔄 Flujo completo:

1. **Tu máquina local** ejecuta el script
2. **El script llama** a tu API en Railway (opcional)
3. **El script ejecuta** Control-M desde tu máquina local
4. **Obtienes el resultado** de Control-M

## ✅ Ventajas:

- ✅ Ejecutas Control-M desde tu máquina (como Postman)
- ✅ No necesitas abrir Postman
- ✅ Puedes automatizar el proceso
- ✅ Obtienes logs detallados
- ✅ Manejo de errores completo

## 🚀 Ejecutar:

```bash
# Opción 1: Solo Control-M
node test-postman-client.js

# Opción 2: API Railway + Control-M
node test-full-process.js
```

## 📊 Lo que verás:

```
🚀 Ejecutando Control-M desde cliente local (como Postman)
📍 URL: https://controlms1de01:8446/automation-api/deploy
📁 Archivo: BORRA-GUI-DESARROLLO_hold_deploy.json
🔑 Token: tu-token-...
📤 Enviando petición con form-data...
📊 Progreso: 100%
✅ Control-M ejecutado exitosamente!
📊 Status: 200
📋 Response: { "deploymentId": "12345" }
```

¡Exactamente como en Postman, pero desde tu máquina local!



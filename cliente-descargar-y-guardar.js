const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente SIMPLE: descarga y guarda automáticamente el archivo en tu Escritorio
 */
async function descargarYGuardar() {
    try {
        console.log('=== DESCARGANDO Y GUARDANDO ARCHIVO ===\n');
        
        // ⚠️ CONFIGURA ESTOS VALORES:
        const CONFIG = {
            apiUrl: 'https://save-json-deploy-planning-production.up.railway.app',
            
            ambiente: 'DEV', // o 'QA'
            token: 'tu-bearer-token-aqui', // ⚠️ CAMBIA ESTE TOKEN
            filename: 'mi-archivo-controlm', // ⚠️ CAMBIA ESTE NOMBRE
            
            jsonData: {
                "MI_JOB": {
                    "Type": "SimpleFolder",
                    "ControlmServer": "COOPEUCH",
                    "OrderMethod": "Manual"
                }
            }
        };
        
        // Detectar Escritorio
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        const desktopPath = fs.existsSync(oneDrivePath) ? oneDrivePath : systemPath;
        const controlMPath = path.join(desktopPath, 'controlm');
        
        // Crear carpeta si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
        }
        
        // 1. Llamar al endpoint de descarga
        console.log('📡 Llamando a la API...');
        const response = await axios.post(`${CONFIG.apiUrl}/download-json`, {
            ambiente: CONFIG.ambiente,
            token: CONFIG.token,
            filename: CONFIG.filename,
            jsonData: CONFIG.jsonData
        }, {
            responseType: 'arraybuffer', // Importante para descarga de archivos
            timeout: 30000
        });
        
        // 2. Guardar el archivo
        const fileName = CONFIG.filename.endsWith('.json') ? CONFIG.filename : `${CONFIG.filename}.json`;
        const filePath = path.join(controlMPath, fileName);
        
        fs.writeFileSync(filePath, Buffer.from(response.data));
        
        console.log(`✅ Archivo guardado: ${filePath}`);
        console.log(`📏 Tamaño: ${response.data.length} bytes\n`);
        console.log('🎉 ¡LISTO! El archivo está en tu Escritorio/controlm\n');
        
        // Abrir carpeta en explorador (Windows)
        if (process.platform === 'win32') {
            require('child_process').exec(`explorer "${controlMPath}"`);
            console.log('📂 Abriendo carpeta...');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('📊 Status:', error.response.status);
            console.error('📋 Data:', error.response.data.toString());
        }
    }
}

// Ejecutar
descargarYGuardar();


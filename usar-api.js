const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente que llama a la API y guarda el archivo en Escritorio/controlm
 */
async function usarAPI() {
    console.log('🚀 Llamando a la API...\n');
    
    // ⚠️ CONFIGURA ESTOS VALORES:
    const apiUrl = 'https://save-json-deploy-planning-production.up.railway.app/save-json';
    
    const requestData = {
        ambiente: 'DEV', // o 'QA'
        token: 'tu-bearer-token-aqui', // ⚠️ CAMBIA ESTE TOKEN
        filename: 'mi-archivo', // ⚠️ NOMBRE DEL ARCHIVO (sin .json)
        
        jsonData: { // ⚠️ TU JSON AQUÍ
            "MI_JOB": {
                "Type": "SimpleFolder",
                "ControlmServer": "COOPEUCH",
                "OrderMethod": "Manual"
            }
        }
    };
    
    try {
        // 1. Llamar a la API - recibirá el archivo para descarga
        const response = await axios.post(apiUrl, requestData, {
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        // 2. Detectar Escritorio y crear carpeta controlm
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        const desktopPath = fs.existsSync(oneDrivePath) ? oneDrivePath : systemPath;
        const controlMPath = path.join(desktopPath, 'controlm');
        
        // Crear carpeta si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
            console.log(`✅ Carpeta creada: ${controlMPath}`);
        }
        
        // 3. Guardar el archivo con el nombre que especificaste
        const fileName = requestData.filename.endsWith('.json') 
            ? requestData.filename 
            : `${requestData.filename}.json`;
        const filePath = path.join(controlMPath, fileName);
        
        fs.writeFileSync(filePath, Buffer.from(response.data));
        
        console.log(`✅ Archivo guardado: ${filePath}`);
        console.log(`📏 Tamaño: ${response.data.length} bytes`);
        console.log(`\n🎉 ¡LISTO! El archivo "${fileName}" está en tu Escritorio/controlm\n`);
        
        // Abrir carpeta en explorador
        if (process.platform === 'win32') {
            require('child_process').exec(`explorer "${controlMPath}"`);
            console.log('📂 Abriendo carpeta...');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('📊 Status:', error.response.status);
        }
    }
}

// Ejecutar
usarAPI();

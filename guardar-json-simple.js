const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function guardarJson() {
    console.log('🚀 Guardando JSON...\n');
    
    // ⚠️ CAMBIA ESTOS 3 VALORES:
    const apiUrl = 'https://save-json-deploy-planning-production.up.railway.app/save-json';
    const token = 'tu-bearer-token-aqui';      // ⚠️ TU TOKEN
    const nombreArchivo = 'mi-archivo';         // ⚠️ NOMBRE DEL ARCHIVO (sin .json)
    const miJson = {                           // ⚠️ TU JSON AQUÍ
        "MI_JOB": {
            "Type": "SimpleFolder",
            "ControlmServer": "COOPEUCH"
        }
    };
    
    try {
        // 1. Enviar JSON a la API
        console.log('📤 Enviando JSON a la API...');
        const response = await axios.post(apiUrl, {
            ambiente: 'DEV',
            token: token,
            filename: nombreArchivo,
            jsonData: miJson
        });
        
        // 2. Obtener el JSON de la respuesta
        const jsonContent = response.data.jsonContent;
        const filename = response.data.filename;
        
        // 3. Crear carpeta en el Escritorio
        const desktopPath = fs.existsSync(path.join(os.homedir(), 'OneDrive', 'Escritorio'))
            ? path.join(os.homedir(), 'OneDrive', 'Escritorio')
            : path.join(os.homedir(), 'Desktop');
        
        const controlMPath = path.join(desktopPath, 'controlm');
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
        }
        
        // 4. Guardar el archivo con el nombre que especificaste
        const filePath = path.join(controlMPath, filename);
        fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2));
        
        console.log(`\n✅ Archivo guardado: ${filePath}`);
        console.log(`📏 Tamaño: ${fs.statSync(filePath).size} bytes`);
        console.log(`\n🎉 ¡LISTO! El archivo "${filename}" está en tu Escritorio/controlm\n`);
        
        // Abrir carpeta
        if (process.platform === 'win32') {
            require('child_process').exec(`explorer "${controlMPath}"`);
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }
}

guardarJson();


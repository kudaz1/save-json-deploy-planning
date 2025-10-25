const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Configuración - CAMBIA ESTOS VALORES SEGÚN TUS NECESIDADES
const CONFIG = {
    apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
    ambiente: 'DEV', // o 'QA'
    token: 'tu-bearer-token-aqui', // CAMBIA ESTE TOKEN
    filename: 'mi-archivo-controlm', // CAMBIA ESTE NOMBRE
    jsonData: {
        // CAMBIA ESTOS DATOS SEGÚN TUS NECESIDADES
        "MI_JOB": {
            "Type": "SimpleFolder",
            "ControlmServer": "COOPEUCH",
            "OrderMethod": "Manual",
            "CC1040P2": {
                "Type": "Job:0S400:Full:CommandLine",
                "CommandLine": "CALL PGM (RBIENVFCL) PARM('CTINTDEM' 'NEXDEM')",
                "SubApplication": "MI_SUBAPP",
                "Priority": "Very Low",
                "FileName": "CC1040P2",
                "Confirm": true,
                "Host": "ibsqa",
                "FilePath": "CC1040P2",
                "CreatedBy": "emuser",
                "Description": "MI DESCRIPCION",
                "RunAs": "07ABATCH",
                "Application": "MI_APLICACION"
            }
        }
    }
};

async function usarAPI() {
    try {
        console.log('=== USANDO API DE RAILWAY ===');
        console.log('📡 Llamando a la API...');
        
        // Llamar a la API
        const response = await axios.post(CONFIG.apiUrl, {
            ambiente: CONFIG.ambiente,
            token: CONFIG.token,
            filename: CONFIG.filename,
            jsonData: CONFIG.jsonData
        }, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (!response.data.success) {
            throw new Error('La API falló: ' + response.data.error);
        }

        console.log('✅ API respondió exitosamente');
        console.log('📄 Mensaje:', response.data.message);

        // Obtener el contenido JSON
        const { jsonContent, filename } = response.data;
        
        if (!jsonContent) {
            throw new Error('La API no devolvió jsonContent');
        }
        
        // Determinar ruta de Documentos en esta computadora
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Documentos');
        const systemPath = path.join(os.homedir(), 'Documents');
        
        let documentsPath;
        if (fs.existsSync(oneDrivePath)) {
            documentsPath = oneDrivePath;
            console.log('📁 Usando OneDrive Documentos');
        } else {
            documentsPath = systemPath;
            console.log('📁 Usando Documents del sistema');
        }
        
        const controlMPath = path.join(documentsPath, 'controlm');
        
        console.log(`\n=== GUARDANDO EN ESTA COMPUTADORA ===`);
        console.log(`Ruta de Documentos: ${documentsPath}`);
        console.log(`Ruta de controlm: ${controlMPath}`);
        
        // Crear carpeta controlm si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
            console.log(`✅ Carpeta controlm creada: ${controlMPath}`);
        } else {
            console.log(`ℹ️ Carpeta controlm ya existe: ${controlMPath}`);
        }
        
        // Ruta completa del archivo
        const filePath = path.join(controlMPath, filename);
        
        // Guardar el archivo JSON
        fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2));
        console.log(`✅ Archivo JSON guardado: ${filePath}`);
        
        // Verificar que se guardó
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`📁 Tamaño: ${stats.size} bytes`);
            console.log(`📅 Creado: ${stats.birthtime}`);
        }
        
        console.log('\n🎉 ¡ARCHIVO GUARDADO EXITOSAMENTE!');
        console.log(`📂 Ubicación: ${filePath}`);
        console.log('\n📋 Para usar este archivo:');
        console.log('1. Navega a la carpeta controlm en Documentos');
        console.log('2. Encuentra el archivo JSON');
        console.log('3. Úsalo con Control-M según tus necesidades');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n🔧 Posibles soluciones:');
        console.log('1. Verifica que la URL de la API sea correcta');
        console.log('2. Verifica que el token sea válido');
        console.log('3. Verifica tu conexión a internet');
    }
}

// Ejecutar
usarAPI();

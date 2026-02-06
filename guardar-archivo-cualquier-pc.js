// SCRIPT PARA GUARDAR ARCHIVOS EN CUALQUIER COMPUTADORA
// Copia este archivo a cualquier computadora y ejecuta: node guardar-archivo-cualquier-pc.js

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

// CONFIGURACIÓN - CAMBIA ESTOS VALORES SEGÚN TUS NECESIDADES
const CONFIG = {
    // URL de tu API en Railway
    apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
    
    // Datos de tu archivo JSON
    ambiente: 'DEV', // o 'QA'
    token: 'tu-bearer-token-aqui', // CAMBIA ESTE TOKEN
    filename: 'mi-archivo-controlm', // CAMBIA ESTE NOMBRE
    
    // Datos JSON que quieres guardar
    jsonData: {
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

async function guardarArchivoEnEstaComputadora() {
    try {
        console.log('=== GUARDANDO ARCHIVO EN ESTA COMPUTADORA ===');
        console.log(`🌐 Llamando a la API: ${CONFIG.apiUrl}`);
        console.log(`📄 Archivo: ${CONFIG.filename}`);
        
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

        // Obtener el contenido JSON de la respuesta
        const { jsonContent, filename } = response.data;
        
        if (!jsonContent) {
            throw new Error('La API no devolvió jsonContent');
        }
        
        // Detectar la ruta del Escritorio en ESTA computadora
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        
        let desktopPath;
        if (fs.existsSync(oneDrivePath)) {
            desktopPath = oneDrivePath;
            console.log('📁 Usando OneDrive Escritorio');
        } else {
            desktopPath = systemPath;
            console.log('📁 Usando Desktop del sistema');
        }
        
        const storagePath = path.join(desktopPath, 'jsonControlm');
        
        console.log(`\n=== GUARDANDO EN ESTA COMPUTADORA ===`);
        console.log(`👤 Usuario: ${os.userInfo().username}`);
        console.log(`🏠 Directorio home: ${os.homedir()}`);
        console.log(`📁 Ruta del Escritorio: ${desktopPath}`);
        console.log(`📁 Ruta de almacenamiento: ${storagePath}`);
        
        // Crear carpeta jsonControlm si no existe
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
            console.log(`✅ Carpeta jsonControlm creada: ${storagePath}`);
        } else {
            console.log(`ℹ️ Carpeta jsonControlm ya existe: ${storagePath}`);
        }
        
        // Ruta completa del archivo
        const filePath = path.join(storagePath, filename);
        
        // Guardar el archivo JSON
        fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2));
        console.log(`✅ Archivo JSON guardado: ${filePath}`);
        
        // Verificar que se guardó
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`📁 Tamaño: ${stats.size} bytes`);
            console.log(`📅 Creado: ${stats.birthtime}`);
        }
        
        console.log('\n🎉 ¡ARCHIVO GUARDADO EXITOSAMENTE EN ESTA COMPUTADORA!');
        console.log(`📂 Ubicación: ${filePath}`);
        console.log('\n📋 Para usar este archivo:');
        console.log('1. Navega a la carpeta jsonControlm en tu Escritorio');
        console.log('2. Encuentra el archivo JSON');
        console.log('3. Úsalo con Control-M según tus necesidades');
        
        // Abrir la carpeta en el explorador (Windows)
        if (process.platform === 'win32') {
            try {
                require('child_process').exec(`explorer "${storagePath}"`);
                console.log('📂 Abriendo carpeta en el explorador...');
            } catch (error) {
                console.log('ℹ️ No se pudo abrir el explorador automáticamente');
            }
        }
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\n🔧 Posibles soluciones:');
        console.log('1. Verifica que tengas Node.js instalado');
        console.log('2. Verifica que la URL de la API sea correcta');
        console.log('3. Verifica que el token sea válido');
        console.log('4. Verifica tu conexión a internet');
        console.log('5. Verifica que tengas permisos de escritura en el Escritorio');
    }
}

// Ejecutar automáticamente
console.log('🚀 Iniciando guardado de archivo...');
guardarArchivoEnEstaComputadora();


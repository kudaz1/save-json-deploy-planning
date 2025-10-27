const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente que se ejecuta en tu máquina local para guardar el archivo JSON en tu Escritorio
 */
async function guardarArchivoEnMiPC() {
    try {
        console.log('=== CLIENTE LOCAL: GUARDANDO ARCHIVO EN TU ESCRITORIO ===\n');
        
        // ⚠️ CONFIGURA ESTOS VALORES:
        const CONFIG = {
            // URL de tu API en Railway
            apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
            
            // Datos de tu petición
            ambiente: 'DEV', // o 'QA'
            token: 'tu-bearer-token-aqui', // ⚠️ CAMBIA ESTE TOKEN
            filename: 'mi-archivo-controlm', // ⚠️ CAMBIA ESTE NOMBRE
            
            // Tu JSON
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
        
        // 1. Llamar a la API
        console.log('📡 Paso 1: Llamando a la API en Railway...');
        console.log(`🌐 URL: ${CONFIG.apiUrl}`);
        console.log(`📄 Archivo: ${CONFIG.filename}\n`);
        
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
        
        console.log('✅ Paso 1 completado: API respondió exitosamente\n');
        
        // 2. Obtener el JSON de la respuesta
        const { jsonContent, filename } = response.data;
        
        if (!jsonContent) {
            throw new Error('La API no devolvió jsonContent');
        }
        
        // 3. Determinar ruta del Escritorio en ESTA computadora
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        
        let desktopPath;
        if (fs.existsSync(oneDrivePath)) {
            desktopPath = oneDrivePath;
            console.log('📁 Detected: OneDrive Escritorio');
        } else {
            desktopPath = systemPath;
            console.log('📁 Detected: Desktop del sistema');
        }
        
        const controlMPath = path.join(desktopPath, 'controlm');
        
        console.log(`\n📋 Paso 2: Guardando archivo en TU computadora...`);
        console.log(`👤 Usuario: ${os.userInfo().username}`);
        console.log(`🏠 Home: ${os.homedir()}`);
        console.log(`📁 Escritorio: ${desktopPath}`);
        console.log(`📂 Carpeta controlm: ${controlMPath}\n`);
        
        // 4. Crear carpeta controlm si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
            console.log(`✅ Carpeta creada: ${controlMPath}`);
        } else {
            console.log(`ℹ️ Carpeta ya existe: ${controlMPath}`);
        }
        
        // 5. Ruta completa del archivo
        const filePath = path.join(controlMPath, filename);
        
        // 6. Guardar el archivo JSON
        fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2));
        console.log(`✅ Archivo guardado: ${filePath}`);
        
        // 7. Verificar que se guardó
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`📏 Tamaño: ${stats.size} bytes`);
            console.log(`📅 Creado: ${stats.birthtime}`);
        }
        
        console.log('\n🎉 ¡ARCHIVO GUARDADO EXITOSAMENTE EN TU ESCRITORIO!');
        console.log(`📂 Ubicación: ${filePath}`);
        console.log('\n📋 Instrucciones:');
        console.log('1. Ve a tu Escritorio');
        console.log('2. Abre la carpeta "controlm"');
        console.log('3. Ahí está tu archivo JSON');
        
        // Abrir la carpeta en el explorador (Windows)
        if (process.platform === 'win32') {
            try {
                require('child_process').exec(`explorer "${controlMPath}"`);
                console.log('\n📂 Abriendo carpeta en el explorador...');
            } catch (error) {
                console.log('\nℹ️ No se pudo abrir el explorador automáticamente');
            }
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.log('\n🔧 Posibles soluciones:');
        console.log('1. Verifica que tengas Node.js instalado');
        console.log('2. Verifica que la URL de la API sea correcta');
        console.log('3. Verifica que el token sea válido');
        console.log('4. Verifica tu conexión a internet');
        console.log('5. Verifica que tengas permisos de escritura en el Escritorio');
    }
}

// Ejecutar automáticamente
console.log('🚀 Iniciando cliente local...\n');
guardarArchivoEnMiPC();


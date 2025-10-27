const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente que llama a la API y guarda el archivo automáticamente en tu Escritorio
 */
async function guardarArchivoAutomatico() {
    try {
        console.log('=== GUARDANDO ARCHIVO AUTOMÁTICAMENTE ===\n');
        
        // ⚠️ CONFIGURA ESTOS VALORES:
        const CONFIG = {
            apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
            
            ambiente: 'DEV', // o 'QA'
            token: 'tu-bearer-token-aqui', // ⚠️ CAMBIA ESTE TOKEN
            filename: 'mi-archivo-controlm', // ⚠️ CAMBIA ESTE NOMBRE
            
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
        
        // Detectar Escritorio
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        const desktopPath = fs.existsSync(oneDrivePath) ? oneDrivePath : systemPath;
        const controlMPath = path.join(desktopPath, 'controlm');
        
        console.log(`📁 Escritorio detectado: ${desktopPath}`);
        console.log(`📂 Carpeta controlm: ${controlMPath}\n`);
        
        // Crear carpeta si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
            console.log(`✅ Carpeta creada: ${controlMPath}`);
        }
        
        // 1. Llamar a la API
        console.log('📡 Llamando a la API en Railway...');
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
        
        console.log('✅ API respondió exitosamente\n');
        
        // 2. Extraer datos de la respuesta
        const { jsonContent, filename } = response.data;
        
        if (!jsonContent) {
            throw new Error('La API no devolvió jsonContent');
        }
        
        // 3. Guardar el archivo
        const fileName = filename.endsWith('.json') ? filename : `${filename}.json`;
        const filePath = path.join(controlMPath, fileName);
        
        fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 2));
        
        // 4. Verificar
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(`✅ Archivo guardado: ${filePath}`);
            console.log(`📏 Tamaño: ${stats.size} bytes`);
            console.log(`📅 Creado: ${stats.birthtime}\n`);
            console.log('🎉 ¡ARCHIVO GUARDADO EXITOSAMENTE!\n');
        } else {
            throw new Error('El archivo no se guardó correctamente');
        }
        
        // Abrir carpeta en explorador (Windows)
        if (process.platform === 'win32') {
            require('child_process').exec(`explorer "${controlMPath}"`);
            console.log('📂 Abriendo carpeta en el explorador...');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('📊 Status:', error.response.status);
            console.error('📋 Data:', error.response.data);
        }
    }
}

// Ejecutar
guardarArchivoAutomatico();


const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente para guardar archivos JSON desde la API de Railway en la computadora local
 * @param {Object} options - Opciones de configuración
 * @param {string} options.apiUrl - URL de la API en Railway
 * @param {string} options.ambiente - Ambiente (DEV o QA)
 * @param {string} options.token - Token de autenticación
 * @param {string} options.filename - Nombre del archivo
 * @param {Object} options.jsonData - Datos JSON a guardar
 * @param {string} [options.documentsPath] - Ruta personalizada de Documentos (opcional)
 * @returns {Promise<Object>} Resultado del proceso
 */
async function saveJsonFromAPI(options) {
    const {
        apiUrl,
        ambiente,
        token,
        filename,
        jsonData,
        documentsPath
    } = options;

    try {
        console.log('=== GUARDANDO JSON DESDE API DE RAILWAY ===');
        console.log(`API URL: ${apiUrl}`);
        console.log(`Archivo: ${filename}`);
        
        // Llamar a la API
        console.log('📡 Llamando a la API...');
        const response = await axios.post(apiUrl, {
            ambiente,
            token,
            filename,
            jsonData
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

        // Obtener información del archivo
        const { jsonContent, controlMInfo } = response.data;
        
        if (!jsonContent) {
            throw new Error('La API no devolvió jsonContent');
        }
        
        // Determinar ruta del Escritorio
        let finalDesktopPath;
        if (documentsPath) {
            // Mantener retrocompatibilidad pero usar escritorio
            finalDesktopPath = documentsPath;
        } else {
            // Intentar OneDrive primero, luego Desktop del sistema
            const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
            const systemPath = path.join(os.homedir(), 'Desktop');
            
            if (fs.existsSync(oneDrivePath)) {
                finalDesktopPath = oneDrivePath;
                console.log('📁 Usando OneDrive Escritorio');
            } else {
                finalDesktopPath = systemPath;
                console.log('📁 Usando Desktop del sistema');
            }
        }
        
        const controlMPath = path.join(finalDesktopPath, 'controlm');
        
        console.log(`\n=== GUARDANDO EN COMPUTADORA LOCAL ===`);
        console.log(`Ruta del Escritorio: ${finalDesktopPath}`);
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
        } else {
            throw new Error('El archivo no se guardó correctamente');
        }
        
        return {
            success: true,
            message: 'Archivo JSON guardado exitosamente en tu computadora local',
            filePath: filePath,
            filename: filename,
            controlMInfo: controlMInfo,
            desktopPath: finalDesktopPath,
            controlMPath: controlMPath
        };

    } catch (error) {
        console.error('❌ Error:', error.message);
        return {
            success: false,
            error: error.message
        };
    }
}

// Función de ejemplo
async function example() {
    const result = await saveJsonFromAPI({
        apiUrl: 'https://save-json-deploy-planning-production.up.railway.app/save-json',
        ambiente: 'DEV',
        token: 'tu-bearer-token-aqui',
        filename: 'GENER_NEXUS-DEMOGRAFICO-CARLOS.json',
        jsonData: {
            "GENER_NEXUS-DEMOGRAFICO-CARLOS": {
                "Type": "SimpleFolder",
                "ControlmServer": "COOPEUCH",
                "OrderMethod": "Manual",
                "CC1040P2": {
                    "Type": "Job:0S400:Full:CommandLine",
                    "CommandLine": "CALL PGM (RBIENVFCL) PARM('CTINTDEM' 'NEXDEM')",
                    "SubApplication": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
                    "Priority": "Very Low",
                    "FileName": "CC1040P2",
                    "Confirm": true,
                    "Host": "ibsqa",
                    "FilePath": "CC1040P2",
                    "CreatedBy": "emuser",
                    "Description": "NEXUS-DEMOGRAFICO",
                    "RunAs": "07ABATCH",
                    "Application": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
                    "Variables": [
                        {
                            "tm": "%%TIME"
                        },
                        {
                            "HHt": "%%SUBSTR %%tm 1 2"
                        }
                    ]
                }
            }
        }
    });
    
    console.log('\n=== RESULTADO FINAL ===');
    console.log(JSON.stringify(result, null, 2));
}

// Exportar función
module.exports = { saveJsonFromAPI };

// Ejecutar ejemplo si se llama directamente
if (require.main === module) {
    example();
}

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente para guardar archivos JSON en la computadora local
 * @param {string} apiUrl - URL de tu API en Railway
 * @param {Object} requestData - Datos para enviar a la API
 * @returns {Promise<Object>} Resultado del proceso
 */
async function saveJsonLocally(apiUrl, requestData) {
    try {
        console.log('=== GUARDANDO JSON EN COMPUTADORA LOCAL ===');
        console.log('Llamando a la API...');
        
        // Llamar a la API
        const response = await axios.post(apiUrl, requestData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });

        if (!response.data.success) {
            throw new Error('La API falló: ' + response.data.error);
        }

        console.log('✅ API respondió exitosamente');
        console.log('📄 Respuesta:', response.data.message);

        // Obtener información del archivo
        const { filename, jsonContent, controlMInfo } = response.data;
        
        // Obtener ruta del Escritorio local (OneDrive)
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
        
        const controlMPath = path.join(desktopPath, 'controlm');
        
        console.log(`\n=== GUARDANDO EN COMPUTADORA LOCAL ===`);
        console.log(`Ruta del Escritorio: ${desktopPath}`);
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
            apiResponse: response.data
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
    const apiUrl = 'https://save-json-deploy-planning-production.up.railway.app/save-json';
    const requestData = {
        ambiente: 'DEV',
        token: 'tu-bearer-token-aqui',
        filename: 'GENER_NEXUS-DEMOGRAFICO-CARLOS',
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
    };

    const result = await saveJsonLocally(apiUrl, requestData);
    console.log('\n=== RESULTADO FINAL ===');
    console.log(JSON.stringify(result, null, 2));
}

// Exportar función
module.exports = { saveJsonLocally };

// Ejecutar ejemplo si se llama directamente
if (require.main === module) {
    example();
}

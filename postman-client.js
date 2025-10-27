const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

/**
 * Cliente que replica exactamente la configuración de Postman
 * Ejecuta Control-M desde la máquina local igual que en Postman
 */
class PostmanControlMClient {
    
    /**
     * Ejecutar Control-M exactamente como en Postman
     * @param {Object} config - Configuración de la petición
     */
    async executeControlMLikePostman(config) {
        try {
            console.log(`🚀 Ejecutando Control-M desde cliente local (como Postman)`);
            console.log(`📍 URL: ${config.url}`);
            console.log(`📁 Archivo: ${config.filename}`);
            console.log(`🔑 Token: ${config.token.substring(0, 10)}...`);

            // Crear el JSON como lo harías en Postman
            const jsonString = JSON.stringify(config.jsonData, null, 2);
            const jsonBuffer = Buffer.from(jsonString, 'utf8');

            // Crear form-data exactamente como en Postman
            const form = new FormData();
            form.append('definitionsFile', jsonBuffer, {
                filename: config.filename,
                contentType: 'application/json'
            });

            // Headers exactamente como en Postman
            const headers = {
                ...form.getHeaders(),
                'Authorization': `Bearer ${config.token}`
            };

            console.log(`📤 Enviando petición con form-data...`);

            // Realizar la petición POST exactamente como en Postman
            const response = await axios.post(config.url, form, {
                headers: headers,
                timeout: 30000,
                // Agregar logs para debug
                onUploadProgress: (progressEvent) => {
                    const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    console.log(`📊 Progreso: ${percentCompleted}%`);
                }
            });

            console.log(`✅ Control-M ejecutado exitosamente!`);
            console.log(`📊 Status: ${response.status}`);
            console.log(`📋 Response:`, JSON.stringify(response.data, null, 2));

            return {
                success: true,
                status: response.status,
                data: response.data,
                message: 'Control-M ejecutado exitosamente desde cliente local (como Postman)'
            };

        } catch (error) {
            console.error(`❌ Error ejecutando Control-M:`, error.message);
            
            if (error.response) {
                console.error(`📊 Status: ${error.response.status}`);
                console.error(`📋 Response:`, JSON.stringify(error.response.data, null, 2));
            }

            return {
                success: false,
                error: error.message,
                status: error.response?.status || 'N/A',
                data: error.response?.data || null,
                message: 'Error ejecutando Control-M desde cliente local'
            };
        }
    }

    /**
     * Función completa: llamar a tu API y luego ejecutar Control-M como Postman
     * @param {string} apiUrl - URL de tu API en Railway
     * @param {Object} requestData - Datos para enviar a tu API
     */
    async processLikePostman(apiUrl, requestData) {
        try {
            console.log('🔄 Paso 1: Llamando a tu API en Railway...');
            
            // Llamar a tu API
            const apiResponse = await axios.post(apiUrl, requestData, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000
            });

            if (!apiResponse.data.success) {
                throw new Error('Tu API retornó error');
            }

            console.log('✅ Paso 1 completado: API respondió correctamente');
            console.log('🔄 Paso 2: Ejecutando Control-M desde cliente local (como Postman)...');

            // Ejecutar Control-M como Postman
            const controlMResult = await this.executeControlMLikePostman(apiResponse.data.controlMInfo);

            console.log('🎉 Proceso completo finalizado!');

            return {
                apiResponse: apiResponse.data,
                controlMResult: controlMResult,
                success: true,
                message: 'Proceso completo ejecutado desde cliente local (como Postman)'
            };

        } catch (error) {
            console.error('❌ Error en el proceso completo:', error.message);
            
            return {
                success: false,
                error: error.message,
                message: 'Error en el proceso completo'
            };
        }
    }
}

// Ejemplo de uso - replicando exactamente tu configuración de Postman
async function examplePostmanUsage() {
    const client = new PostmanControlMClient();
    
    // Configuración exacta como en Postman
    const apiUrl = 'https://tu-url-railway.up.railway.app/save-json';
    const requestData = {
        ambiente: 'DEV',  // o 'QA'
        token: 'tu-bearer-token-aqui',
        filename: 'BORRA-GUI-DESARROLLO_hold_deploy', // Como en tu Postman
        jsonData: {
            // Tu JSON aquí - exactamente como lo tienes en Postman
            jobType: 'Job',
            application: 'MiApp',
            subApplication: 'SubApp',
            // ... más campos según tu JSON
        }
    };

    console.log('🚀 Iniciando proceso como Postman...');
    const result = await client.processLikePostman(apiUrl, requestData);
    
    console.log('\n📋 RESULTADO FINAL:');
    console.log(JSON.stringify(result, null, 2));
}

// Exportar la clase
module.exports = PostmanControlMClient;

// Ejecutar ejemplo si se llama directamente
if (require.main === module) {
    examplePostmanUsage();
}



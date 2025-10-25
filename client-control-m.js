const axios = require('axios');
const FormData = require('form-data');

/**
 * Cliente para ejecutar la API de Control-M desde la máquina local
 * @param {Object} controlMInfo - Información obtenida de la API principal
 * @returns {Promise<Object>} Resultado de la ejecución de Control-M
 */
async function executeControlMFromClient(controlMInfo) {
    try {
        console.log(`Ejecutando Control-M desde cliente: ${controlMInfo.url}`);

        // Convertir JSON a string y crear buffer
        const jsonString = JSON.stringify(controlMInfo.jsonData, null, 2);
        const jsonBuffer = Buffer.from(jsonString, 'utf8');

        // Crear form-data con el buffer
        const form = new FormData();
        form.append('definitionsFile', jsonBuffer, {
            filename: controlMInfo.filename,
            contentType: 'application/json'
        });

        // Configurar headers
        const config = {
            headers: {
                ...form.getHeaders(),
                ...controlMInfo.headers
            },
            timeout: 30000 // 30 segundos timeout
        };

        // Realizar la petición POST
        const response = await axios.post(controlMInfo.url, form, config);
        
        console.log(`Control-M ejecutado exitosamente. Status: ${response.status}`);
        
        return {
            success: true,
            status: response.status,
            data: response.data,
            message: 'Control-M ejecutado exitosamente desde cliente'
        };

    } catch (error) {
        console.error('Error ejecutando Control-M desde cliente:', error.message);
        
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 'N/A',
            message: 'Error ejecutando Control-M desde cliente'
        };
    }
}

/**
 * Función completa: llamar a la API principal y ejecutar Control-M
 * @param {string} apiUrl - URL de tu API principal
 * @param {Object} requestData - Datos para enviar a la API principal
 * @returns {Promise<Object>} Resultado completo del proceso
 */
async function processWithControlM(apiUrl, requestData) {
    try {
        console.log('Llamando a la API principal...');
        
        // Llamar a la API principal
        const response = await axios.post(apiUrl, requestData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.data.success) {
            throw new Error('La API principal falló');
        }

        console.log('API principal ejecutada exitosamente');
        console.log('Ejecutando Control-M desde cliente...');

        // Ejecutar Control-M desde el cliente
        const controlMResult = await executeControlMFromClient(response.data.controlMInfo);

        return {
            apiResponse: response.data,
            controlMResult: controlMResult,
            success: true,
            message: 'Proceso completo ejecutado exitosamente'
        };

    } catch (error) {
        console.error('Error en el proceso completo:', error.message);
        
        return {
            success: false,
            error: error.message,
            message: 'Error en el proceso completo'
        };
    }
}

// Ejemplo de uso
async function example() {
    const apiUrl = 'https://tu-url-railway.up.railway.app/save-json';
    const requestData = {
        ambiente: 'DEV',
        token: 'tu-bearer-token',
        filename: 'ejemplo-cliente',
        jsonData: {
            jobType: 'Job',
            application: 'MiApp',
            subApplication: 'SubApp'
        }
    };

    const result = await processWithControlM(apiUrl, requestData);
    console.log('Resultado final:', JSON.stringify(result, null, 2));
}

// Exportar funciones
module.exports = {
    executeControlMFromClient,
    processWithControlM
};

// Ejecutar ejemplo si se llama directamente
if (require.main === module) {
    example();
}


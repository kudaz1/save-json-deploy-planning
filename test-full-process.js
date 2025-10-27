const PostmanControlMClient = require('./postman-client');

async function testFullProcess() {
    const client = new PostmanControlMClient();
    
    // Reemplaza con tu URL de Railway
    const apiUrl = 'https://tu-url-railway.up.railway.app/save-json';
    
    // Datos para enviar a tu API
    const requestData = {
        ambiente: 'DEV', // o 'QA'
        token: 'TU_BEARER_TOKEN_AQUI', // Tu token de Control-M
        filename: 'BORRA-GUI-DESARROLLO_hold_deploy', // Sin extensión .json
        jsonData: {
            // Tu JSON completo aquí
            jobType: 'Job',
            application: 'MiApp',
            subApplication: 'SubApp',
            // ... todos los campos de tu JSON
        }
    };

    console.log('🚀 Iniciando proceso completo...');
    console.log('📤 Paso 1: Llamando a tu API en Railway');
    console.log('📤 Paso 2: Ejecutando Control-M desde cliente local (como Postman)');
    
    const result = await client.processLikePostman(apiUrl, requestData);
    
    console.log('\n🎉 PROCESO COMPLETADO!');
    console.log('📋 RESULTADO FINAL:');
    console.log(JSON.stringify(result, null, 2));
}

// Ejecutar el proceso completo
testFullProcess().catch(console.error);



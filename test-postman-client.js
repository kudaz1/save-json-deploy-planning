const PostmanControlMClient = require('./postman-client');

async function testControlM() {
    const client = new PostmanControlMClient();
    
    // Reemplaza estos valores con los tuyos
    const config = {
        url: 'https://controlms1de01:8446/automation-api/deploy', // Tu URL de Control-M
        token: 'TU_BEARER_TOKEN_AQUI', // Tu token
        filename: 'BORRA-GUI-DESARROLLO_hold_deploy.json', // Nombre del archivo
        jsonData: {
            // Reemplaza con tu JSON real
            jobType: 'Job',
            application: 'MiApp',
            subApplication: 'SubApp',
            // Agrega aquí todos los campos de tu JSON
        }
    };

    console.log('🚀 Ejecutando Control-M desde cliente local (como Postman)...');
    
    const result = await client.executeControlMLikePostman(config);
    
    console.log('\n📋 RESULTADO:');
    console.log(JSON.stringify(result, null, 2));
}

// Ejecutar la prueba
testControlM().catch(console.error);



const axios = require('axios');

async function testAutoScript() {
    try {
        console.log('=== PROBANDO GENERACIÓN DE SCRIPT AUTOMÁTICO ===');
        
        const apiUrl = 'https://save-json-deploy-planning-production.up.railway.app/generate-script';
        const requestData = {
            ambiente: 'DEV',
            token: 'test-token-123',
            filename: 'archivo-automatico.json',
            jsonData: {
                "MI_JOB_AUTOMATICO": {
                    "Type": "SimpleFolder",
                    "ControlmServer": "COOPEUCH",
                    "OrderMethod": "Manual",
                    "CC1040P2": {
                        "Type": "Job:0S400:Full:CommandLine",
                        "CommandLine": "CALL PGM (RBIENVFCL) PARM('CTINTDEM' 'NEXDEM')",
                        "SubApplication": "MI_SUBAPP_AUTOMATICO",
                        "Priority": "Very Low",
                        "FileName": "CC1040P2",
                        "Confirm": true,
                        "Host": "ibsqa",
                        "FilePath": "CC1040P2",
                        "CreatedBy": "emuser",
                        "Description": "JOB AUTOMATICO GENERADO",
                        "RunAs": "07ABATCH",
                        "Application": "MI_APLICACION_AUTOMATICA"
                    }
                }
            }
        };
        
        console.log('📡 Llamando a la API...');
        const response = await axios.post(apiUrl, requestData, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000
        });
        
        if (!response.data.success) {
            throw new Error('La API falló: ' + response.data.error);
        }
        
        console.log('✅ Script generado exitosamente');
        console.log('📄 Mensaje:', response.data.message);
        
        // Mostrar el script generado
        console.log('\n=== SCRIPT AUTOMÁTICO GENERADO ===');
        console.log(response.data.script);
        
        // Mostrar instrucciones
        console.log('\n=== INSTRUCCIONES ===');
        console.log(response.data.instructions.message);
        response.data.instructions.steps.forEach((step, index) => {
            console.log(`${index + 1}. ${step}`);
        });
        
        // Guardar el script en un archivo
        const fs = require('fs');
        fs.writeFileSync('script-generado.js', response.data.script);
        console.log('\n✅ Script guardado en: script-generado.js');
        console.log('📋 Para ejecutarlo: node script-generado.js');
        
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testAutoScript();

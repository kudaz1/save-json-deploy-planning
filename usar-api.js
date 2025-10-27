const axios = require('axios');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Cliente que llama a la API y guarda el archivo en Escritorio/controlm
 */
async function usarAPI() {
    console.log('🚀 Llamando a la API...\n');
    
    // ⚠️ CONFIGURA ESTOS VALORES:
    const apiUrl = 'https://save-json-deploy-planning-production.up.railway.app/save-json';
    
    const requestData = {
        ambiente: 'DEV',
        token: 'tu-bearer-token-aqui', // ⚠️ CAMBIA ESTE TOKEN
        filename: 'GENER_NEXUS-DEMOGRAFICO-CARLOS',
        
    jsonData: {
            "GENER_NEXUS-DEMOGRAFICO-CARLOS": {
            "Type": "SimpleFolder",
            "ControlmServer": "COOPEUCH",
            "OrderMethod": "Manual",
            "CC1040P2": {
                    "Type": "Job:OS400:Full:CommandLine",
                    "CommandLine": "CALL PGM(RBIENVFCL)  PARM('CTINTDEM' 'NEXDEM')",
                    "SubApplication": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
                "Priority": "Very Low",
                "FileName": "CC1040P2",
                "Confirm": true,
                "Host": "ibsqa",
                "FilePath": "CC1040P2",
                "CreatedBy": "emuser",
                    "Description": "NEXUS-DEMOGRAFICO",
                    "RunAs": "Q7ABATCH",
                    "Application": "GENER_NEXUS-DEMOGRAFICO-CARLOS",
                    "Variables": [
                        { "tm": "%%TIME" },
                        { "HHt": "%%SUBSTR %%tm  1 2" },
                        { "MMt": "%%SUBSTR %%tm  3 2" },
                        { "SSt": "%%SUBSTR %%tm  5 2" },
                        { "HORA": "%%HHt:%%MMt:%%SSt" },
                        { "OS400-AEV_LEN": "4000" },
                        { "OS400-JOB_NAME": "CC1040P2" },
                        { "OS400-MEM_NAME": "CC1040P2" },
                        { "OS400-MEM_LIB": "CC1040P2" },
                        { "OS400-JOBD": "*USRPRF" },
                        { "OS400-CURLIB": "Q7AHIFILES" },
                        { "OS400-JOB_OWNER": "Q7ABATCH" }
                    ],
                    "RerunLimit": { "Units": "Minutes", "Every": "0" },
                    "When": {
                        "WeekDays": ["MON", "TUE", "WED", "THU", "FRI"],
                        "MonthDays": ["NONE"],
                        "FromTime": "2000",
                        "DaysRelation": "OR",
                        "ConfirmationCalendars": { "Calendar": "Cal_Habil" }
                    },
                    "JobAFT": { "Type": "Resource:Pool", "Quantity": "1" },
                    "IfBase:Folder:Output_12": {
                        "Type": "If:Output",
                        "Code": "código de finalización 20",
                        "Action:SetToNotOK_0": { "Type": "Action:SetToNotOK" },
                        "Mail_1": {
                            "Type": "Action:Mail",
                            "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                            "To": "controlmerror@coopeuch.cl",
                            "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.",
                            "AttachOutput": false
                        }
                    },
                    "IfBase:Folder:Output_13": {
                        "Type": "If:Output",
                        "Code": "(error,ERROR,Permission denied,File Not Found)",
                        "Action:SetToNotOK_0": { "Type": "Action:SetToNotOK" },
                        "Mail_1": {
                            "Type": "Action:Mail",
                            "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                            "To": "controlmerror@coopeuch.cl",
                            "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.\\n",
                            "AttachOutput": false
                        }
                    },
                    "IfBase:Folder:Output_14": {
                        "Type": "If:Output",
                        "Code": "Mensaje . . . . :   C",
                        "Action:SetToNotOK_0": { "Type": "Action:SetToNotOK" },
                        "Mail_1": {
                            "Type": "Action:Mail",
                            "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                            "To": "controlmerror@coopeuch.cl",
                            "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.\\n",
                            "AttachOutput": false
                        }
                    },
                    "IfBase:Folder:Output_15": {
                        "Type": "If:Output",
                        "Code": "código de finalización 0",
                        "Action:SetToNotOK_0": { "Type": "Action:SetToNotOK" },
                        "Mail_1": {
                            "Type": "Action:Mail",
                            "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) OK_PROCESO",
                            "To": "controlmok@coopeuch.cl",
                            "Message": "Estimado, informo a Ud. que el job  %%JOBNAME y proceso detallado en el asunto de este mail, finalizµ sin problemas. AdemÃs, se registra el promedio del tiempo de ejecuciµn (en segundos) y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\nAtte.\\n\\nOperador de Sistema.",
                            "AttachOutput": false
                        }
                    },
                    "IfBase:Folder:Output_16": {
                        "Type": "If:Output",
                        "Code": "Codigo Retorno",
                        "Action:SetToNotOK_0": { "Type": "Action:SetToNotOK" },
                        "Mail_1": {
                            "Type": "Action:Mail",
                            "Subject": "%%APPLIC (%%APPLGROUP - %%JOBNAME) ERROR_PROCESO",
                            "To": "controlmerror@coopeuch.cl",
                            "Message": "Estimado, informo a Ud. que el job %%JOBNAME y proceso  detallado en el asunto de este mail, finalizµ incorrectamente. AdemÃs, se registra el promedio del tiempo de ejecuciµn(en segundos)  y hora de termino del proceso: %%AVG_TIME  - %%DAY/%%MONTH/%%$YEAR %%HORA\\n\\nAtte.\\n\\nOperador de Sistema.\\n",
                            "AttachOutput": false
                        }
                    },
                    "eventsToWaitFor": {
                        "Type": "WaitForEvents",
                        "Events": [{ "Event": "PRECIERRE-EODAY-NEXUS-001-IBS-DIA" }]
                    }
                }
            }
        }
    };
    
    try {
        // 1. Llamar a la API - recibirá el archivo para descarga
        const response = await axios.post(apiUrl, requestData, {
            responseType: 'arraybuffer',
            timeout: 30000
        });
        
        // 2. Detectar Escritorio y crear carpeta controlm
        const oneDrivePath = path.join(os.homedir(), 'OneDrive', 'Escritorio');
        const systemPath = path.join(os.homedir(), 'Desktop');
        const desktopPath = fs.existsSync(oneDrivePath) ? oneDrivePath : systemPath;
        const controlMPath = path.join(desktopPath, 'controlm');
        
        // Crear carpeta si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
            console.log(`✅ Carpeta creada: ${controlMPath}`);
        }
        
        // 3. Guardar el archivo con el nombre que especificaste
        const fileName = requestData.filename.endsWith('.json') 
            ? requestData.filename 
            : `${requestData.filename}.json`;
        const filePath = path.join(controlMPath, fileName);
        
        fs.writeFileSync(filePath, Buffer.from(response.data));
        
        console.log(`✅ Archivo guardado: ${filePath}`);
        console.log(`📏 Tamaño: ${response.data.length} bytes`);
        console.log(`\n🎉 ¡LISTO! El archivo "${fileName}" está en tu Escritorio/controlm\n`);
        
        // Abrir carpeta en explorador
        if (process.platform === 'win32') {
            require('child_process').exec(`explorer "${controlMPath}"`);
            console.log('📂 Abriendo carpeta...');
        }
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.response) {
            console.error('📊 Status:', error.response.status);
        }
    }
}

// Ejecutar
usarAPI();

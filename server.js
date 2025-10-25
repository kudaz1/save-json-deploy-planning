const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const FormData = require('form-data');
const { execSync } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Función para obtener el usuario de la sesión actual
function getCurrentUser() {
    try {
        let user = null;
        
        // En Windows, probar diferentes métodos
        if (process.platform === 'win32') {
            try {
                // Método 1: whoami
                user = execSync('whoami', { encoding: 'utf8' }).trim();
                console.log(`Usuario detectado con whoami: ${user}`);
            } catch (error) {
                console.log('whoami falló, probando otros métodos...');
            }
            
            // Método 2: echo %USERNAME%
            if (!user) {
                try {
                    user = execSync('echo %USERNAME%', { encoding: 'utf8', shell: true }).trim();
                    console.log(`Usuario detectado con echo %USERNAME%: ${user}`);
                } catch (error) {
                    console.log('echo %USERNAME% falló...');
                }
            }
            
            // Método 3: Usar variables de entorno
            if (!user) {
                user = process.env.USERNAME || process.env.USER;
                console.log(`Usuario detectado con variables de entorno: ${user}`);
            }
        } else {
            // En sistemas Unix-like
            try {
                user = execSync('who am i', { encoding: 'utf8' }).split(' ')[0];
                console.log(`Usuario detectado con 'who am i': ${user}`);
            } catch (error) {
                console.log('who am i falló, probando otros métodos...');
                user = execSync('whoami', { encoding: 'utf8' }).trim();
                console.log(`Usuario detectado con whoami: ${user}`);
            }
        }
        
        // Fallback final
        if (!user) {
            user = os.userInfo().username;
            console.log(`Usuario de fallback (os.userInfo): ${user}`);
        }
        
        console.log(`Usuario final seleccionado: ${user}`);
        return user;
        
    } catch (error) {
        console.warn('Error obteniendo usuario de la sesión:', error.message);
        const fallbackUser = os.userInfo().username;
        console.log(`Usuario de fallback por error: ${fallbackUser}`);
        return fallbackUser;
    }
}

// Función para obtener la ruta de Documentos del usuario de sesión actual
function getDocumentsPath() {
    try {
        const currentUser = getCurrentUser();
        console.log(`Intentando obtener Documentos para usuario: ${currentUser}`);
        
        let documentsPath = null;
        
        // En Windows, probar diferentes rutas
        if (process.platform === 'win32') {
            // Método 1: Ruta estándar C:\Users\[usuario]\Documents
            const standardPath = path.join('C:', 'Users', currentUser, 'Documents');
            console.log(`Probando ruta estándar: ${standardPath}`);
            
            if (fs.existsSync(standardPath)) {
                documentsPath = standardPath;
                console.log(`Ruta estándar encontrada: ${documentsPath}`);
            } else {
                console.log('Ruta estándar no existe, probando otras opciones...');
                
                // Método 2: Usar variable de entorno USERPROFILE
                const userProfile = process.env.USERPROFILE;
                if (userProfile) {
                    const envPath = path.join(userProfile, 'Documents');
                    console.log(`Probando ruta con USERPROFILE: ${envPath}`);
                    if (fs.existsSync(envPath)) {
                        documentsPath = envPath;
                        console.log(`Ruta con USERPROFILE encontrada: ${documentsPath}`);
                    }
                }
                
                // Método 3: Usar HOMEDRIVE y HOMEPATH
                if (!documentsPath) {
                    const homeDrive = process.env.HOMEDRIVE;
                    const homePath = process.env.HOMEPATH;
                    if (homeDrive && homePath) {
                        const envPath = path.join(homeDrive, homePath, 'Documents');
                        console.log(`Probando ruta con HOMEDRIVE/HOMEPATH: ${envPath}`);
                        if (fs.existsSync(envPath)) {
                            documentsPath = envPath;
                            console.log(`Ruta con HOMEDRIVE/HOMEPATH encontrada: ${documentsPath}`);
                        }
                    }
                }
            }
        } else {
            // En sistemas Unix-like
            const unixPath = path.join('/home', currentUser, 'Documents');
            console.log(`Probando ruta Unix: ${unixPath}`);
            
            if (fs.existsSync(unixPath)) {
                documentsPath = unixPath;
                console.log(`Ruta Unix encontrada: ${documentsPath}`);
            } else {
                // Probar con HOME
                const homeDir = process.env.HOME;
                if (homeDir) {
                    const homePath = path.join(homeDir, 'Documents');
                    console.log(`Probando ruta con HOME: ${homePath}`);
                    if (fs.existsSync(homePath)) {
                        documentsPath = homePath;
                        console.log(`Ruta con HOME encontrada: ${documentsPath}`);
                    }
                }
            }
        }
        
        // Fallback final
        if (!documentsPath) {
            documentsPath = path.join(os.homedir(), 'Documents');
            console.log(`Usando fallback: ${documentsPath}`);
        }
        
        console.log(`Ruta final de Documentos: ${documentsPath}`);
        return documentsPath;
        
    } catch (error) {
        console.warn('Error obteniendo ruta de Documentos:', error.message);
        const fallbackPath = path.join(os.homedir(), 'Documents');
        console.log(`Ruta de fallback por error: ${fallbackPath}`);
        return fallbackPath;
    }
}

// Función para crear directorio si no existe
function ensureDirectoryExists(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`Directorio creado: ${dirPath}`);
    }
}

// Función para ejecutar la API según el ambiente
async function executeControlMApi(ambiente, token, jsonData, filename) {
    try {
        // Determinar la URL según el ambiente
        const apiUrl = ambiente === 'DEV' 
            ? 'https://controlms1de01:8446/automation-api/deploy'
            : 'https://controlms2qa01:8446/automation-api/deploy';

        console.log(`Ejecutando API para ambiente ${ambiente}: ${apiUrl}`);

        // Convertir JSON a string y crear buffer
        const jsonString = JSON.stringify(jsonData, null, 2);
        const jsonBuffer = Buffer.from(jsonString, 'utf8');

        // Crear form-data con el buffer directamente
        const form = new FormData();
        form.append('definitionsFile', jsonBuffer, {
            filename: `${filename}.json`,
            contentType: 'application/json'
        });

        // Configurar headers con Bearer token
        const config = {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${token}`
            },
            timeout: 30000 // 30 segundos timeout
        };

        // Realizar la petición POST
        const response = await axios.post(apiUrl, form, config);
        
        console.log(`API ejecutada exitosamente para ambiente ${ambiente}. Status: ${response.status}`);
        
        return {
            success: true,
            status: response.status,
            data: response.data,
            message: `API ejecutada exitosamente para ambiente ${ambiente}`
        };

    } catch (error) {
        console.error(`Error ejecutando API para ambiente ${ambiente}:`, error.message);
        
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 'N/A',
            message: `Error ejecutando API para ambiente ${ambiente}`
        };
    }
}

// Endpoint para guardar archivo JSON
app.post('/save-json', async (req, res) => {
    try {
        const { ambiente, token, filename, jsonData } = req.body;

        // Validar que se proporcionen los datos requeridos
        if (!ambiente || !token || !filename || !jsonData) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"'
            });
        }

        // Validar que el ambiente sea DEV o QA
        if (!['DEV', 'QA'].includes(ambiente)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }

        // Validar que jsonData sea un objeto válido
        let parsedJson;
        try {
            parsedJson = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
        } catch (error) {
            return res.status(400).json({
                success: false,
                error: 'El campo jsonData debe contener un JSON válido'
            });
        }

        // Asegurar que el nombre del archivo tenga extensión .json
        const fileName = filename.endsWith('.json') ? filename : `${filename}.json`;

        // Obtener usuario de la sesión actual
        const currentUser = getCurrentUser();
        console.log(`Usuario de la sesión actual: ${currentUser}`);

        // Obtener ruta de Documentos del usuario de sesión y crear carpeta controlm
        const documentsPath = getDocumentsPath();
        const controlMPath = path.join(documentsPath, 'controlm');
        
        console.log(`Documentos del usuario de sesión: ${documentsPath}`);
        
        // Crear directorio si no existe
        ensureDirectoryExists(controlMPath);
        console.log(`Carpeta controlm creada/verificada en: ${controlMPath}`);

        // Ruta completa del archivo
        const filePath = path.join(controlMPath, fileName);

        // Guardar el archivo JSON en la carpeta controlm
        fs.writeFileSync(filePath, JSON.stringify(parsedJson, null, 2));
        console.log(`Archivo JSON guardado en: ${filePath}`);

        // Preparar información para que el cliente ejecute Control-M directamente
        const controlMInfo = {
            url: ambiente === 'DEV' 
                ? 'https://controlms1de01:8446/automation-api/deploy'
                : 'https://controlms2qa01:8446/automation-api/deploy',
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            jsonData: parsedJson,
            filename: fileName
        };

        console.log(`Información de Control-M preparada para ambiente ${ambiente} con archivo: ${fileName}`);

        res.json({
            success: true,
            message: 'Archivo JSON guardado exitosamente en la carpeta controlm de Documentos del usuario de sesión',
            filename: fileName,
            ambiente: ambiente,
            token: token,
            jsonSize: JSON.stringify(parsedJson).length,
            filePath: filePath,
            currentUser: currentUser,
            documentsPath: documentsPath,
            controlMPath: controlMPath,
            controlMInfo: controlMInfo,
            clientInstructions: {
                message: 'Archivo guardado en controlm de Documentos del usuario de sesión. Usa la información en controlMInfo para ejecutar la API de Control-M desde tu máquina local',
                example: 'Ver documentación para ejemplos de implementación'
            }
        });

    } catch (error) {
        console.error('Error al guardar el archivo:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor al guardar el archivo'
        });
    }
});

// Endpoint de diagnóstico
app.get('/diagnostic', (req, res) => {
    try {
        const currentUser = getCurrentUser();
        const documentsPath = getDocumentsPath();
        const controlMPath = path.join(documentsPath, 'controlm');
        
        // Información del sistema
        const systemInfo = {
            platform: process.platform,
            nodeVersion: process.version,
            environment: {
                USERNAME: process.env.USERNAME,
                USER: process.env.USER,
                USERPROFILE: process.env.USERPROFILE,
                HOMEDRIVE: process.env.HOMEDRIVE,
                HOMEPATH: process.env.HOMEPATH,
                HOME: process.env.HOME
            },
            osUserInfo: os.userInfo(),
            currentUser: currentUser,
            documentsPath: documentsPath,
            documentsExists: fs.existsSync(documentsPath),
            controlMPath: controlMPath,
            controlMExists: fs.existsSync(controlMPath)
        };
        
        res.json({
            success: true,
            message: 'Información de diagnóstico del sistema',
            systemInfo: systemInfo,
            recommendations: {
                message: 'Revisa la información del sistema para verificar las rutas detectadas',
                nextSteps: [
                    'Verifica que documentsPath sea correcto',
                    'Verifica que documentsExists sea true',
                    'Si las rutas no son correctas, revisa las variables de entorno'
                ]
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error en diagnóstico',
            message: error.message
        });
    }
});

// Endpoint de prueba
app.get('/', (req, res) => {
    res.json({
        message: 'API para guardar archivos JSON',
        endpoints: {
            'GET /diagnostic': 'Información de diagnóstico del sistema',
            'POST /save-json': 'Guarda un archivo JSON en Documentos/controlm'
        },
        example: {
            method: 'POST',
            url: '/save-json',
            body: {
                ambiente: 'DEV',
                token: 'mi-token-123',
                filename: 'mi-archivo',
                jsonData: { "nombre": "ejemplo", "valor": 123 }
            }
        }
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    const currentUser = getCurrentUser();
    const documentsPath = getDocumentsPath();
    const controlMPath = path.join(documentsPath, 'controlm');
    
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Usuario de la sesión: ${currentUser}`);
    console.log(`Documentos del usuario de sesión: ${documentsPath}`);
    console.log(`Carpeta controlm: ${controlMPath}`);
});

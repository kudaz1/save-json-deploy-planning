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
        
        // En Windows, probar diferentes métodos para obtener usuario de sesión activa
        if (process.platform === 'win32') {
            try {
                // Método 1: whoami (más confiable para sesión activa)
                user = execSync('whoami', { encoding: 'utf8' }).trim();
                console.log(`Usuario detectado con whoami: ${user}`);
                
                // Limpiar el formato de dominio si existe (ej: DOMAIN\user -> user)
                if (user.includes('\\')) {
                    user = user.split('\\').pop();
                    console.log(`Usuario limpio (sin dominio): ${user}`);
                }
            } catch (error) {
                console.log('whoami falló, probando otros métodos...');
            }
            
            // Método 2: query session (para obtener sesión activa)
            if (!user) {
                try {
                    const sessionInfo = execSync('query session', { encoding: 'utf8' });
                    console.log('Información de sesiones:', sessionInfo);
                    
                    // Buscar la sesión activa (estado "Active")
                    const lines = sessionInfo.split('\n');
                    for (const line of lines) {
                        if (line.includes('Active') && line.includes('console')) {
                            const parts = line.trim().split(/\s+/);
                            if (parts.length >= 2) {
                                user = parts[1];
                                console.log(`Usuario de sesión activa detectado: ${user}`);
                                break;
                            }
                        }
                    }
                } catch (error) {
                    console.log('query session falló...');
                }
            }
            
            // Método 3: echo %USERNAME% (variable de entorno)
            if (!user) {
                try {
                    user = execSync('echo %USERNAME%', { encoding: 'utf8', shell: true }).trim();
                    console.log(`Usuario detectado con echo %USERNAME%: ${user}`);
                } catch (error) {
                    console.log('echo %USERNAME% falló...');
                }
            }
            
            // Método 4: Usar variables de entorno directamente
            if (!user) {
                user = process.env.USERNAME || process.env.USER;
                console.log(`Usuario detectado con variables de entorno: ${user}`);
            }
            
            // Método 5: Usar wmic para obtener usuario de sesión
            if (!user) {
                try {
                    const wmicResult = execSync('wmic computersystem get username /value', { encoding: 'utf8' });
                    const match = wmicResult.match(/Username=(.+)/);
                    if (match) {
                        user = match[1].trim();
                        console.log(`Usuario detectado con wmic: ${user}`);
                    }
                } catch (error) {
                    console.log('wmic falló...');
                }
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
            // Método 1: Ruta OneDrive Documentos (preferida)
            const oneDrivePath = path.join('C:', 'Users', currentUser, 'OneDrive', 'Documentos');
            console.log(`Probando ruta OneDrive Documentos: ${oneDrivePath}`);
            
            if (fs.existsSync(oneDrivePath)) {
                documentsPath = oneDrivePath;
                console.log(`Ruta OneDrive Documentos encontrada: ${documentsPath}`);
            } else {
                console.log('Ruta OneDrive Documentos no existe, probando otras opciones...');
                
                // Método 2: Ruta estándar C:\Users\[usuario]\Documents
                const standardPath = path.join('C:', 'Users', currentUser, 'Documents');
                console.log(`Probando ruta estándar: ${standardPath}`);
                
                if (fs.existsSync(standardPath)) {
                    documentsPath = standardPath;
                    console.log(`Ruta estándar encontrada: ${documentsPath}`);
                } else {
                    console.log('Ruta estándar no existe, probando otras opciones...');
                    
                    // Método 3: Usar variable de entorno USERPROFILE
                    const userProfile = process.env.USERPROFILE;
                    if (userProfile) {
                        const envPath = path.join(userProfile, 'Documents');
                        console.log(`Probando ruta con USERPROFILE: ${envPath}`);
                        if (fs.existsSync(envPath)) {
                            documentsPath = envPath;
                            console.log(`Ruta con USERPROFILE encontrada: ${documentsPath}`);
                        }
                    }
                    
                    // Método 4: Usar HOMEDRIVE y HOMEPATH
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

// Función para obtener la ruta del Escritorio del usuario de sesión actual
function getDesktopPath() {
    try {
        const currentUser = getCurrentUser();
        console.log(`Intentando obtener Escritorio para usuario: ${currentUser}`);
        
        let desktopPath = null;
        
        // En Windows, probar diferentes rutas
        if (process.platform === 'win32') {
            // Método 1: Ruta OneDrive Escritorio (preferida)
            const oneDrivePath = path.join('C:', 'Users', currentUser, 'OneDrive', 'Escritorio');
            console.log(`Probando ruta OneDrive Escritorio: ${oneDrivePath}`);
            
            if (fs.existsSync(oneDrivePath)) {
                desktopPath = oneDrivePath;
                console.log(`Ruta OneDrive Escritorio encontrada: ${desktopPath}`);
            } else {
                console.log('Ruta OneDrive Escritorio no existe, probando otras opciones...');
                
                // Método 2: Ruta estándar C:\Users\[usuario]\Desktop
                const standardPath = path.join('C:', 'Users', currentUser, 'Desktop');
                console.log(`Probando ruta estándar: ${standardPath}`);
                
                if (fs.existsSync(standardPath)) {
                    desktopPath = standardPath;
                    console.log(`Ruta estándar encontrada: ${desktopPath}`);
                } else {
                    console.log('Ruta estándar no existe, probando otras opciones...');
                    
                    // Método 3: Usar variable de entorno USERPROFILE
                    const userProfile = process.env.USERPROFILE;
                    if (userProfile) {
                        const envPath = path.join(userProfile, 'Desktop');
                        console.log(`Probando ruta con USERPROFILE: ${envPath}`);
                        if (fs.existsSync(envPath)) {
                            desktopPath = envPath;
                            console.log(`Ruta con USERPROFILE encontrada: ${desktopPath}`);
                        }
                    }
                    
                    // Método 4: Usar HOMEDRIVE y HOMEPATH
                    if (!desktopPath) {
                        const homeDrive = process.env.HOMEDRIVE;
                        const homePath = process.env.HOMEPATH;
                        if (homeDrive && homePath) {
                            const envPath = path.join(homeDrive, homePath, 'Desktop');
                            console.log(`Probando ruta con HOMEDRIVE/HOMEPATH: ${envPath}`);
                            if (fs.existsSync(envPath)) {
                                desktopPath = envPath;
                                console.log(`Ruta con HOMEDRIVE/HOMEPATH encontrada: ${desktopPath}`);
                            }
                        }
                    }
                }
            }
        } else {
            // En sistemas Unix-like
            const unixPath = path.join('/home', currentUser, 'Desktop');
            console.log(`Probando ruta Unix: ${unixPath}`);
            
            if (fs.existsSync(unixPath)) {
                desktopPath = unixPath;
                console.log(`Ruta Unix encontrada: ${desktopPath}`);
            } else {
                // Probar con HOME
                const homeDir = process.env.HOME;
                if (homeDir) {
                    const homePath = path.join(homeDir, 'Desktop');
                    console.log(`Probando ruta con HOME: ${homePath}`);
                    if (fs.existsSync(homePath)) {
                        desktopPath = homePath;
                        console.log(`Ruta con HOME encontrada: ${desktopPath}`);
                    }
                }
            }
        }
        
        // Fallback final
        if (!desktopPath) {
            desktopPath = path.join(os.homedir(), 'Desktop');
            console.log(`Usando fallback: ${desktopPath}`);
        }
        
        console.log(`Ruta final del Escritorio: ${desktopPath}`);
        return desktopPath;
        
    } catch (error) {
        console.warn('Error obteniendo ruta del Escritorio:', error.message);
        const fallbackPath = path.join(os.homedir(), 'Desktop');
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

// Función para generar script automático de guardado
function generateAutoSaveScript(jsonData, filename, ambiente, token) {
    const script = `
// Script automático generado por la API
// Este script guardará el archivo JSON en tu computadora local

const fs = require('fs');
const path = require('path');
const os = require('os');

async function guardarArchivoAutomaticamente() {
    try {
        console.log('=== GUARDANDO ARCHIVO AUTOMÁTICAMENTE ===');
        
        // Datos del archivo JSON
        const jsonData = ${JSON.stringify(jsonData, null, 8)};
        const filename = '${filename}';
        const ambiente = '${ambiente}';
        const token = '${token}';
        
        // Detectar ruta del Escritorio en esta computadora
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
        
        console.log(\`Ruta del Escritorio: \${desktopPath}\`);
        console.log(\`Ruta de controlm: \${controlMPath}\`);
        
        // Crear carpeta controlm si no existe
        if (!fs.existsSync(controlMPath)) {
            fs.mkdirSync(controlMPath, { recursive: true });
            console.log(\`✅ Carpeta controlm creada: \${controlMPath}\`);
        } else {
            console.log(\`ℹ️ Carpeta controlm ya existe: \${controlMPath}\`);
        }
        
        // Ruta completa del archivo
        const filePath = path.join(controlMPath, filename);
        
        // Guardar el archivo JSON
        fs.writeFileSync(filePath, JSON.stringify(jsonData, null, 2));
        console.log(\`✅ Archivo JSON guardado: \${filePath}\`);
        
        // Verificar que se guardó
        if (fs.existsSync(filePath)) {
            const stats = fs.statSync(filePath);
            console.log(\`📁 Tamaño: \${stats.size} bytes\`);
            console.log(\`📅 Creado: \${stats.birthtime}\`);
        }
        
        console.log('\\n🎉 ¡ARCHIVO GUARDADO EXITOSAMENTE!');
        console.log(\`📂 Ubicación: \${filePath}\`);
        console.log('\\n📋 Información del archivo:');
        console.log(\`- Nombre: \${filename}\`);
        console.log(\`- Ambiente: \${ambiente}\`);
        console.log(\`- Token: \${token}\`);
        
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('\\n🔧 Posibles soluciones:');
        console.log('1. Verifica que tengas permisos de escritura en el Escritorio');
        console.log('2. Ejecuta como administrador si es necesario');
        console.log('3. Verifica que Node.js esté instalado');
    }
}

// Ejecutar automáticamente
guardarArchivoAutomaticamente();
`;
    
    return script;
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

        // Obtener ruta del Escritorio del usuario de sesión y crear carpeta controlm
        const desktopPath = getDesktopPath();
        const controlMPath = path.join(desktopPath, 'controlm');
        
        console.log(`Escritorio del usuario de sesión: ${desktopPath}`);
        
        // Crear directorio si no existe
        ensureDirectoryExists(controlMPath);
        console.log(`Carpeta controlm creada/verificada en: ${controlMPath}`);

        // Ruta completa del archivo
        const filePath = path.join(controlMPath, fileName);

        // NO guardar el archivo en el servidor, solo preparar la información
        // El archivo se guardará en el cliente (tu computadora)
        console.log(`Archivo JSON preparado para guardar en: ${filePath}`);
        console.log(`Contenido del archivo:`, JSON.stringify(parsedJson, null, 2));

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

        // Generar script automático para el cliente
        const autoSaveScript = generateAutoSaveScript(parsedJson, fileName, ambiente, token);

        res.json({
            success: true,
            message: 'Archivo JSON preparado para guardar automáticamente en tu computadora',
            filename: fileName,
            ambiente: ambiente,
            token: token,
            jsonSize: JSON.stringify(parsedJson).length,
            filePath: filePath,
            currentUser: currentUser,
            desktopPath: desktopPath,
            controlMPath: controlMPath,
            jsonContent: parsedJson,
            controlMInfo: controlMInfo,
            autoSaveScript: autoSaveScript,
            clientInstructions: {
                message: 'Ejecuta el script automático para guardar el archivo en tu computadora',
                steps: [
                    '1. Copia el código de autoSaveScript',
                    '2. Pégalo en un archivo .js en tu computadora',
                    '3. Ejecuta: node archivo.js',
                    '4. El archivo se guardará automáticamente en Escritorio/controlm'
                ],
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

// Endpoint para generar script automático
app.post('/generate-script', (req, res) => {
    try {
        const { ambiente, token, filename, jsonData } = req.body;
        
        if (!ambiente || !token || !filename || !jsonData) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"'
            });
        }
        
        // Generar script automático
        const autoSaveScript = generateAutoSaveScript(jsonData, filename, ambiente, token);
        
        res.json({
            success: true,
            message: 'Script automático generado',
            script: autoSaveScript,
            instructions: {
                message: 'Copia el script y ejecútalo en tu computadora',
                steps: [
                    '1. Copia todo el código del campo "script"',
                    '2. Pégalo en un archivo llamado "guardar-archivo.js"',
                    '3. Ejecuta: node guardar-archivo.js',
                    '4. El archivo se guardará automáticamente en Documentos/controlm'
                ]
            }
        });
        
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error generando script',
            message: error.message
        });
    }
});

// Endpoint de diagnóstico
app.get('/diagnostic', (req, res) => {
    try {
        const currentUser = getCurrentUser();
        const desktopPath = getDesktopPath();
        const controlMPath = path.join(desktopPath, 'controlm');
        
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
            desktopPath: desktopPath,
            desktopExists: fs.existsSync(desktopPath),
            controlMPath: controlMPath,
            controlMExists: fs.existsSync(controlMPath),
            // Información adicional de Windows
            windowsInfo: process.platform === 'win32' ? {
                computerName: process.env.COMPUTERNAME,
                logonServer: process.env.LOGONSERVER,
                sessionName: process.env.SESSIONNAME,
                userDomain: process.env.USERDOMAIN,
                userDomainRoamingProfile: process.env.USERDOMAIN_ROAMINGPROFILE
            } : null
        };
        
        res.json({
            success: true,
            message: 'Información de diagnóstico del sistema',
            systemInfo: systemInfo,
            recommendations: {
                message: 'Revisa la información del sistema para verificar las rutas detectadas',
                nextSteps: [
                    'Verifica que desktopPath sea correcto',
                    'Verifica que desktopExists sea true',
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
            'POST /save-json': 'Prepara archivo JSON para guardar en computadora local',
            'POST /generate-script': 'Genera script automático para guardar archivo'
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
    const desktopPath = getDesktopPath();
    const controlMPath = path.join(desktopPath, 'controlm');
    
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
    console.log(`Usuario de la sesión: ${currentUser}`);
    console.log(`Escritorio del usuario de sesión: ${desktopPath}`);
    console.log(`Carpeta controlm: ${controlMPath}`);
});

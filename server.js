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

// Middleware para manejar errores de parsing JSON
app.use(express.json({ 
    limit: '50mb',
    strict: false, // Permitir JSON más flexible
    verify: (req, res, buf, encoding) => {
        try {
            JSON.parse(buf.toString('utf8'));
        } catch (e) {
            console.error('ERROR al parsear JSON en middleware:', e.message);
            console.error('Posición del error:', e.message.match(/position (\d+)/)?.[1]);
            console.error('Primeros 500 caracteres del body:', buf.toString('utf8').substring(0, 500));
            throw new Error(`JSON inválido: ${e.message}`);
        }
    }
}));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Middleware para capturar errores de parsing JSON
app.use((error, req, res, next) => {
    if (error instanceof SyntaxError || error.message.includes('JSON')) {
        console.error('========================================');
        console.error('ERROR DE PARSING JSON');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        console.error('Body recibido (primeros 1000 chars):', 
            req.body ? JSON.stringify(req.body).substring(0, 1000) : 'No body');
        console.error('========================================');
        
        return res.status(400).json({
            success: false,
            error: 'Error al parsear el JSON del body',
            details: error.message,
            hint: 'Verifica que el JSON esté correctamente formateado. Usa el script ejemplo-curl.sh como referencia.',
            position: error.message.match(/position (\d+)/)?.[1] || 'desconocida'
        });
    }
    next(error);
});

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

// Función para sanitizar y normalizar el nombre de archivo
function sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') {
        throw new Error('El filename debe ser una cadena de texto válida');
    }
    
    // Sanitizar el nombre del archivo (eliminar caracteres peligrosos)
    let sanitized = filename
        .replace(/[^a-zA-Z0-9._-]/g, '_')  // Reemplazar caracteres especiales
        .replace(/_{2,}/g, '_')            // Reemplazar múltiples guiones bajos
        .replace(/^_+|_+$/g, '')          // Eliminar guiones bajos al inicio/final
        .trim();
    
    // Si después de sanitizar está vacío, usar un nombre por defecto
    if (!sanitized) {
        sanitized = 'archivo';
    }
    
    // Asegurar que tenga extensión .json
    if (!sanitized.endsWith('.json')) {
        sanitized = `${sanitized}.json`;
    }
    
    return sanitized;
}

// Función para obtener la ruta de almacenamiento en EC2 - VERSIÓN SIMPLIFICADA Y ROBUSTA
function getStoragePath() {
    const homeDir = os.homedir();
    if (!homeDir) {
        throw new Error('No se pudo detectar el directorio home');
    }
    
    const desktopPath = path.join(homeDir, 'Desktop');
    const storagePath = path.join(desktopPath, 'jsonControlm');
    
    // Crear carpetas de forma forzada - SIEMPRE
    try {
        fs.mkdirSync(desktopPath, { recursive: true, mode: 0o755 });
    } catch (e) {
        // Ignorar si ya existe
    }
    
    try {
        fs.mkdirSync(storagePath, { recursive: true, mode: 0o755 });
    } catch (e) {
        // Ignorar si ya existe
    }
    
    return storagePath;
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
// Ahora lee el archivo desde la ruta de almacenamiento en EC2
async function executeControlMApi(ambiente, token, filename) {
    try {
        // Determinar la URL según el ambiente
        const apiUrl = ambiente === 'DEV' 
            ? 'https://controlms1de01:8446/automation-api/deploy'
            : 'https://controlms2qa01:8446/automation-api/deploy';

        console.log(`Ejecutando API para ambiente ${ambiente}: ${apiUrl}`);

        // Obtener la ruta de almacenamiento
        const storagePath = getStoragePath();
        
        // Sanitizar y normalizar el nombre del archivo (debe coincidir con el guardado)
        const fileName = sanitizeFilename(filename);
        const filePath = path.join(storagePath, fileName);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            throw new Error(`El archivo no existe en la ruta: ${filePath}`);
        }
        
        console.log(`Leyendo archivo desde: ${filePath}`);
        
        // Leer el archivo desde el sistema de archivos
        const fileStream = fs.createReadStream(filePath);
        
        // Crear form-data con el stream del archivo
        const form = new FormData();
        form.append('definitionsFile', fileStream, {
            filename: fileName,
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
        console.log(`Archivo cargado desde: ${filePath}`);
        
        return {
            success: true,
            status: response.status,
            data: response.data,
            filePath: filePath,
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

// Endpoint para guardar archivo JSON en EC2 - VERSIÓN DEFINITIVA Y ROBUSTA
app.post('/save-json', (req, res) => {
    console.log('\n========================================');
    console.log('=== INICIO POST /save-json ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('========================================\n');
    
    try {
        // 1. Logging inicial del request
        console.log('[1] Request recibido');
        console.log('[1] Body keys:', Object.keys(req.body));
        console.log('[1] Content-Type:', req.headers['content-type']);
        console.log('[1] Content-Length:', req.headers['content-length']);
        
        // 2. Validaciones básicas
        const { ambiente, token, filename, jsonData } = req.body;
        console.log('[2] Datos extraídos:', {
            ambiente: ambiente,
            token: token ? token.substring(0, 10) + '...' : 'NO',
            filename: filename,
            hasJsonData: !!jsonData,
            jsonDataType: typeof jsonData
        });
        
        if (!ambiente || !token || !filename || !jsonData) {
            console.error('[2] ❌ ERROR: Faltan campos requeridos');
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "jsonData"',
                received: {
                    ambiente: !!ambiente,
                    token: !!token,
                    filename: !!filename,
                    jsonData: !!jsonData
                }
            });
        }
        
        if (!['DEV', 'QA'].includes(ambiente)) {
            console.error('[2] ❌ ERROR: Ambiente inválido:', ambiente);
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }

        // 3. Parsear JSON
        console.log('[3] Parseando JSON...');
        let parsedJson;
        try {
            if (typeof jsonData === 'string') {
                console.log('[3] jsonData es string, parseando...');
                parsedJson = JSON.parse(jsonData);
            } else {
                console.log('[3] jsonData es objeto, usando directamente');
                parsedJson = jsonData;
            }
            console.log('[3] ✅ JSON parseado correctamente');
            console.log('[3] Keys del JSON:', Object.keys(parsedJson));
        } catch (error) {
            console.error('[3] ❌ ERROR parseando JSON:', error.message);
            return res.status(400).json({
                success: false,
                error: 'El campo jsonData debe contener un JSON válido',
                details: error.message
            });
        }

        // 4. Preparar nombre de archivo (preservar guiones)
        console.log('[4] Preparando nombre de archivo...');
        let fileName = String(filename).trim();
        console.log('[4] Filename original:', fileName);
        
        // Preservar guiones y puntos, solo eliminar caracteres realmente peligrosos
        fileName = fileName.replace(/[<>:"|?*\x00-\x1f]/g, '_').replace(/_{2,}/g, '_');
        
        if (!fileName.endsWith('.json')) {
            fileName = fileName + '.json';
        }
        
        if (!fileName || fileName === '.json') {
            fileName = 'archivo.json';
        }
        console.log('[4] Filename final:', fileName);

        // ===== LÓGICA DE GUARDADO (IDÉNTICA AL SCRIPT QUE FUNCIONA) =====
        
        // 5. Obtener rutas
        console.log('[5] Obteniendo rutas...');
        const homeDir = os.homedir();
        console.log('[5] Home directory:', homeDir);
        
        const desktopPath = path.join(homeDir, 'Desktop');
        const storagePath = path.join(desktopPath, 'jsonControlm');
        const filePath = path.join(storagePath, fileName);
        
        console.log('[5] Desktop path:', desktopPath);
        console.log('[5] Storage path:', storagePath);
        console.log('[5] File path:', filePath);
        
        // 6. Crear carpetas
        console.log('[6] Creando carpetas...');
        try {
            fs.mkdirSync(desktopPath, { recursive: true });
            console.log('[6] ✅ Desktop creado/verificado');
        } catch (e) {
            console.log('[6] ℹ️ Desktop ya existe o error (ignorado):', e.message);
        }
        
        try {
            fs.mkdirSync(storagePath, { recursive: true });
            console.log('[6] ✅ jsonControlm creado/verificado');
        } catch (e) {
            console.log('[6] ℹ️ jsonControlm ya existe o error (ignorado):', e.message);
        }
        
        // 7. Preparar datos JSON
        console.log('[7] Preparando JSON string...');
        const jsonString = JSON.stringify(parsedJson, null, 2);
        console.log('[7] ✅ JSON string preparado');
        console.log('[7] Longitud:', jsonString.length, 'caracteres');
        console.log('[7] Tamaño aproximado:', Math.round(jsonString.length / 1024), 'KB');
        
        // 8. ESCRIBIR ARCHIVO
        console.log('[8] Escribiendo archivo...');
        console.log('[8] Ruta completa:', filePath);
        try {
            fs.writeFileSync(filePath, jsonString, 'utf8');
            console.log('[8] ✅ Archivo escrito exitosamente');
        } catch (writeError) {
            console.error('[8] ❌ ERROR al escribir:', writeError.message);
            console.error('[8] Code:', writeError.code);
            console.error('[8] Errno:', writeError.errno);
            throw writeError;
        }
        
        // 9. VERIFICAR INMEDIATAMENTE
        console.log('[9] Verificando archivo...');
        if (!fs.existsSync(filePath)) {
            console.error('[9] ❌ ERROR: Archivo no existe después de escribirlo');
            throw new Error('El archivo no existe después de escribirlo: ' + filePath);
        }
        
        const stats = fs.statSync(filePath);
        console.log('[9] ✅ Archivo existe');
        console.log('[9] ✅ Tamaño:', stats.size, 'bytes');
        
        // 10. LEER Y VALIDAR ARCHIVO
        console.log('[10] Leyendo archivo para validar...');
        const readContent = fs.readFileSync(filePath, 'utf8');
        console.log('[10] ✅ Archivo leído');
        console.log('[10] Longitud leída:', readContent.length, 'caracteres');
        
        // Validar que el JSON es válido
        try {
            JSON.parse(readContent);
            console.log('[10] ✅ JSON válido');
        } catch (parseError) {
            console.error('[10] ❌ ERROR: JSON inválido después de leer:', parseError.message);
            throw new Error('El archivo guardado no contiene JSON válido');
        }
        
        console.log('\n========================================');
        console.log('=== ✅ ÉXITO: Archivo guardado ===');
        console.log('Filename:', fileName);
        console.log('File path:', filePath);
        console.log('File size:', stats.size, 'bytes');
        console.log('========================================\n');
        
        // Responder con éxito
        res.json({
            success: true,
            message: 'Archivo guardado exitosamente',
            filename: fileName,
            filePath: filePath,
            storagePath: storagePath,
            fileSize: stats.size,
            ambiente: ambiente
        });

    } catch (error) {
        console.error('=== ❌ ERROR ===');
        console.error('Error:', error.message);
        console.error('Code:', error.code);
        console.error('Stack:', error.stack);
        res.status(500).json({
            success: false,
            error: 'Error al guardar el archivo',
            details: error.message,
            code: error.code
        });
    }
});

// Endpoint para descargar archivo JSON directamente
app.post('/download-json', async (req, res) => {
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

        // Convertir JSON a string
        const jsonString = JSON.stringify(parsedJson, null, 2);

        // Configurar headers para descarga de archivo
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', Buffer.byteLength(jsonString));

        // Enviar el archivo como descarga
        console.log(`Descargando archivo: ${fileName}`);
        res.send(jsonString);

    } catch (error) {
        console.error('Error al descargar el archivo:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor al descargar el archivo'
        });
    }
});

// Endpoint para ejecutar Control-M usando archivo guardado en EC2
app.post('/execute-controlm', async (req, res) => {
    try {
        const { ambiente, token, filename } = req.body;
        
        // Validar que se proporcionen los datos requeridos
        if (!ambiente || !token || !filename) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token" y "filename"'
            });
        }
        
        // Validar que el ambiente sea DEV o QA
        if (!['DEV', 'QA'].includes(ambiente)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }
        
        // Ejecutar Control-M API usando el archivo guardado
        const result = await executeControlMApi(ambiente, token, filename);
        
        if (result.success) {
            res.json({
                success: true,
                message: 'Control-M ejecutado exitosamente',
                ambiente: ambiente,
                filename: filename,
                filePath: result.filePath,
                controlMResponse: result.data,
                status: result.status
            });
        } else {
            res.status(500).json({
                success: false,
                error: 'Error ejecutando Control-M',
                details: result.error,
                status: result.status,
                message: result.message
            });
        }
        
    } catch (error) {
        console.error('Error en endpoint execute-controlm:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            details: error.message
        });
    }
});

// Endpoint para guardar y ejecutar Control-M en un solo paso
app.post('/save-and-execute', async (req, res) => {
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
        
        // Sanitizar y normalizar el nombre del archivo
        const fileName = sanitizeFilename(filename);
        
        // 1. Guardar el archivo en EC2
        const storagePath = getStoragePath();
        const filePath = path.join(storagePath, fileName);
        
        console.log(`=== GUARDANDO Y EJECUTANDO ===`);
        console.log(`Filename recibido: ${filename}`);
        console.log(`Filename final (sanitizado): ${fileName}`);
        console.log(`Ruta completa: ${filePath}`);
        
        try {
            fs.writeFileSync(filePath, JSON.stringify(parsedJson, null, 2), 'utf8');
            console.log(`✅ Archivo guardado en EC2: ${filePath}`);
            
            // Verificar que el archivo se guardó
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✅ Archivo verificado - Tamaño: ${stats.size} bytes`);
            }
        } catch (writeError) {
            console.error(`❌ ERROR al escribir archivo: ${writeError.message}`);
            throw writeError;
        }
        
        // 2. Ejecutar Control-M usando el archivo guardado
        const controlMResult = await executeControlMApi(ambiente, token, filename);
        
        res.json({
            success: controlMResult.success,
            message: controlMResult.success 
                ? 'Archivo guardado y Control-M ejecutado exitosamente' 
                : 'Archivo guardado pero Control-M falló',
            filename: fileName,
            filePath: filePath,
            storagePath: storagePath,
            ambiente: ambiente,
            controlMResult: controlMResult
        });
        
    } catch (error) {
        console.error('Error en endpoint save-and-execute:', error);
        res.status(500).json({
            success: false,
            error: 'Error interno del servidor',
            details: error.message
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

// Endpoint de prueba para guardar un archivo de ejemplo - VERSIÓN SIMPLIFICADA
app.get('/test-save', async (req, res) => {
    try {
        console.log('[TEST-SAVE] Iniciando prueba de guardado...');
        
        const testData = {
            test: true,
            timestamp: new Date().toISOString(),
            message: 'Este es un archivo de prueba',
            data: { ejemplo: 'datos de prueba' }
        };
        
        const fileName = 'test-file.json';
        const storagePath = getStoragePath();
        const filePath = path.join(storagePath, fileName);
        
        console.log(`[TEST-SAVE] Ruta: ${filePath}`);
        
        // Guardar el archivo de forma directa
        fs.writeFileSync(filePath, JSON.stringify(testData, null, 2), { encoding: 'utf8', mode: 0o644 });
        console.log(`[TEST-SAVE] ✅ Archivo escrito`);
        
        // Verificar
        if (!fs.existsSync(filePath)) {
            throw new Error('El archivo no existe después de guardarlo');
        }
        
        const stats = fs.statSync(filePath);
        console.log(`[TEST-SAVE] ✅ Archivo verificado - Tamaño: ${stats.size} bytes`);
        
        res.json({
            success: true,
            message: 'Archivo de prueba guardado exitosamente',
            filePath: filePath,
            storagePath: storagePath,
            fileSize: stats.size,
            fileExists: true,
            instructions: `Ejecuta: ls -la ${filePath}`
        });
        
    } catch (error) {
        console.error('[TEST-SAVE] ❌ ERROR:', error.message);
        res.status(500).json({
            success: false,
            error: 'Error guardando archivo de prueba',
            message: error.message,
            filePath: error.filePath || 'N/A'
        });
    }
});

// Endpoint para forzar creación de carpeta (útil para debugging)
app.get('/create-storage', (req, res) => {
    try {
        console.log('=== FORZANDO CREACIÓN DE CARPETA DE ALMACENAMIENTO ===');
        const storagePath = getStoragePath();
        
        // Verificar que existe
        const exists = fs.existsSync(storagePath);
        let canWrite = false;
        try {
            fs.accessSync(storagePath, fs.constants.W_OK);
            canWrite = true;
        } catch (error) {
            console.error(`No se puede escribir en: ${storagePath}`, error.message);
        }
        
        // Intentar crear un archivo de prueba
        let testFileCreated = false;
        let testFilePath = '';
        try {
            testFilePath = path.join(storagePath, 'test-write.txt');
            fs.writeFileSync(testFilePath, 'test');
            testFileCreated = true;
            fs.unlinkSync(testFilePath); // Eliminar archivo de prueba
        } catch (error) {
            console.error(`Error creando archivo de prueba: ${error.message}`);
        }
        
        res.json({
            success: exists && canWrite,
            message: exists && canWrite 
                ? 'Carpeta de almacenamiento creada y verificada exitosamente' 
                : 'Error creando o verificando carpeta de almacenamiento',
            storagePath: storagePath,
            exists: exists,
            canWrite: canWrite,
            testFileCreated: testFileCreated,
            homeDir: os.homedir(),
            currentUser: getCurrentUser(),
            permissions: {
                desktop: fs.existsSync(path.join(os.homedir(), 'Desktop')),
                storage: exists
            }
        });
    } catch (error) {
        console.error('Error en create-storage:', error);
        res.status(500).json({
            success: false,
            error: 'Error creando carpeta de almacenamiento',
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Endpoint de diagnóstico
app.get('/diagnostic', (req, res) => {
    try {
        const currentUser = getCurrentUser();
        const storagePath = getStoragePath();
        
        // Listar archivos en la carpeta de almacenamiento
        let filesInStorage = [];
        try {
            if (fs.existsSync(storagePath)) {
                filesInStorage = fs.readdirSync(storagePath)
                    .filter(file => file.endsWith('.json'))
                    .map(file => {
                        const filePath = path.join(storagePath, file);
                        const stats = fs.statSync(filePath);
                        return {
                            filename: file,
                            size: stats.size,
                            created: stats.birthtime,
                            modified: stats.mtime
                        };
                    });
            }
        } catch (error) {
            console.error('Error listando archivos:', error.message);
        }
        
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
            storagePath: storagePath,
            storageExists: fs.existsSync(storagePath),
            filesInStorage: filesInStorage,
            filesCount: filesInStorage.length,
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
            message: 'Información de diagnóstico del sistema EC2',
            systemInfo: systemInfo,
            recommendations: {
                message: 'Revisa la información del sistema para verificar las rutas detectadas',
                nextSteps: [
                    'Verifica que storagePath sea correcto',
                    'Verifica que storageExists sea true',
                    'Los archivos JSON se guardan en: ' + storagePath,
                    'Usa POST /execute-controlm para ejecutar Control-M con archivos guardados'
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
    const storagePath = getStoragePath();
    
    res.json({
        message: 'API para guardar archivos JSON en EC2 y ejecutar Control-M',
        storagePath: storagePath,
        endpoints: {
            'GET /': 'Información de la API',
            'GET /diagnostic': 'Información de diagnóstico del sistema EC2',
            'GET /create-storage': 'Fuerza creación de carpeta de almacenamiento (debugging)',
            'GET /test-save': 'Guardar archivo de prueba para verificar que funciona',
            'POST /save-json': 'Guarda archivo JSON en EC2 (~/Desktop/jsonControlm)',
            'POST /execute-controlm': 'Ejecuta Control-M usando archivo guardado en EC2',
            'POST /save-and-execute': 'Guarda archivo y ejecuta Control-M en un solo paso',
            'POST /download-json': 'Descarga archivo JSON',
            'POST /generate-script': 'Genera script automático para guardar archivo'
        },
        examples: {
            saveJson: {
                method: 'POST',
                url: '/save-json',
                body: {
                    ambiente: 'DEV',
                    token: 'mi-token-123',
                    filename: 'mi-archivo',
                    jsonData: { "nombre": "ejemplo", "valor": 123 }
                }
            },
            executeControlM: {
                method: 'POST',
                url: '/execute-controlm',
                body: {
                    ambiente: 'DEV',
                    token: 'mi-token-123',
                    filename: 'mi-archivo'
                }
            },
            saveAndExecute: {
                method: 'POST',
                url: '/save-and-execute',
                body: {
                    ambiente: 'DEV',
                    token: 'mi-token-123',
                    filename: 'mi-archivo',
                    jsonData: { "nombre": "ejemplo", "valor": 123 }
                }
            }
        }
    });
});

// Iniciar servidor
app.listen(PORT, () => {
    console.log(`========================================`);
    console.log(`🚀 Iniciando servidor en puerto ${PORT}...`);
    console.log(`========================================`);
    
    try {
        const currentUser = getCurrentUser();
        console.log(`👤 Usuario detectado: ${currentUser}`);
        
        console.log(`📁 Intentando inicializar ruta de almacenamiento...`);
        const storagePath = getStoragePath();
        
        // Verificar una vez más que existe
        if (fs.existsSync(storagePath)) {
            console.log(`✅ VERIFICACIÓN FINAL: Carpeta existe: ${storagePath}`);
        } else {
            console.error(`❌ VERIFICACIÓN FINAL FALLIDA: Carpeta NO existe: ${storagePath}`);
            console.error(`   Esto es un problema crítico. Revisa los logs anteriores.`);
        }
        
        console.log(`========================================`);
        console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
        console.log(`👤 Usuario: ${currentUser}`);
        console.log(`📁 Ruta de almacenamiento: ${storagePath}`);
        console.log(`📁 Ruta existe: ${fs.existsSync(storagePath) ? 'SÍ' : 'NO'}`);
        console.log(`========================================`);
        console.log(`📋 Endpoints disponibles:`);
        console.log(`   GET / - Información de la API`);
        console.log(`   GET /diagnostic - Información de diagnóstico`);
        console.log(`   GET /create-storage - Forzar creación de carpeta`);
        console.log(`   GET /test-save - Guardar archivo de prueba`);
        console.log(`   POST /save-json - Guarda JSON en EC2`);
        console.log(`   POST /execute-controlm - Ejecuta Control-M con archivo guardado`);
        console.log(`   POST /save-and-execute - Guarda y ejecuta en un paso`);
        console.log(`========================================`);
    } catch (error) {
        console.error(`========================================`);
        console.error(`❌ ERROR CRÍTICO al inicializar servidor:`);
        console.error(`   ${error.message}`);
        console.error(`   Stack: ${error.stack}`);
        console.error(`========================================`);
        console.error(`El servidor continuará pero puede no funcionar correctamente.`);
        console.error(`Revisa los logs y ejecuta GET /create-storage para más información.`);
        console.error(`========================================`);
    }
});

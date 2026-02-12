const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const axios = require('axios');
const FormData = require('form-data');
const { execSync, exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

const app = express();
const PORT = process.env.PORT || 3000;

// Almacenar información de la última llamada a Control-M para debugging
let lastControlMCall = null;

/**
 * Parsea string en formato Java Map a objeto (parser estructural, carácter a carácter).
 * Soporta: objetos {}, arrays [], true/false, números, strings sin comillas, claves con ":".
 * @param {string} inputStr - String tipo {key=value, key2={subkey=value}, arr=[{a=1}]}
 * @returns {object|array} Objeto o array parseado
 */
function parseJavaMapString(inputStr) {
    if (typeof inputStr !== 'string') throw new Error('Input must be a string');
    const s = inputStr.trim();
    if (!s.length) throw new Error('Input string is empty');
    let i = 0;
    function skipWs() { while (i < s.length && /\s/.test(s[i])) i++; }
    const closeBracketRe = /[\]\uFF3D\uFF09]/;
    const closeBraceRe = /[\}\uFF5D]/;
    // Palabras que no deben tratarse como clave tras una coma (texto de Message); evita cortar en "informo=", "Informo=", etc.
    const NOT_A_KEY_AFTER_COMMA = new Set(['informo', 'Informo', 'estimado', 'Estimado', 'además', 'Además', 'ud', 'que', 'se', 'registra', 'promedio', 'ejecución', 'proceso', 'operador', 'sistema', 'atte', 'finalizó', 'finalizo', 'detallado', 'asunto', 'mail', 'incorrectamente', 'correctamente']);
    // Detecta si después de la coma viene un par key=value (ej. " AttachOutput=" o " Action:SetToNotOK_0="). No corta si la "clave" es texto de mensaje.
    // Las claves Control-M pueden llevar ":" (Action:SetToNotOK_0, IfBase:Folder:Output_12).
    function looksLikeNextKeyAfterComma() {
        const savedI = i;
        if (savedI >= s.length || s[savedI] !== ',') return false;
        let pos = savedI + 1;
        while (pos < s.length && /\s/.test(s[pos])) pos++;
        const keyStart = pos;
        while (pos < s.length && /[a-zA-Z0-9_.:-]/.test(s[pos])) pos++;
        const possibleKey = s.substring(keyStart, pos).trim();
        while (pos < s.length && /\s/.test(s[pos])) pos++;
        if (possibleKey.length === 0 || pos >= s.length || s[pos] !== '=') return false;
        if (NOT_A_KEY_AFTER_COMMA.has(possibleKey)) return false;
        return /^[A-Za-z_]/.test(possibleKey);
    }
    function readPrimitiveValue(isInsideArray) {
        let depth = 0;
        const start = i;
        while (i < s.length) {
            const c = s[i];
            if (depth === 0 && c === ',') {
                if (isInsideArray) break;
                if (looksLikeNextKeyAfterComma()) break;
                i++;
                continue;
            }
            if (depth === 0 && (closeBraceRe.test(c) || closeBracketRe.test(c))) break;
            if (c === '{' || c === '[') depth++;
            else if (c === '}' || c === ']' || closeBracketRe.test(c) || closeBraceRe.test(c)) depth--;
            i++;
        }
        return s.substring(start, i).trim();
    }
    function parseValue(isInsideArray) {
        skipWs();
        if (i >= s.length) throw new Error('Unexpected end of input');
        if (s[i] === '{') return parseObject();
        if (s[i] === '[') return parseArray();
        if (s.substring(i, i + 4) === 'true') { i += 4; return true; }
        if (s.substring(i, i + 5) === 'false') { i += 5; return false; }
        return readPrimitiveValue(!!isInsideArray);
    }
    function parseObject() {
        if (s[i] !== '{') throw new Error('Expected {');
        i++;
        const obj = {};
        while (true) {
            skipWs();
            if (i < s.length && s[i] === '}') { i++; return obj; }
            const keyStart = i;
            while (i < s.length && s[i] !== '=') i++;
            const key = s.substring(keyStart, i).trim();
            if (!key) throw new Error('Empty key in object');
            if (i < s.length) i++;
            try { obj[key] = parseValue(); } catch (e) { throw new Error(`Value for key "${key}": ${e.message}`); }
            skipWs();
            if (i < s.length && s[i] === '}') { i++; return obj; }
            if (i < s.length && s[i] === ',') { i++; continue; }
            if (i >= s.length) throw new Error('Unexpected end in object');
            if (/[a-zA-Z0-9_:.-]/.test(s[i])) continue;
            throw new Error(`Expected , or } at position ${i}`);
        }
    }
    function parseArray() {
        if (s[i] !== '[') throw new Error('Expected [');
        i++;
        const arr = [];
        while (true) {
            skipWs();
            if (i < s.length && (s[i] === ']' || closeBracketRe.test(s[i]))) { i++; return arr; }
            arr.push(parseValue(true));
            skipWs();
            if (i < s.length && (s[i] === ']' || closeBracketRe.test(s[i]))) { i++; return arr; }
            if (i < s.length && s[i] === ',') { i++; continue; }
            if (i >= s.length) throw new Error('Unexpected end in array');
            throw new Error(`Expected , or ] at position ${i}`);
        }
    }
    skipWs();
    if (s[i] === '{') return parseObject();
    if (s[i] === '[') return parseArray();
    if (i >= s.length) throw new Error('Expected { or [ at root');
    const keyStart = i;
    while (i < s.length && s[i] !== '=' && s[i] !== '[' && s[i] !== '{') i++;
    const key = s.substring(keyStart, i).trim();
    if (!key) throw new Error('Expected { or [ at root');
    skipWs();
    if (i >= s.length) throw new Error('Unexpected end at root');
    if (s[i] === '=') i++;
    skipWs();
    const rootObj = {};
    try { rootObj[key] = parseValue(); } catch (e) { throw new Error(`Value for key "${key}": ${e.message}`); }
    return rootObj;
}

/**
 * Normalizaciones específicas Control-M / OS400 sobre el JSON parseado.
 * - OS400-JOBD: si viene sin '*', anteponer '*' (ej. USRPRF -> *USRPRF)
 * Se aplica de forma recursiva sobre objetos/arrays.
 * @param {any} data
 * @returns {any} mismo objeto (mutado) para conveniencia
 */
function normalizeControlMParsedData(data) {
    const seen = new Set();
    function escapeControlCharsForControlMString(s) {
        if (typeof s !== 'string' || !s) return s;
        // Convertir controles comunes a secuencias literales (\n, \t, etc.) para que no queden caracteres de control reales.
        let out = s
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n/g, '\\n')
            .replace(/\t/g, '\\t')
            .replace(/\f/g, '\\f')
            .replace(/\b/g, '\\b');
        // Remover cualquier otro control ASCII restante (0x00-0x1F)
        out = out.replace(/[\u0000-\u001F]/g, '');
        return out;
    }
    function walk(node) {
        if (node == null) return;
        if (typeof node !== 'object') return;
        if (seen.has(node)) return;
        seen.add(node);

        if (Array.isArray(node)) {
            for (const item of node) walk(item);
            return;
        }

        for (const k of Object.keys(node)) {
            const v = node[k];
            if (k === 'OS400-JOBD' && typeof v === 'string') {
                const trimmed = v.trim();
                if (trimmed && !trimmed.startsWith('*')) node[k] = `*${trimmed}`;
            }
            // Control-M deploy puede rechazar caracteres de control reales dentro de strings (ej. newlines en Message).
            if ((k === 'Message' || k === 'Subject') && typeof v === 'string') {
                node[k] = escapeControlCharsForControlMString(v);
            }
            walk(node[k]);
        }
    }
    walk(data);
    return data;
}

// Middleware
app.use(cors());
app.use(express.json({
    limit: '50mb',
    strict: false,
    verify: (req, res, buf, encoding) => {
        try {
            req.rawBody = buf.toString(encoding || 'utf8');
        } catch {
            req.rawBody = undefined;
        }
    }
}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sanitiza JSON potencialmente inválido por caracteres de control dentro de strings.
// Corrige casos comunes como saltos de línea "reales" dentro de un string (deben ser \\n en JSON).
function sanitizePossiblyInvalidJson(raw) {
    if (typeof raw !== 'string' || raw.length === 0) return raw;
    let out = '';
    let inString = false;
    let escaped = false;
    for (let idx = 0; idx < raw.length; idx++) {
        const ch = raw[idx];
        if (!inString) {
            if (ch === '"') inString = true;
            out += ch;
            continue;
        }

        // Estamos dentro de string JSON ("...") y debemos escapar control chars.
        if (escaped) {
            // JSON no soporta \', convertir a '
            if (ch === "'") {
                out += "'";
            } else {
                out += ch;
            }
            escaped = false;
            continue;
        }

        if (ch === '\\') {
            out += ch;
            escaped = true;
            continue;
        }
        if (ch === '"') {
            out += ch;
            inString = false;
            continue;
        }

        // Convertir saltos de línea/tab reales dentro de strings
        if (ch === '\r') {
            // Consumir \r\n como un solo \\n
            if (raw[idx + 1] === '\n') idx++;
            out += '\\n';
            continue;
        }
        if (ch === '\n') { out += '\\n'; continue; }
        if (ch === '\t') { out += '\\t'; continue; }

        // Remover otros control chars ASCII (0x00-0x1F)
        const code = ch.charCodeAt(0);
        if (code >= 0 && code < 0x20) continue;

        out += ch;
    }
    return out;
}

// Middleware para capturar errores de parsing JSON
app.use((error, req, res, next) => {
    // Si el JSON del body falla por caracteres de control (p. ej. saltos de línea en strings),
    // intentamos sanitizar el body crudo y re-parsear para no rechazar la petición.
    if (error instanceof SyntaxError && typeof req.rawBody === 'string' && req.rawBody.length) {
        try {
            const sanitized = sanitizePossiblyInvalidJson(req.rawBody);
            req.body = JSON.parse(sanitized);
            return next();
        } catch {
            // continúa al error estándar
        }
    }

    if (error instanceof SyntaxError || error.message.includes('JSON')) {
        console.error('========================================');
        console.error('ERROR DE PARSING JSON');
        console.error('Mensaje:', error.message);
        console.error('Stack:', error.stack);
        console.error('========================================');
        
        return res.status(400).json({
            success: false,
            error: 'Error al parsear el JSON del body',
            details: error.message,
            hint: 'Verifica que el JSON esté correctamente formateado.'
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
        
        const storagePath = path.join(desktopPath, 'jsonControlm');
        
        console.log(\`Ruta del Escritorio: \${desktopPath}\`);
        console.log(\`Ruta de almacenamiento: \${storagePath}\`);
        
        // Crear carpeta jsonControlm si no existe
        if (!fs.existsSync(storagePath)) {
            fs.mkdirSync(storagePath, { recursive: true });
            console.log(\`✅ Carpeta jsonControlm creada: \${storagePath}\`);
        } else {
            console.log(\`ℹ️ Carpeta jsonControlm ya existe: \${storagePath}\`);
        }
        
        // Ruta completa del archivo
        const filePath = path.join(storagePath, filename);
        
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

// Función para ejecutar la API de Control-M
// Ahora lee el archivo desde la ruta de almacenamiento en EC2
async function executeControlMApi(controlmApiUrl, token, filePath) {
    try {
        filePath = path.resolve(filePath);
        const fileName = path.basename(filePath);
        const fileStats = fs.existsSync(filePath) ? fs.statSync(filePath) : null;
        
        lastControlMCall = {
            timestamp: new Date().toISOString(),
            url: controlmApiUrl,
            token: token ? `${token.substring(0, 20)}...${token.substring(token.length - 10)}` : 'NO',
            filePath: filePath,
            fileName: fileName,
            fileSize: fileStats ? fileStats.size : 0,
            fileExists: fs.existsSync(filePath),
            status: 'in_progress'
        };
        
        console.log(`[CONTROL-M] ========================================`);
        console.log(`[CONTROL-M] Ejecutando API de Control-M`);
        console.log(`[CONTROL-M] URL: ${controlmApiUrl}`);
        console.log(`[CONTROL-M] Archivo: ${filePath}`);
        console.log(`[CONTROL-M] Token: ${token ? token.substring(0, 20) + '...' : 'NO'}`);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            lastControlMCall.status = 'error';
            lastControlMCall.error = `El archivo no existe en la ruta: ${filePath}`;
            throw new Error(`El archivo no existe en la ruta: ${filePath}`);
        }
        
        console.log(`[CONTROL-M] Archivo verificado que existe`);
        
        // Leer el archivo desde el sistema de archivos
        console.log(`[CONTROL-M] Leyendo archivo desde: ${filePath}`);
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (e) => {
            console.error(`[CONTROL-M] Error leyendo archivo stream: ${e.message}`);
        });
        
        // Crear form-data con el stream del archivo
        console.log(`[CONTROL-M] Creando form-data...`);
        const form = new FormData();
        form.append('definitionsFile', fileStream, {
            filename: fileName,
            contentType: 'application/json',
            // Ayuda a form-data/axios a calcular Content-Length correctamente (evita chunked)
            knownLength: fileStats ? fileStats.size : undefined
        });
        
        // Guardar metadata del form-data para diagnóstico
        if (lastControlMCall) {
            lastControlMCall.formData = {
                field: 'definitionsFile',
                filename: fileName,
                contentType: 'application/json',
                filePath
            };
        }

        // Configurar headers con Bearer token
        console.log(`[CONTROL-M] Configurando headers...`);
        const headers = {
            ...form.getHeaders(),
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
        };

        // Algunos servidores rechazan multipart con Transfer-Encoding: chunked.
        // Forzamos Content-Length (curl lo envía; axios a veces no).
        try {
            const contentLength = await new Promise((resolve, reject) => {
                form.getLength((err, length) => (err ? reject(err) : resolve(length)));
            });
            headers['Content-Length'] = String(contentLength);
            console.log(`[CONTROL-M] Content-Length calculado: ${contentLength}`);
        } catch (lenErr) {
            console.warn(`[CONTROL-M] No se pudo calcular Content-Length del form-data: ${lenErr.message}`);
        }

        if (lastControlMCall) {
            lastControlMCall.requestHeaders = {
                'Content-Type': headers['content-type'],
                'Authorization': token ? `Bearer ${token.substring(0, 20)}...${token.substring(token.length - 10)}` : 'NO'
            };
            if (headers['Content-Length'] != null) lastControlMCall.requestHeaders['Content-Length'] = headers['Content-Length'];
        }
        
        // Log REQUEST completo para EC2
        const requestLog = {
            url: controlmApiUrl,
            method: 'POST',
            headers: {
                'Content-Type': headers['content-type'],
                'Authorization': `Bearer ${token.substring(0, 20)}...${token.substring(token.length - 10)}`,
                'Content-Length': headers['Content-Length'] || 'NO'
            },
            formData: { field: 'definitionsFile', filename: fileName, contentType: 'application/json', filePath }
        };
        console.log(`[CONTROL-M] ========== REQUEST ==========`);
        console.log(`[CONTROL-M] REQUEST:`, JSON.stringify(requestLog, null, 2));
        console.log(`[CONTROL-M] =============================`);
        
        const config = {
            headers: headers,
            timeout: 60000, // 60 segundos timeout (aumentado para archivos grandes)
            // Deshabilitar verificación SSL para IPs privadas o certificados autofirmados
            httpsAgent: new https.Agent({
                rejectUnauthorized: false
            }),
            // Configuración adicional para axios
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        };

        // Realizar la petición POST
        console.log(`[CONTROL-M] 🚀 Enviando petición POST a Control-M...`);
        console.log(`[CONTROL-M] Configuración SSL: rejectUnauthorized=false (para IPs privadas)`);
        const startTime = Date.now();
        const response = await axios.post(controlmApiUrl, form, config);
        const endTime = Date.now();
        const duration = endTime - startTime;
        
        if (lastControlMCall) {
            lastControlMCall.status = 'success';
            lastControlMCall.finishedAt = new Date().toISOString();
            lastControlMCall.response = {
                status: response.status,
                statusText: response.statusText || '',
                durationMs: duration
            };
        }
        
        const responseBodyStr = JSON.stringify(response.data, null, 2);
        const maxLogLen = 5000;
        const responseBodyLog = responseBodyStr.length <= maxLogLen ? responseBodyStr : responseBodyStr.substring(0, maxLogLen) + '\n... (truncado, total ' + responseBodyStr.length + ' chars)';
        console.log(`[CONTROL-M] ========== RESPONSE ==========`);
        console.log(`[CONTROL-M] RESPONSE status: ${response.status} ${response.statusText || ''} (${duration}ms)`);
        console.log(`[CONTROL-M] RESPONSE headers:`, JSON.stringify(response.headers));
        console.log(`[CONTROL-M] RESPONSE body:\n${responseBodyLog}`);
        console.log(`[CONTROL-M] ==============================`);
        
        return {
            success: true,
            status: response.status,
            data: response.data,
            filePath: filePath,
            message: `API de Control-M ejecutada exitosamente`
        };

    } catch (error) {
        // Actualizar información del error
        if (lastControlMCall) {
            lastControlMCall.status = 'error';
            lastControlMCall.error = {
                message: error.message,
                status: error.response?.status || 'N/A',
                statusText: error.response?.statusText || 'N/A',
                data: error.response?.data || null,
                requestConfig: error.config ? {
                    url: error.config.url,
                    method: error.config.method,
                    headers: error.config.headers ? Object.keys(error.config.headers) : 'N/A'
                } : null
            };
        }
        
        console.error(`[CONTROL-M] ========== ERROR ==========`);
        console.error(`[CONTROL-M] REQUEST (que falló): URL=${controlmApiUrl} method=POST filePath=${filePath}`);
        console.error(`[CONTROL-M] ERROR mensaje: ${error.message}`);
        if (error.response) {
            console.error(`[CONTROL-M] RESPONSE (error) status: ${error.response.status} ${error.response.statusText || ''}`);
            console.error(`[CONTROL-M] RESPONSE (error) headers:`, JSON.stringify(error.response.headers));
            console.error(`[CONTROL-M] RESPONSE (error) body:`, JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.error(`[CONTROL-M] RESPONSE: no se recibió respuesta del servidor`);
        } else {
            console.error(`[CONTROL-M] Error de configuración:`, error.message);
        }
        console.error(`[CONTROL-M] ===========================`);
        
        return {
            success: false,
            error: error.message,
            status: error.response?.status || 'N/A',
            statusText: error.response?.statusText || 'N/A',
            data: error.response?.data || null,
            message: `Error ejecutando API de Control-M`
        };
    }
}

// Ruta de guardado save-json: Desktop/jsonControlm
const SAVE_JSON_STORAGE_PATH = path.join(os.homedir(), "Desktop", "jsonControlm");

// POST /save-json - Lógica oficial: validar, parsear Java Map, guardar JSON y ejecutar Control-M
app.post("/save-json", async (req, res) => {
    try {
        const body = req.body || {};
        const ambiente = (body.ambiente != null ? String(body.ambiente).trim() : "");
        const token = (body.token != null ? String(body.token).trim() : "");
        const filename = (body.filename != null ? String(body.filename).trim() : "");
        const controlm_api = (body.controlm_api != null ? String(body.controlm_api).trim() : "");
        const jsonData = body.jsonData;

        if (!ambiente || !token || !filename || !controlm_api || jsonData == null) {
            return res.status(400).json({ status: "error", message: "Faltan campos obligatorios: ambiente, token, filename, controlm_api, jsonData" });
        }
        if (!/^https?:\/\//i.test(controlm_api)) {
            return res.status(400).json({ status: "error", message: "El campo controlm_api debe ser una URL válida (ej: https://controlms1de01:8446/automation-api/deploy)" });
        }
        if (typeof jsonData !== "string" && typeof jsonData !== "object") {
            return res.status(400).json({ status: "error", message: "El campo jsonData debe ser un string (formato Java Map) o objeto" });
        }
        const ambienteNorm = ambiente.toUpperCase();
        if (ambienteNorm !== "QA" && ambienteNorm !== "DEV") {
            return res.status(400).json({ status: "error", message: "El campo ambiente solo puede ser QA o DEV" });
        }

        const jsonDataStr = typeof jsonData === "string" ? jsonData : JSON.stringify(jsonData);
        let parsedData;
        try { parsedData = parseJavaMapString(jsonDataStr); } catch (parseErr) {
            return res.status(400).json({ status: "error", message: "Error parseando jsonData: " + parseErr.message });
        }
        normalizeControlMParsedData(parsedData);

        let fileName = filename.replace(/[<>:"|?*\x00-\x1f]/g, "_").trim();
        if (!fileName) fileName = "archivo";
        if (!fileName.endsWith(".json")) fileName += ".json";

        let storagePath = SAVE_JSON_STORAGE_PATH; // ~/Desktop/jsonControlm
        if (!fs.existsSync(storagePath)) fs.mkdirSync(storagePath, { recursive: true });
        let filePath = path.join(storagePath, fileName);

        const jsonOutput = JSON.stringify(parsedData, null, 4);
        let desktopWriteOk = false;
        let fallbackUsed = false;
        try {
            fs.writeFileSync(filePath, jsonOutput, "utf8");
            desktopWriteOk = true;
        } catch (writeErr) {
            // Fallback de seguridad (mantiene comportamiento existente si Desktop no es escribible)
            if ((writeErr.code === "EPERM" || writeErr.code === "EACCES") && storagePath === SAVE_JSON_STORAGE_PATH) {
                fallbackUsed = true;
                storagePath = path.resolve(__dirname, "jsonControlm");
                fs.mkdirSync(storagePath, { recursive: true });
                filePath = path.join(storagePath, fileName);
                fs.writeFileSync(filePath, jsonOutput, "utf8");
            } else {
                throw writeErr;
            }
        }

        // Ejecutar Control-M usando el archivo recién guardado (form-data: definitionsFile)
        const controlMResult = await executeControlMApi(controlm_api, token, filePath);

        const message = controlMResult && controlMResult.success
            ? "Archivo generado correctamente y Control-M ejecutado exitosamente"
            : "Archivo generado correctamente pero Control-M falló";

        return res.status(200).json({
            status: "success",
            message,
            file: fileName,
            filePath,
            storagePath,
            savedToDesktop: desktopWriteOk,
            fallbackUsed,
            controlm_api,
            controlMResult
        });
    } catch (err) {
        console.error("Error en POST /save-json:", err);
        return res.status(500).json({ status: "error", message: err.message || "Error interno del servidor" });
    }
});


// Endpoint para validar conversión de jsonData (formato Java/Map → JSON con comillas dobles)
// POST body: { "jsonData": "{GENER_NEXUS-...={Type=SimpleFolder, ...}}" }
// Respuesta: { success, converted, jsonString, fromJavaMap } para validar que se transforma correctamente
app.post('/convert-json-data', (req, res) => {
    try {
        const jsonData = req.body && (req.body.jsonData != null ? req.body.jsonData : req.body);
        if (jsonData == null) {
            return res.status(400).json({
                success: false,
                error: 'Se requiere el campo "jsonData" (string en formato Java/Map o JSON válido)'
            });
        }
        const str = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
        try {
            const converted = parseJavaMapString(str);
            normalizeControlMParsedData(converted);
            return res.json({
                success: true,
                message: 'jsonData convertido a JSON (parser Java Map)',
                converted,
                jsonString: JSON.stringify(converted, null, 4),
                structureValid: typeof converted === 'object' && converted !== null
            });
        } catch (e) {
            return res.status(400).json({
                success: false,
                error: e.message || 'No se pudo convertir jsonData'
            });
        }
    } catch (error) {
        console.error('Error en /convert-json-data:', error);
        return res.status(500).json({
            success: false,
            error: error.message
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
        const { ambiente, token, filename, controlm_api } = req.body;
        
        // Validar que se proporcionen los datos requeridos
        if (!ambiente || !token || !filename || !controlm_api) {
            return res.status(400).json({
                success: false,
                error: 'Se requieren los campos "ambiente", "token", "filename" y "controlm_api"'
            });
        }
        
        // Validar que el ambiente sea DEV o QA
        if (!['DEV', 'QA'].includes(ambiente)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "ambiente" solo puede tener los valores "DEV" o "QA"'
            });
        }
        
        // Validar que controlm_api sea una URL válida
        if (!/^https?:\/\//i.test(controlm_api)) {
            return res.status(400).json({
                success: false,
                error: 'El campo "controlm_api" debe ser una URL válida (ej: https://controlms1de01:8446/automation-api/deploy)'
            });
        }
        
        // Construir la ruta completa del archivo
        const storagePath = getStoragePath();
        let fileName = String(filename).trim();
        if (!fileName.endsWith('.json')) {
            fileName = fileName + '.json';
        }
        const filePath = path.join(storagePath, fileName);
        
        // Verificar que el archivo existe
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: `El archivo no existe: ${filePath}`,
                filePath: filePath
            });
        }
        
        // Ejecutar Control-M API usando el archivo guardado
        const result = await executeControlMApi(controlm_api, token, filePath);
        
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
        const { ambiente, token, filename, jsonData, controlm_api } = req.body;
        
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
        
        // 2. Ejecutar Control-M usando el archivo guardado (si se proporciona controlm_api)
        let controlMResult = null;
        if (controlm_api && /^https?:\/\//i.test(controlm_api)) {
            try {
                controlMResult = await executeControlMApi(controlm_api, token, filePath);
                console.log('✅ Control-M ejecutado exitosamente');
            } catch (controlMError) {
                console.error('❌ Error ejecutando Control-M:', controlMError.message);
                controlMResult = {
                    success: false,
                    error: controlMError.message,
                    status: controlMError.response?.status || 'N/A',
                    message: 'Error ejecutando API de Control-M'
                };
            }
        } else {
            console.log('ℹ️ Control-M no se ejecutará (falta controlm_api o no es una URL válida)');
        }
        
        const response = {
            success: true,
            message: controlMResult 
                ? (controlMResult.success 
                    ? 'Archivo guardado y Control-M ejecutado exitosamente' 
                    : 'Archivo guardado pero Control-M falló')
                : 'Archivo guardado exitosamente (Control-M no se ejecutó)',
            filename: fileName,
            filePath: filePath,
            storagePath: storagePath,
            ambiente: ambiente
        };
        
        if (controlMResult) {
            response.controlMResult = controlMResult;
        }
        
        res.json(response);
        
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
                    '4. El archivo se guardará automáticamente en Escritorio/jsonControlm'
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

// Endpoint para ver información de logs
app.get('/logs', (req, res) => {
    try {
        const logInfo = {
            message: 'Información sobre los logs de la API',
            instructions: {
                pm2: [
                    'Ver logs en tiempo real: pm2 logs save-json-api',
                    'Ver últimas 100 líneas: pm2 logs save-json-api --lines 100',
                    'Logs guardados en: ~/.pm2/logs/',
                    'Archivo output: ~/.pm2/logs/save-json-api-out.log',
                    'Archivo errores: ~/.pm2/logs/save-json-api-error.log'
                ],
                direct: [
                    'Si ejecutas con node server.js, los logs aparecen en la consola',
                    'Ejecuta: node server.js | tee server.log para guardar en archivo'
                ],
                systemd: [
                    'Ver logs: sudo journalctl -u save-json-api -f',
                    'Últimas 100 líneas: sudo journalctl -u save-json-api -n 100'
                ]
            },
            debugFiles: {
                location: '/tmp/',
                pattern: 'debug-*.txt',
                command: 'ls -la /tmp/debug-*.txt 2>/dev/null || echo "No hay archivos de debug"'
            },
            currentProcess: {
                pid: process.pid,
                uptime: Math.round(process.uptime()),
                memory: process.memoryUsage(),
                platform: process.platform,
                nodeVersion: process.version
            }
        };
        
        res.json(logInfo);
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información de logs',
            details: error.message
        });
    }
});

// Endpoint para ver la última llamada a Control-M
app.get('/last-controlm-call', (req, res) => {
    try {
        if (!lastControlMCall) {
            return res.json({
                success: false,
                message: 'No se ha realizado ninguna llamada a Control-M aún',
                instructions: 'Ejecuta POST /save-json con el campo controlm_api para que se registre la llamada'
            });
        }
        
        res.json({
            success: true,
            message: 'Información de la última llamada a Control-M',
            call: lastControlMCall,
            comparison: {
                expected: {
                    url: 'https://controlms1de01:8446/automation-api/deploy',
                    method: 'POST',
                    header: 'Authorization: Bearer TOKEN',
                    formField: 'definitionsFile',
                    formType: 'file (multipart/form-data)'
                },
                actual: {
                    url: lastControlMCall.url,
                    method: 'POST',
                    header: `Authorization: Bearer ${lastControlMCall.token}`,
                    formField: lastControlMCall.formData?.field || 'N/A',
                    formType: 'file (multipart/form-data)',
                    filename: lastControlMCall.formData?.filename || 'N/A',
                    filePath: lastControlMCall.filePath
                },
                matches: {
                    url: lastControlMCall.url.includes('controlms') && lastControlMCall.url.includes('/automation-api/deploy'),
                    hasToken: !!lastControlMCall.token && lastControlMCall.token !== 'NO',
                    hasFormField: lastControlMCall.formData?.field === 'definitionsFile',
                    fileExists: lastControlMCall.fileExists
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: 'Error obteniendo información de la última llamada',
            details: error.message
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
            'POST /save-json': 'Guarda archivo JSON en EC2 (~/Desktop/jsonControlm). Acepta jsonData en formato Java/Map (key=value) y lo convierte a JSON con comillas dobles',
            'POST /convert-json-data': 'Valida conversión: recibe jsonData en formato Java/Map y devuelve el JSON convertido (comillas dobles) sin guardar',
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

// Exportar conversión para tests (solo cuando se requiere el módulo, no cuando se ejecuta node server.js)
if (require.main !== module) {
    module.exports = { parseJavaMapString };
    return;
}

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

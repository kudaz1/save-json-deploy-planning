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
        // En Windows, usar whoami
        if (process.platform === 'win32') {
            return execSync('whoami', { encoding: 'utf8' }).trim();
        } else {
            // En sistemas Unix-like, usar who am i
            return execSync('who am i', { encoding: 'utf8' }).split(' ')[0];
        }
    } catch (error) {
        console.warn('No se pudo obtener el usuario de la sesión:', error.message);
        return os.userInfo().username;
    }
}

// Función para obtener la ruta del escritorio del usuario de sesión actual
function getDesktopPath() {
    try {
        const currentUser = getCurrentUser();
        
        // En Windows, construir la ruta del escritorio del usuario de sesión
        if (process.platform === 'win32') {
            // Para Windows, usar la ruta C:\Users\[usuario]\Desktop
            return path.join('C:', 'Users', currentUser, 'Desktop');
        } else {
            // En sistemas Unix-like, usar /home/[usuario]/Desktop
            return path.join('/home', currentUser, 'Desktop');
        }
    } catch (error) {
        console.warn('No se pudo obtener la ruta del escritorio del usuario de sesión:', error.message);
        // Fallback al directorio home del proceso actual
        return path.join(os.homedir(), 'Desktop');
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

        // Obtener ruta del escritorio del usuario de sesión y crear carpeta controlm
        const desktopPath = getDesktopPath();
        const controlMPath = path.join(desktopPath, 'controlm');
        
        console.log(`Escritorio del usuario de sesión: ${desktopPath}`);
        
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
            message: 'Archivo JSON guardado exitosamente en la carpeta controlm del escritorio del usuario de sesión',
            filename: fileName,
            ambiente: ambiente,
            token: token,
            jsonSize: JSON.stringify(parsedJson).length,
            filePath: filePath,
            currentUser: currentUser,
            desktopPath: desktopPath,
            controlMPath: controlMPath,
            controlMInfo: controlMInfo,
            clientInstructions: {
                message: 'Archivo guardado en controlm del escritorio del usuario de sesión. Usa la información en controlMInfo para ejecutar la API de Control-M desde tu máquina local',
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

// Endpoint de prueba
app.get('/', (req, res) => {
    res.json({
        message: 'API para guardar archivos JSON',
        endpoints: {
            'POST /save-json': 'Guarda un archivo JSON en el escritorio/controlM'
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

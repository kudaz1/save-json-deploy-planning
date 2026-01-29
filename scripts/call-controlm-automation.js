/**
 * Script para llamar a la API de Control-M Automation: automation-api/deploy
 *
 * - Llama a: automation-api/deploy (URL completa en CONTROLM_API_URL)
 * - Método: POST con body multipart/form-data
 * - Form key: definitionsFile
 * - Form value: archivo JSON cargado desde la ruta donde se guardó el JSON (CONTROLM_FILE_PATH)
 *
 * Se ejecuta desde POST /save-json cuando se envía script_path: "scripts/call-controlm-automation.js"
 * La API inyecta al script:
 *
 *   CONTROLM_API_URL   - URL (ej: https://10.20.74.53:8446/automation-api/deploy)
 *   CONTROLM_TOKEN     - Bearer token
 *   CONTROLM_FILE_PATH - Ruta donde quedó guardado el JSON → se carga y envía como definitionsFile
 *   CONTROLM_FILENAME  - Nombre del archivo (ej: mi-archivo.json)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const FormData = require('form-data');

const CONTROLM_API_URL = process.env.CONTROLM_API_URL;
const CONTROLM_TOKEN = process.env.CONTROLM_TOKEN;
const CONTROLM_FILE_PATH = process.env.CONTROLM_FILE_PATH;

function log(msg) {
  const line = `[CONTROL-M-SCRIPT] ${msg}`;
  console.log(line);
}

function exitErr(msg) {
  log('ERROR: ' + msg);
  process.exit(1);
}

async function callControlMAutomation() {
  if (!CONTROLM_API_URL || !CONTROLM_TOKEN || !CONTROLM_FILE_PATH) {
    exitErr(
      'Faltan variables de entorno. Este script debe ejecutarse desde POST /save-json con controlm_api y token. ' +
      'Variables: CONTROLM_API_URL, CONTROLM_TOKEN, CONTROLM_FILE_PATH'
    );
  }

  if (!fs.existsSync(CONTROLM_FILE_PATH)) {
    exitErr('El archivo no existe: ' + CONTROLM_FILE_PATH);
  }

  const fileName = path.basename(CONTROLM_FILE_PATH);
  // Cargar el archivo desde la ruta donde se guardó el JSON (value de definitionsFile)
  const fileStream = fs.createReadStream(CONTROLM_FILE_PATH);

  const form = new FormData();
  // key: definitionsFile | value: archivo JSON cargado desde CONTROLM_FILE_PATH
  form.append('definitionsFile', fileStream, {
    filename: fileName,
    contentType: 'application/json'
  });

  const headers = {
    ...form.getHeaders(),
    'Authorization': `Bearer ${CONTROLM_TOKEN}`
  };

  const url = new URL(CONTROLM_API_URL);
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: headers
  };
  if (isHttps) {
    options.rejectUnauthorized = false;
  }

  log('URL: automation-api/deploy -> ' + CONTROLM_API_URL);
  log('definitionsFile = archivo cargado desde: ' + CONTROLM_FILE_PATH);
  log('Enviando POST form-data (key: definitionsFile, value: archivo desde ruta)...');

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        log('Status: ' + res.statusCode);
        log('Response: ' + (data.length > 500 ? data.substring(0, 500) + '...' : data));
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data });
        } else {
          reject(new Error(`Control-M API respondió ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (err) => {
      log('Error de conexión: ' + err.message);
      reject(err);
    });

    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Timeout 60s'));
    });

    form.pipe(req);
  });
}

callControlMAutomation()
  .then(() => {
    log('OK');
    process.exit(0);
  })
  .catch((err) => {
    log('Fallo: ' + err.message);
    process.exit(1);
  });

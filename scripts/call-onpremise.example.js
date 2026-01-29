/**
 * Ejemplo de script que se ejecuta cuando se llama a POST /save-json con script_path.
 * Copia este archivo a call-onpremise.js y configura la URL y el body de tu API on-premise.
 *
 * Uso en el body de /save-json:
 *   "script_path": "scripts/call-onpremise.js"
 */

const https = require('https');
const http = require('http');

const ONPREMISE_API_URL = process.env.ONPREMISE_API_URL || 'https://tu-servidor-onpremise.com/api/endpoint';
const ONPREMISE_TOKEN = process.env.ONPREMISE_TOKEN || '';

async function callOnPremiseAPI() {
  const url = new URL(ONPREMISE_API_URL);
  const isHttps = url.protocol === 'https:';
  const body = JSON.stringify({
    timestamp: new Date().toISOString(),
    source: 'save-json-api-ec2'
  });

  const options = {
    hostname: url.hostname,
    port: url.port || (isHttps ? 443 : 80),
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  if (ONPREMISE_TOKEN) {
    options.headers['Authorization'] = 'Bearer ' + ONPREMISE_TOKEN;
  }

  if (isHttps) {
    options.rejectUnauthorized = false; // para certificados autofirmados
  }

  const lib = isHttps ? https : http;

  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        console.log('Status:', res.statusCode);
        console.log('Response:', data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve({ status: res.statusCode, data });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
    req.write(body);
    req.end();
  });
}

callOnPremiseAPI()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });

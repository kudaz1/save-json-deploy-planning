/**
 * Prueba local de POST /save-json.
 * Uso: node probar-save-json-local.js
 * Requiere: servidor corriendo (npm start en otra terminal).
 */
const http = require('http');

const PORT = process.env.PORT || 3000;
const HOST = 'localhost';

const body = JSON.stringify({
  ambiente: 'QA',
  token: 'token-ejemplo',
  filename: 'test-local-' + Date.now(),
  jsonData: '{"GENER_TEST={Type=SimpleFolder, CC1040P2={RerunLimit={Every=0}, JobAFT={Y=1}}}}',
});

const options = {
  hostname: HOST,
  port: PORT,
  path: '/save-json',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => (data += chunk));
  res.on('end', () => {
    console.log('Status:', res.statusCode);
    console.log('Response:', data);
    try {
      const j = JSON.parse(data);
      if (j.filePath) console.log('Archivo guardado en:', j.filePath);
      if (j.error) console.error('Error:', j.error);
    } catch (_) {}
  });
});

req.on('error', (e) => {
  console.error('Error de conexión:', e.message);
  console.log('¿Está el servidor corriendo? Ejecuta en otra terminal: npm start');
});

req.write(body);
req.end();

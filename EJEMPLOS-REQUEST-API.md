# Ejemplos de Request a la API

## 📋 Endpoint: POST /save-json

Este endpoint guarda el archivo JSON y **automáticamente ejecuta Control-M** si se proporciona el campo `controlm_api`.

---

## 🔧 Campos del Request

### Campos Requeridos:
- `ambiente` (string): Solo acepta `"DEV"` o `"QA"`
- `token` (string): Tu Bearer Token para autenticación
- `filename` (string): Nombre del archivo (sin extensión .json)
- `jsonData` (object): El JSON que quieres guardar

### Campos Opcionales:
- `controlm_api` (string): URL de la API de Control-M. Si se proporciona, ejecutará automáticamente Control-M después de guardar.
- `script_path` (string): Ruta del script a ejecutar después de guardar (y Control-M si aplica). Debe estar dentro de la carpeta `scripts/` del proyecto (ej: `scripts/call-onpremise.js`). Soporta `.js` (Node) y `.sh` (Bash).

---

## 📝 Ejemplo 1: Con cURL (Terminal)

```bash
curl -X POST https://save-json-deploy-planning-production.up.railway.app/save-json \
  -H "Content-Type: application/json" \
  -d '{
    "ambiente": "DEV",
    "token": "tu-bearer-token-aqui",
    "filename": "BORRA-GUI-DESARROLLO_hold_deploy",
    "controlm_api": "https://10.20.74.53:8446/automation-api/deploy",
    "jsonData": {
      "BORRA-GUI-DESARROLLO_hold_deploy": {
        "Type": "SimpleFolder",
        "ControlmServer": "COOPEUCH",
        "OrderMethod": "Manual"
      }
    }
  }'
```

---

## 📝 Ejemplo 2: Con Postman

### Configuración en Postman:

1. **Método:** `POST`
2. **URL:** `https://save-json-deploy-planning-production.up.railway.app/save-json`
3. **Headers:**
   - `Content-Type: application/json`
4. **Body (raw JSON):**
```json
{
  "ambiente": "DEV",
  "token": "tu-bearer-token-aqui",
  "filename": "BORRA-GUI-DESARROLLO_hold_deploy",
  "controlm_api": "https://10.20.74.53:8446/automation-api/deploy",
  "jsonData": {
    "BORRA-GUI-DESARROLLO_hold_deploy": {
      "Type": "SimpleFolder",
      "ControlmServer": "COOPEUCH",
      "OrderMethod": "Manual",
      "CC1040P2": {
        "Type": "Job:OS400:Full:CommandLine",
        "CommandLine": "CALL PGM(RBIENVFCL) PARM('CTINTDEM' 'NEXDEM')",
        "SubApplication": "BORRA-GUI-DESARROLLO_hold_deploy",
        "Priority": "Very Low",
        "FileName": "CC1040P2",
        "Confirm": true,
        "Host": "ibsqa",
        "FilePath": "CC1040P2",
        "CreatedBy": "emuser",
        "Description": "NEXUS-DEMOGRAFICO",
        "RunAs": "07ABATCH",
        "Application": "BORRA-GUI-DESARROLLO_hold_deploy"
      }
    }
  }
}
```

---

## 📝 Ejemplo 3: Con JavaScript (Node.js / Axios)

```javascript
const axios = require('axios');

async function guardarYEjecutarControlM() {
  try {
    const apiUrl = 'https://save-json-deploy-planning-production.up.railway.app/save-json';
    
    const requestData = {
      ambiente: 'DEV',
      token: 'tu-bearer-token-aqui',
      filename: 'BORRA-GUI-DESARROLLO_hold_deploy',
      controlm_api: 'https://10.20.74.53:8446/automation-api/deploy',
      jsonData: {
        "BORRA-GUI-DESARROLLO_hold_deploy": {
          "Type": "SimpleFolder",
          "ControlmServer": "COOPEUCH",
          "OrderMethod": "Manual",
          "CC1040P2": {
            "Type": "Job:OS400:Full:CommandLine",
            "CommandLine": "CALL PGM(RBIENVFCL) PARM('CTINTDEM' 'NEXDEM')",
            "SubApplication": "BORRA-GUI-DESARROLLO_hold_deploy",
            "Priority": "Very Low",
            "FileName": "CC1040P2",
            "Confirm": true,
            "Host": "ibsqa",
            "FilePath": "CC1040P2",
            "CreatedBy": "emuser",
            "Description": "NEXUS-DEMOGRAFICO",
            "RunAs": "07ABATCH",
            "Application": "BORRA-GUI-DESARROLLO_hold_deploy"
          }
        }
      }
    };

    console.log('🚀 Enviando request a la API...');
    const response = await axios.post(apiUrl, requestData, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    console.log('✅ Respuesta exitosa:');
    console.log(JSON.stringify(response.data, null, 2));
    
    // Si se ejecutó Control-M, verificar el resultado
    if (response.data.controlMResult) {
      if (response.data.controlMResult.success) {
        console.log('✅ Control-M ejecutado exitosamente');
      } else {
        console.log('❌ Control-M falló:', response.data.controlMResult.error);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

// Ejecutar
guardarYEjecutarControlM();
```

---

## 📝 Ejemplo 4: Con Python (requests)

```python
import requests
import json

def guardar_y_ejecutar_controlm():
    api_url = 'https://save-json-deploy-planning-production.up.railway.app/save-json'
    
    request_data = {
        'ambiente': 'DEV',
        'token': 'tu-bearer-token-aqui',
        'filename': 'BORRA-GUI-DESARROLLO_hold_deploy',
        'controlm_api': 'https://10.20.74.53:8446/automation-api/deploy',
        'jsonData': {
            'BORRA-GUI-DESARROLLO_hold_deploy': {
                'Type': 'SimpleFolder',
                'ControlmServer': 'COOPEUCH',
                'OrderMethod': 'Manual',
                'CC1040P2': {
                    'Type': 'Job:OS400:Full:CommandLine',
                    'CommandLine': "CALL PGM(RBIENVFCL) PARM('CTINTDEM' 'NEXDEM')",
                    'SubApplication': 'BORRA-GUI-DESARROLLO_hold_deploy',
                    'Priority': 'Very Low',
                    'FileName': 'CC1040P2',
                    'Confirm': True,
                    'Host': 'ibsqa',
                    'FilePath': 'CC1040P2',
                    'CreatedBy': 'emuser',
                    'Description': 'NEXUS-DEMOGRAFICO',
                    'RunAs': '07ABATCH',
                    'Application': 'BORRA-GUI-DESARROLLO_hold_deploy'
                }
            }
        }
    }
    
    headers = {
        'Content-Type': 'application/json'
    }
    
    try:
        print('🚀 Enviando request a la API...')
        response = requests.post(api_url, json=request_data, headers=headers)
        response.raise_for_status()
        
        print('✅ Respuesta exitosa:')
        print(json.dumps(response.json(), indent=2))
        
        # Si se ejecutó Control-M, verificar el resultado
        if 'controlMResult' in response.json():
            if response.json()['controlMResult']['success']:
                print('✅ Control-M ejecutado exitosamente')
            else:
                print('❌ Control-M falló:', response.json()['controlMResult']['error'])
                
    except requests.exceptions.RequestException as e:
        print(f'❌ Error: {e}')
        if hasattr(e, 'response') and e.response is not None:
            print(f'Respuesta: {e.response.text}')

# Ejecutar
guardar_y_ejecutar_controlm()
```

---

## 📝 Ejemplo 5: Solo Guardar (sin ejecutar Control-M)

Si solo quieres guardar el archivo sin ejecutar Control-M, simplemente **omite el campo `controlm_api`**:

```json
{
  "ambiente": "DEV",
  "token": "tu-bearer-token-aqui",
  "filename": "mi-archivo",
  "jsonData": {
    "mi-job": {
      "Type": "SimpleFolder",
      "ControlmServer": "COOPEUCH"
    }
  }
}
```

---

## 📥 Respuesta Exitosa

### Cuando se guarda y ejecuta Control-M:

```json
{
  "success": true,
  "message": "Archivo guardado exitosamente y Control-M ejecutado",
  "filename": "BORRA-GUI-DESARROLLO_hold_deploy.json",
  "filePath": "/root/Desktop/jsonControlm/BORRA-GUI-DESARROLLO_hold_deploy.json",
  "storagePath": "/root/Desktop/jsonControlm",
  "fileSize": 1234,
  "ambiente": "DEV",
  "verified": true,
  "controlMResult": {
    "success": true,
    "status": 200,
    "data": { ... },
    "filePath": "/root/Desktop/jsonControlm/BORRA-GUI-DESARROLLO_hold_deploy.json",
    "message": "API de Control-M ejecutada exitosamente"
  }
}
```

### Cuando solo se guarda (sin controlm_api):

```json
{
  "success": true,
  "message": "Archivo guardado exitosamente",
  "filename": "mi-archivo.json",
  "filePath": "/root/Desktop/jsonControlm/mi-archivo.json",
  "storagePath": "/root/Desktop/jsonControlm",
  "fileSize": 1234,
  "ambiente": "DEV",
  "verified": true
}
```

---

## ⚠️ Errores Comunes

### Error 400: Faltan campos requeridos
```json
{
  "success": false,
  "error": "Se requieren los campos \"ambiente\", \"token\", \"filename\" y \"jsonData\""
}
```

### Error 400: controlm_api inválido
```json
{
  "success": false,
  "error": "El campo \"controlm_api\" debe ser una URL válida (ej: https://controlms1de01:8446/automation-api/deploy)"
}
```

### Error 400: Ambiente inválido
```json
{
  "success": false,
  "error": "El campo \"ambiente\" solo puede tener los valores \"DEV\" o \"QA\""
}
```

---

## 🔍 Cómo Funciona

1. **Recibe el request** con `jsonData`, `filename`, `token`, `ambiente` y opcionalmente `controlm_api`
2. **Guarda el archivo JSON** en `~/Desktop/jsonControlm/` dentro del servidor
3. **Si se proporciona `controlm_api`**:
   - Lee el archivo JSON guardado
   - Crea un `form-data` con el campo `definitionsFile`
   - Envía el archivo como `multipart/form-data` a la URL de `controlm_api`
   - Usa autenticación Bearer Token: `Authorization: Bearer {token}`
   - Hace POST a la URL especificada
4. **Responde** con el resultado de ambos procesos

---

## 📌 Notas Importantes

- El campo `filename` no debe incluir la extensión `.json` (se agrega automáticamente)
- El campo `controlm_api` debe ser una URL completa que empiece con `http://` o `https://`
- El token se usa tanto para la autenticación de tu API como para la autenticación de Control-M
- Si `controlm_api` no se proporciona, solo se guarda el archivo sin ejecutar Control-M
- Si `script_path` se proporciona, se ejecuta el script (dentro de `scripts/`) después de guardar; útil para llamar a una API on-premise u otras tareas
- Los archivos se guardan en el servidor (EC2/Railway), no en tu computadora local

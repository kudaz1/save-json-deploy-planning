# Scripts ejecutados desde POST /save-json

Cuando envías `script_path` en el body de `/save-json`, la API ejecuta ese script después de guardar el archivo (y después de llamar a Control-M si envías `controlm_api`).

---

## Qué debe tener un script para llamar a la API de Control-M Automation

El script debe llamar a **automation-api/deploy** usando **form-data**:

| Requisito | Valor |
|-----------|--------|
| **Endpoint** | `automation-api/deploy` (URL completa ej: `https://10.20.74.53:8446/automation-api/deploy`) |
| **Método** | `POST` |
| **Body** | `multipart/form-data` |
| **Form key** | `definitionsFile` |
| **Form value** | Archivo JSON **cargado desde la ruta donde se guardó el JSON** (no la ruta como texto, sino el contenido del archivo) |
| **Header** | `Authorization: Bearer {token}` |
| **HTTPS** | Si usas IP privada o certificado autofirmado: `rejectUnauthorized: false` |

### Ejemplo mínimo (Node.js)

1. Leer el archivo JSON desde la ruta donde quedó guardado (ej: la que te pasa la API en `CONTROLM_FILE_PATH`).
2. Crear un `FormData`, key **`definitionsFile`**, value = **archivo cargado desde esa ruta** (stream o buffer).
3. POST a la URL de Control-M con header `Authorization: Bearer {token}`.
4. Si es HTTPS con certificado autofirmado, usar agente con `rejectUnauthorized: false`.

### Variables de entorno que inyecta la API al ejecutar el script

Si el script se ejecuta desde `/save-json`, la API define estas variables de entorno (puedes usarlas para no duplicar configuración):

| Variable | Descripción |
|----------|-------------|
| `CONTROLM_API_URL` | URL de Control-M (valor de `controlm_api` del request) |
| `CONTROLM_TOKEN` | Bearer token |
| `CONTROLM_FILE_PATH` | Ruta completa del archivo JSON guardado (el que debes enviar como `definitionsFile`) |
| `CONTROLM_FILENAME` | Nombre del archivo (ej: `mi-archivo.json`) |

Así el script puede llamar a Control-M usando el mismo archivo que se acaba de guardar y el mismo token/URL del request.

---

## Script incluido: `call-controlm-automation.js`

Hace exactamente lo anterior: lee `CONTROLM_API_URL`, `CONTROLM_TOKEN` y `CONTROLM_FILE_PATH`, y hace POST a Control-M con el archivo en `definitionsFile` y Bearer token.

**Uso en el body de `/save-json`:**

```json
{
  "ambiente": "DEV",
  "token": "tu-bearer-token",
  "filename": "mi-archivo",
  "controlm_api": "https://10.20.74.53:8446/automation-api/deploy",
  "script_path": "scripts/call-controlm-automation.js",
  "jsonData": { ... }
}
```

- La API guarda el JSON, llama a Control-M (por el campo `controlm_api`) y además ejecuta el script.
- El script puede usarse para una **segunda llamada** a Control-M u otra URL (si cambias la lógica para usar otra variable de entorno).

Si quieres que **solo** el script llame a Control-M (y no la API), envía `script_path` y **no** envíes `controlm_api`; entonces solo se guarda el archivo y se ejecuta el script (el script debe usar `CONTROLM_FILE_PATH` y configurar su propia URL/token o leerlas de otro lado).

---

## Otros scripts

- **`call-onpremise.example.js`**: plantilla para llamar a una API on-premise genérica (POST JSON). Cópialo y adapta URL y body.
- Los scripts deben estar en esta carpeta `scripts/` (la API solo ejecuta rutas bajo `scripts/`).

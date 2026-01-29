# Qué necesitas en EC2 para que todo funcione

Guía de lo que debes tener instalado y configurado en la instancia EC2 para que la API save-json, Control-M y el script funcionen.

---

## 1. Requisitos en la EC2

### Instalar en la EC2

| Requisito | Versión sugerida | Cómo instalar (Linux) |
|-----------|------------------|------------------------|
| **Node.js** | 18.x o 20.x | `curl -fsSL https://deb.nodesource.com/setup_20.x \| sudo -E bash -` y luego `sudo apt install -y nodejs` |
| **npm** | Viene con Node | Se instala con Node.js |
| **Git** | Cualquiera reciente | `sudo apt install -y git` (Ubuntu/Debian) o `sudo yum install -y git` (Amazon Linux) |

Comprobar:

```bash
node -v   # ej: v20.x.x
npm -v    # ej: 10.x.x
git --version
```

---

## 2. Proyecto en la EC2

### Ruta del proyecto en EC2

En esta guía se usa la ruta donde ya tienes la API:

```bash
cd /apis/save-json-deploy-planning
```

(Si en tu caso clonaste en otro sitio, sustituye por tu ruta, ej: `/home/ec2-user/save-json-deploy-planning`.)

### Opción A: Clonar desde GitHub (si aún no está)

```bash
sudo mkdir -p /apis
cd /apis
git clone https://github.com/kudaz1/save-json-deploy-planning.git
cd save-json-deploy-planning
```

### Opción B: Subir el proyecto (ZIP / rsync / SCP)

Si no usas Git, copia la carpeta del proyecto a la EC2 en `/apis/save-json-deploy-planning` (incluyendo `server.js`, `package.json`, `scripts/`, etc.).

### Instalar dependencias del proyecto

```bash
cd /apis/save-json-deploy-planning
npm install
```

Esto crea `node_modules/` con: express, cors, axios, form-data.

---

## 3. Estructura que debe existir en EC2

En la raíz del proyecto (`/apis/save-json-deploy-planning/`) debe haber:

```
/apis/save-json-deploy-planning/
├── server.js
├── package.json
├── node_modules/          ← se crea con npm install
└── scripts/
    ├── call-controlm-automation.js   ← script que llama a automation-api/deploy
    └── (otros .js o .sh si los usas)
```

- La carpeta **`scripts/`** la crea la API si no existe; igualmente conviene tener ya el script **`scripts/call-controlm-automation.js`** (viene en el repo).
- Los JSON guardados se escriben en **`~/Desktop/jsonControlm/`** (se crea sola al guardar el primer archivo). El `~` es el usuario con el que corre la API (ej: si corre con root, será `/root/Desktop/jsonControlm/`).

No hace falta crear nada más a mano para que la API y el script funcionen.

---

## 4. Cómo ejecutar la API en EC2

### Opción recomendada: PM2 (producción)

```bash
sudo npm install -g pm2
cd /apis/save-json-deploy-planning
pm2 start server.js --name save-json-api
pm2 save
pm2 startup   # y ejecutar el comando que te muestre para que arranque al reiniciar
```

Ver logs:

```bash
pm2 logs save-json-api
```

### Opción alternativa: Node directo

```bash
cd /apis/save-json-deploy-planning
npm start
```

(Se detiene al cerrar la sesión si no usas `nohup` o `screen`.)

### Puerto

- Por defecto la API usa el puerto **3000** (`process.env.PORT || 3000`).
- Para otro puerto en EC2: `PORT=3003 npm start` o en PM2: `pm2 start server.js --name save-json-api -- --port 3003` (o configurar `PORT` en el ecosystem de PM2).

---

## 5. Red y conectividad

Para que **todo funcione** (API + Control-M + script):

- **Quién llama a la API save-json:**  
  Tiene que poder hacer POST a la EC2 (puerto 3000 o el que uses). Si la EC2 tiene IP pública, abre ese puerto en el **Security Group** (ej: TCP 3000 desde las IPs que necesites).

- **EC2 → Control-M (automation-api/deploy):**  
  La EC2 debe poder alcanzar la URL de Control-M (ej: `https://10.20.74.53:8446`).  
  - Si Control-M está en red on‑premise: hace falta **VPN** (o **Direct Connect**) entre la VPC de AWS y tu red, o que ese host/puerto esté accesible desde internet.  
  - Si está en la misma VPC o en otra red ya enlazada, suele bastar con abrir el puerto (ej: 8446) en firewall/security group hacia la EC2.

Sin conectividad EC2 → Control-M, el guardado del JSON y la ejecución del script funcionarán, pero la llamada a automation-api/deploy fallará (timeout o conexión rechazada).

---

## 6. Qué “colocar” en EC2 (resumen)

| Qué | Dónde / Cómo |
|-----|------------------|
| Node.js + npm | Instalados en la EC2 (ver sección 1). |
| Proyecto (código) | En la EC2 en `/apis/save-json-deploy-planning`. |
| Dependencias | Dentro del proyecto: `npm install`. |
| Script de Control-M | Ya en el repo: `scripts/call-controlm-automation.js`. No hace falta “colocar” nada extra si usas ese. |
| Carpeta de JSON | Se crea sola: `~/Desktop/jsonControlm/`. |
| API en ejecución | Con `pm2 start server.js --name save-json-api` (o `npm start`). |
| Puerto abierto | Security Group: permitir TCP 3000 (o el PORT que uses) desde donde llames a la API. |
| Red a Control-M | VPN o red que permita a la EC2 llegar a la URL de automation-api/deploy. |

No necesitas instalar nada más (ni PHP, ni Python, ni servidor web aparte) para que la API save-json y el script que llama a automation-api/deploy funcionen; solo Node.js, el proyecto y la red bien configurada.

---

## 7. Probar que todo funciona

1. **API viva:**  
   `curl http://localhost:3000` (desde la EC2) o `curl http://<IP-pública-EC2>:3000` desde fuera. Debe responder JSON con info de la API.

2. **Guardar JSON y ejecutar script:**  
   Hacer un POST a `/save-json` con `script_path: "scripts/call-controlm-automation.js"` y, si aplica, `controlm_api` y `token`. Revisar en la respuesta que `scriptResult` exista y, en los logs de la API (`pm2 logs save-json-api`), que aparezca la ejecución del script y, si hay error de red, el mensaje correspondiente.

3. **Logs:**  
   `pm2 logs save-json-api` para ver peticiones, guardado de archivos, llamada a Control-M y salida del script.

Si quieres, el siguiente paso puede ser un ---

## 8. Si la respuesta no incluye controlMResult ni scriptResult

Si al hacer POST a `/save-json` con `controlm_api` y `token` la respuesta solo trae "Archivo guardado exitosamente en tu Escritorio", filePath en `/root/Desktop/controlm/` y no aparecen `controlMResult` ni `scriptResult`, en la EC2 está corriendo una versión antigua. Pasos: (1) `cd /apis/save-json-deploy-planning` y `git pull`; (2) `pm2 restart save-json-api`; (3) ejecutar de nuevo el curl y en otra terminal `pm2 logs save-json-api --lines 200` — debe aparecer `[VERSION] 2025-01-with-controlm-and-script`. Con la versión correcta la respuesta incluye controlMResult, scriptResult y filePath en ~/Desktop/jsonControlm/.

---

checklist tipo “paso a paso en 5 minutos” solo con los comandos a copiar/pegar en la EC2.

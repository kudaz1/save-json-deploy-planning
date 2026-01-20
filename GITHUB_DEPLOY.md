# Instrucciones para Desplegar en GitHub

## Archivos que se subirán al repositorio

### Archivos principales (OBLIGATORIOS)
- ✅ `server.js` - Servidor principal de la API
- ✅ `package.json` - Dependencias y scripts
- ✅ `package-lock.json` - Lock de versiones de dependencias
- ✅ `README.md` - Documentación principal
- ✅ `.gitignore` - Archivos a ignorar
- ✅ `DEPLOY.md` - Guía de despliegue en EC2

### Archivos opcionales (pueden subirse)
- `client-control-m.js` - Cliente Node.js para Control-M
- `client-control-m.py` - Cliente Python para Control-M
- `usar-api.js` - Ejemplo de uso de la API
- Otros archivos de ejemplo/clientes

### Archivos que NO se suben (están en .gitignore)
- ❌ `node_modules/` - Dependencias (se instalan con npm install)
- ❌ `/Desktop/` - Carpeta de almacenamiento en EC2
- ❌ `*.json` - Archivos JSON guardados (excepto package.json)
- ❌ `.env` - Variables de entorno
- ❌ `*.log` - Archivos de log

## Pasos para subir a GitHub

### 1. Verificar que estás en el directorio correcto

```bash
cd save-json-deploy-planning
```

### 2. Inicializar Git (si no está inicializado)

```bash
git init
```

### 3. Agregar el repositorio remoto

```bash
git remote add origin https://github.com/kudaz1/save-json.git
```

O si ya existe:
```bash
git remote set-url origin https://github.com/kudaz1/save-json.git
```

### 4. Verificar estado

```bash
git status
```

### 5. Agregar archivos

```bash
# Agregar todos los archivos (respetando .gitignore)
git add .

# O agregar archivos específicos
git add server.js package.json package-lock.json README.md .gitignore DEPLOY.md
```

### 6. Hacer commit

```bash
git commit -m "feat: API para guardar JSON en EC2 y ejecutar Control-M

- Guarda archivos JSON en /Desktop/jsonControlm
- Ejecuta Control-M API usando archivos guardados
- Endpoints: /save-json, /execute-controlm, /save-and-execute
- Optimizado para instancias EC2"
```

### 7. Subir a GitHub

```bash
# Si es la primera vez
git push -u origin main

# O si la rama se llama master
git branch -M main
git push -u origin main

# Para actualizaciones futuras
git push origin main
```

## Verificar que se subió correctamente

1. Ve a https://github.com/kudaz1/save-json
2. Verifica que aparezcan los archivos:
   - `server.js`
   - `package.json`
   - `README.md`
   - `.gitignore`
   - `DEPLOY.md`

## Actualizaciones futuras

Cuando hagas cambios:

```bash
git add .
git commit -m "Descripción de los cambios"
git push origin main
```

## Notas importantes

- ⚠️ **NO subas** archivos con tokens o credenciales
- ⚠️ **NO subas** la carpeta `node_modules`
- ⚠️ **NO subas** archivos JSON guardados
- ✅ **SÍ sube** `package.json` y `package-lock.json`
- ✅ **SÍ sube** el código fuente (`server.js`)
- ✅ **SÍ sube** la documentación (`README.md`, `DEPLOY.md`)

# Guía de Despliegue en EC2

Esta guía te ayudará a desplegar la API en una instancia EC2 de AWS.

## Prerrequisitos

- Instancia EC2 con Ubuntu/Amazon Linux
- Node.js 14+ instalado
- Acceso SSH a la instancia EC2
- Permisos para crear carpetas en `/Desktop` (opcional, la API tiene fallback)

## Pasos de Despliegue

### 1. Conectar a la instancia EC2

```bash
ssh -i tu-key.pem ubuntu@tu-instancia-ec2.com
```

### 2. Instalar Node.js (si no está instalado)

Para Ubuntu/Debian:
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Para Amazon Linux:
```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
source ~/.bashrc
nvm install 18
nvm use 18
```

### 3. Clonar el repositorio

```bash
cd ~
git clone https://github.com/kudaz1/save-json.git
cd save-json
```

### 4. Instalar dependencias

```bash
npm install
```

### 5. La carpeta de almacenamiento se crea automáticamente

La API creará automáticamente la carpeta `~/Desktop/jsonControlm` al iniciar. 
- Para usuario root: `/root/Desktop/jsonControlm`
- Para otros usuarios: `/home/usuario/Desktop/jsonControlm`

No es necesario crearla manualmente.

### 6. Configurar variables de entorno (opcional)

```bash
# Crear archivo .env
nano .env
```

Agregar:
```
PORT=3000
NODE_ENV=production
```

### 7. Iniciar el servidor

#### Opción A: Ejecución directa (para pruebas)

```bash
npm start
```

#### Opción B: Usando PM2 (recomendado para producción)

```bash
# Instalar PM2 globalmente
sudo npm install -g pm2

# Iniciar la aplicación
pm2 start server.js --name save-json-api

# Guardar configuración de PM2
pm2 save

# Configurar PM2 para iniciar al arrancar el sistema
pm2 startup
# Seguir las instrucciones que aparecen en pantalla
```

#### Opción C: Usando systemd (alternativa a PM2)

Crear archivo de servicio:
```bash
sudo nano /etc/systemd/system/save-json-api.service
```

Contenido:
```ini
[Unit]
Description=Save JSON API
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/save-json
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Activar el servicio:
```bash
sudo systemctl daemon-reload
sudo systemctl enable save-json-api
sudo systemctl start save-json-api
sudo systemctl status save-json-api
```

### 8. Configurar firewall (Security Group en EC2)

Asegúrate de que el Security Group de tu instancia EC2 permita tráfico en el puerto 3000:

1. Ve a la consola de AWS EC2
2. Selecciona tu instancia
3. Ve a "Security" → "Security groups"
4. Edita las reglas de entrada (Inbound rules)
5. Agrega una regla:
   - Type: Custom TCP
   - Port: 3000
   - Source: Tu IP o 0.0.0.0/0 (solo para desarrollo)

### 9. Verificar que funciona

```bash
# Desde tu máquina local
curl http://tu-ip-ec2:3000/

# O desde la instancia EC2
curl http://localhost:3000/
```

### 10. Verificar diagnóstico

```bash
curl http://tu-ip-ec2:3000/diagnostic
```

## Comandos Útiles

### Ver logs con PM2

```bash
pm2 logs save-json-api
pm2 monit
```

### Reiniciar la aplicación

```bash
pm2 restart save-json-api
```

### Detener la aplicación

```bash
pm2 stop save-json-api
```

### Ver estado

```bash
pm2 status
```

### Con systemd

```bash
sudo systemctl restart save-json-api
sudo systemctl stop save-json-api
sudo systemctl status save-json-api
sudo journalctl -u save-json-api -f
```

## Actualizar la Aplicación

```bash
cd ~/save-json
git pull origin main
npm install
pm2 restart save-json-api
```

## Solución de Problemas

### Verificar la ruta de almacenamiento

La API usa `~/Desktop/jsonControlm` que se expande según el usuario:
- Usuario root: `/root/Desktop/jsonControlm`
- Otros usuarios: `/home/usuario/Desktop/jsonControlm`

Puedes verificar la ruta exacta usando el endpoint `/diagnostic`.

### Error: "Port 3000 already in use"

Cambia el puerto en el archivo `.env` o en la variable de entorno:
```bash
export PORT=3001
```

### Verificar que Node.js está instalado

```bash
node --version
npm --version
```

### Verificar permisos de la carpeta

```bash
# Para usuario root
ls -la /root/Desktop/jsonControlm

# Para otros usuarios
ls -la ~/Desktop/jsonControlm
```

## Seguridad

- **No expongas el puerto 3000 públicamente** en producción sin autenticación
- Usa un **reverse proxy** (nginx) con SSL/TLS
- Considera usar **AWS Application Load Balancer** con certificados SSL
- Implementa **autenticación** en los endpoints si es necesario

## Ejemplo de configuración con Nginx (opcional)

```nginx
server {
    listen 80;
    server_name tu-dominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

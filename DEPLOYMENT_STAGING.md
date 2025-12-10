# Staging Deployment Guide - EMSG

## Übersicht
Diese Anleitung beschreibt das Deployment der EMSG-Anwendung auf einem Staging-Server.

## Voraussetzungen

### Server
- Ubuntu 22.04 LTS oder neuer
- Root/Sudo-Zugriff
- Mindestens 2 GB RAM
- 20 GB freier Speicher
- Öffentliche IP-Adresse

### Lokale Tools
- SSH-Client
- Git
- Docker & Docker Compose (lokal zum Testen)

### Domain & DNS
- Subdomain konfiguriert (z.B. `staging.emsg.example.com`)
- DNS A-Record zeigt auf Server-IP

## Setup-Schritte

### 1. Server vorbereiten

```bash
# SSH zum Server
ssh user@your-staging-server

# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Docker Compose installieren (V2)
sudo apt install docker-compose-plugin -y

# Logout und erneut einloggen für Docker-Gruppe
exit
ssh user@your-staging-server

# Testen
docker --version
docker compose version
```

### 2. Repository klonen

```bash
# Git installieren (falls nicht vorhanden)
sudo apt install git -y

# Deployment-Verzeichnis erstellen
mkdir -p ~/apps
cd ~/apps

# Repository klonen
git clone https://github.com/MatthiasHertel21/energy-game.git emsg-staging
cd emsg-staging

# Auf feature/catalog-campaigns Branch wechseln
git checkout feature/catalog-campaigns
```

### 3. Environment-Konfiguration

```bash
# .env Datei erstellen
cat > .env << 'EOF'
# Database
POSTGRES_USER=emsg_staging
POSTGRES_PASSWORD=<STARKES_PASSWORT_GENERIEREN>
POSTGRES_DB=emsg_staging
DATABASE_URL=postgresql://emsg_staging:<PASSWORT>@postgres:5432/emsg_staging

# Redis
REDIS_URL=redis://redis:6379/0

# JWT Secret (generieren mit: openssl rand -hex 32)
JWT_SECRET_KEY=<GENERIERTER_KEY>

# Flask
FLASK_ENV=production
FLASK_DEBUG=0

# Limits
MAX_USERS=1000
MAX_COHORTS=100

# SMTP (optional - für E-Mail-Invites)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@staging.emsg.example.com

# Cors Origins (Frontend-URL)
CORS_ORIGINS=https://staging.emsg.example.com
EOF

# Passwörter und Keys generieren
echo "POSTGRES_PASSWORD=$(openssl rand -base64 32)"
echo "JWT_SECRET_KEY=$(openssl rand -hex 32)"
```

### 4. Docker Compose für Staging anpassen

```bash
# Backup der Original-Datei
cp docker-compose.yml docker-compose.yml.dev

# Staging-spezifische Anpassungen
cat > docker-compose.staging.yml << 'EOF'
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
    networks:
      - emsg-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    networks:
      - emsg-network
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET_KEY: ${JWT_SECRET_KEY}
      FLASK_ENV: production
      MAX_USERS: ${MAX_USERS:-1000}
      MAX_COHORTS: ${MAX_COHORTS:-100}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_PORT: ${SMTP_PORT}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASSWORD: ${SMTP_PASSWORD}
      SMTP_FROM: ${SMTP_FROM}
    volumes:
      - ./uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    networks:
      - emsg-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "80:80"
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - emsg-network

volumes:
  postgres_data:

networks:
  emsg-network:
    driver: bridge
EOF
```

### 5. Nginx Reverse Proxy (mit SSL)

```bash
# Nginx installieren
sudo apt install nginx certbot python3-certbot-nginx -y

# Nginx-Konfiguration für Staging
sudo cat > /etc/nginx/sites-available/emsg-staging << 'EOF'
server {
    listen 80;
    server_name staging.emsg.example.com;

    # Certbot Challenge
    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    # Redirect to HTTPS
    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name staging.emsg.example.com;

    # SSL Certificates (werden von Certbot generiert)
    ssl_certificate /etc/letsencrypt/live/staging.emsg.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/staging.emsg.example.com/privkey.pem;

    # SSL Settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Max upload size
    client_max_body_size 10M;

    # Frontend (React App)
    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeout für lange Requests
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

    # WebSocket
    location /socket.io {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

# Symlink erstellen
sudo ln -s /etc/nginx/sites-available/emsg-staging /etc/nginx/sites-enabled/

# Default-Site deaktivieren (optional)
sudo rm /etc/nginx/sites-enabled/default

# Nginx-Konfiguration testen
sudo nginx -t

# Nginx neu starten
sudo systemctl restart nginx
```

### 6. SSL-Zertifikat mit Let's Encrypt

```bash
# Certbot ausführen
sudo certbot --nginx -d staging.emsg.example.com

# Automatische Erneuerung testen
sudo certbot renew --dry-run
```

### 7. Application deployen

```bash
cd ~/apps/emsg-staging

# Images bauen und Container starten
docker compose -f docker-compose.staging.yml up -d --build

# Logs prüfen
docker compose -f docker-compose.staging.yml logs -f

# Health Check
curl http://localhost:5000/api/health
```

### 8. Initial Admin User erstellen

```bash
# In Backend-Container
docker compose -f docker-compose.staging.yml exec backend python

# Im Python-Shell:
from app import create_app, db
from app.models import User, Role
from app.extensions import bcrypt

app = create_app()
with app.app_context():
    # Admin erstellen
    admin = User(
        email='admin@example.com',
        password_hash=bcrypt.generate_password_hash('SICHERES_PASSWORT').decode('utf-8'),
        role=Role.admin
    )
    db.session.add(admin)
    db.session.commit()
    print(f'Admin created: {admin.email}')
    exit()
```

### 9. Firewall konfigurieren

```bash
# UFW installieren (falls nicht vorhanden)
sudo apt install ufw -y

# Regeln setzen
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS

# Firewall aktivieren
sudo ufw enable
sudo ufw status
```

### 10. Backup-Script einrichten

```bash
# Backup-Verzeichnis
sudo mkdir -p /var/backups/emsg

# Backup-Script erstellen
sudo cat > /usr/local/bin/backup-emsg.sh << 'EOF'
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/var/backups/emsg"
APP_DIR="/home/$(whoami)/apps/emsg-staging"

# Database Backup
cd $APP_DIR
docker compose -f docker-compose.staging.yml exec -T postgres pg_dump -U emsg_staging emsg_staging > "$BACKUP_DIR/db_$DATE.sql"

# Uploads Backup
tar -czf "$BACKUP_DIR/uploads_$DATE.tar.gz" -C $APP_DIR uploads/

# Alte Backups löschen (älter als 7 Tage)
find $BACKUP_DIR -type f -mtime +7 -delete

echo "Backup completed: $DATE"
EOF

sudo chmod +x /usr/local/bin/backup-emsg.sh

# Cronjob für tägliches Backup (2 Uhr nachts)
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/backup-emsg.sh >> /var/log/emsg-backup.log 2>&1") | crontab -
```

## Monitoring & Wartung

### Logs anzeigen
```bash
# Alle Services
docker compose -f docker-compose.staging.yml logs -f

# Nur Backend
docker compose -f docker-compose.staging.yml logs -f backend

# Nur Frontend
docker compose -f docker-compose.staging.yml logs -f frontend
```

### Container neustarten
```bash
docker compose -f docker-compose.staging.yml restart backend
docker compose -f docker-compose.staging.yml restart frontend
```

### Updates deployen
```bash
cd ~/apps/emsg-staging

# Code aktualisieren
git pull origin feature/catalog-campaigns

# Rebuild und Neustart
docker compose -f docker-compose.staging.yml up -d --build

# Alte Images aufräumen
docker image prune -f
```

### Datenbank-Migration
```bash
# Bei Schema-Änderungen
docker compose -f docker-compose.staging.yml exec backend flask db upgrade
```

## Smoke Tests

Nach dem Deployment sollten folgende Tests durchgeführt werden:

1. **Frontend erreichbar:** https://staging.emsg.example.com
2. **Backend Health:** https://staging.emsg.example.com/api/health
3. **Login funktioniert:** Mit Admin-Account einloggen
4. **WebSocket verbindet:** Trainer-Dashboard öffnen
5. **Campaign erstellen:** Designer-Tools testen
6. **Solo-Session starten:** Als Player eine Session durchspielen

## Troubleshooting

### Container startet nicht
```bash
docker compose -f docker-compose.staging.yml logs backend
```

### Database Connection Error
```bash
# Database Container prüfen
docker compose -f docker-compose.staging.yml exec postgres psql -U emsg_staging -d emsg_staging -c "SELECT 1"
```

### Frontend zeigt leere Seite
```bash
# Browser Console öffnen und Fehler prüfen
# Nginx Logs prüfen
sudo tail -f /var/log/nginx/error.log
```

### SSL-Probleme
```bash
sudo certbot certificates
sudo nginx -t
sudo systemctl restart nginx
```

## Sicherheit

### Best Practices
- ✅ Starke Passwörter verwenden
- ✅ JWT Secret nicht im Code
- ✅ Firewall aktiviert
- ✅ SSL/TLS für alle Verbindungen
- ✅ Regelmäßige Backups
- ✅ Logs monitoren
- ⚠️ Fail2Ban installieren (empfohlen)
- ⚠️ Automatische Updates aktivieren

### Fail2Ban (optional)
```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

## Support
Bei Problemen:
1. Logs prüfen
2. Docker Container Status: `docker compose ps`
3. System-Ressourcen: `htop` oder `docker stats`

---
**Version:** 1.0  
**Letzte Aktualisierung:** 10. Dezember 2025

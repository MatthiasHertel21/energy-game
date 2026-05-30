#!/bin/bash
set -e

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== EMSG Staging Deployment ===${NC}"
echo ""

DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"

# Server Details
SERVER="emsg.2b6.de"
USER="root"
APP_DIR="/root/apps/emsg-staging"
REMOTE="${USER}@${SERVER}"
SSH_OPTS="-o BatchMode=yes -o ConnectTimeout=8"

echo -e "${YELLOW}📋 Deployment Plan:${NC}"
echo "  Server: $SERVER"
echo "  User: $USER"
echo "  App Dir: $APP_DIR"
echo "  Branch: $DEPLOY_BRANCH"
echo ""

if ! ssh ${SSH_OPTS} ${REMOTE} 'true'; then
    echo -e "${RED}SSH key login to ${REMOTE} is not configured. Run: ssh ${REMOTE}${NC}"
    exit 1
fi

# Schritt 1: Server Setup
echo -e "${GREEN}[1/8] Server vorbereiten...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    echo "✓ System aktualisieren..."
    apt update -qq && apt upgrade -y -qq
    
    echo "✓ Docker installieren..."
    if ! command -v docker &> /dev/null; then
        curl -fsSL https://get.docker.com -o get-docker.sh
        sh get-docker.sh
        rm get-docker.sh
    fi
    
    echo "✓ Docker Compose Plugin installieren..."
    if ! docker compose version &> /dev/null; then
        apt install -y docker-compose-plugin
    fi
    
    echo "✓ Git installieren..."
    apt install -y git
    
    docker --version
    docker compose version
ENDSSH

echo -e "${GREEN}[2/8] Repository klonen...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    mkdir -p /root/apps
    cd /root/apps
    
    if [ -d "emsg-staging" ]; then
        echo "✓ Repository existiert bereits, update auf ${DEPLOY_BRANCH}..."
        cd emsg-staging
        git fetch origin ${DEPLOY_BRANCH}
        git checkout ${DEPLOY_BRANCH}
        git pull --ff-only origin ${DEPLOY_BRANCH}
    else
        echo "✓ Repository klonen..."
        git clone https://github.com/MatthiasHertel21/energy-game.git emsg-staging
        cd emsg-staging
        git checkout ${DEPLOY_BRANCH}
    fi
    
    echo "✓ Aktueller Branch: $(git branch --show-current)"
    echo "✓ Letzter Commit: $(git log -1 --oneline)"
ENDSSH

echo -e "${GREEN}[3/8] Environment-Konfiguration erstellen...${NC}"
POSTGRES_PASSWORD=$(openssl rand -base64 32)
JWT_SECRET=$(openssl rand -hex 32)

ssh ${SSH_OPTS} ${REMOTE} << ENDSSH
    set -e
    cd /root/apps/emsg-staging
    
    cat > .env << 'EOF'
# Database
POSTGRES_USER=emsg_staging
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=emsg_staging
DATABASE_URL=postgresql://emsg_staging:${POSTGRES_PASSWORD}@postgres:5432/emsg_staging

# Redis
REDIS_URL=redis://redis:6379/0

# JWT Secret
JWT_SECRET_KEY=${JWT_SECRET}

# Flask
FLASK_ENV=production
FLASK_DEBUG=0

# Limits
MAX_USERS=1000
MAX_COHORTS=100

# SMTP (optional)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@emsg.2b6.de

# CORS
CORS_ORIGINS=https://emsg.2b6.de
EOF
    
    echo "✓ .env Datei erstellt"
ENDSSH

echo -e "${GREEN}[4/8] Docker Images bauen...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    cd /root/apps/emsg-staging
    docker compose -f docker-compose.staging.yml build
ENDSSH

echo -e "${GREEN}[5/8] Container starten...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    cd /root/apps/emsg-staging
    docker compose -f docker-compose.staging.yml up -d
    
    echo "✓ Warte auf Container-Start..."
    sleep 10
    
    echo "✓ Container Status:"
    docker compose -f docker-compose.staging.yml ps
ENDSSH

echo -e "${GREEN}[6/8] Health Check...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    echo "✓ Warte auf Backend..."
    for i in {1..30}; do
        if curl -s http://localhost:5000/api/health | grep -q "ok"; then
            echo "✓ Backend ist bereit!"
            break
        fi
        echo "  Versuch $i/30..."
        sleep 2
    done
    
    curl -s http://localhost:5000/api/health || echo "⚠ Health Check fehlgeschlagen"
ENDSSH

echo -e "${GREEN}[7/8] Nginx installieren und konfigurieren...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    echo "✓ Nginx & Certbot installieren..."
    apt install -y nginx certbot python3-certbot-nginx
    
    echo "✓ Nginx-Konfiguration erstellen..."
    cat > /etc/nginx/sites-available/emsg-staging << 'EOF'
server {
    listen 80;
    server_name emsg.2b6.de;

    location /.well-known/acme-challenge/ {
        root /var/www/html;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}

server {
    listen 443 ssl http2;
    server_name emsg.2b6.de;

    ssl_certificate /etc/letsencrypt/live/emsg.2b6.de/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/emsg.2b6.de/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:80;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

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
        proxy_read_timeout 300s;
        proxy_connect_timeout 75s;
    }

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
    
    ln -sf /etc/nginx/sites-available/emsg-staging /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    nginx -t
ENDSSH

echo -e "${GREEN}[8/8] Firewall konfigurieren...${NC}"
ssh ${SSH_OPTS} ${REMOTE} << 'ENDSSH'
    set -e
    echo "✓ UFW konfigurieren..."
    ufw --force enable
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw status
ENDSSH

echo ""
echo -e "${GREEN}✅ Deployment abgeschlossen!${NC}"
echo ""
echo -e "${YELLOW}📝 Nächste Schritte für dich:${NC}"
echo ""
echo "1. DNS konfigurieren:"
echo -e "   ${GREEN}→${NC} Stelle sicher, dass emsg.2b6.de auf die Server-IP zeigt"
echo ""
echo "2. SSL-Zertifikat einrichten:"
echo -e "   ${GREEN}ssh ${REMOTE}${NC}"
echo -e "   ${GREEN}certbot --nginx -d emsg.2b6.de${NC}"
echo ""
echo "3. Admin-User erstellen:"
echo -e "   ${GREEN}ssh ${REMOTE}${NC}"
echo -e "   ${GREEN}cd /root/apps/emsg-staging${NC}"
echo -e "   ${GREEN}docker compose -f docker-compose.staging.yml exec backend python${NC}"
echo ""
echo "   Dann im Python-Shell:"
echo -e "   ${GREEN}from app import create_app, db${NC}"
echo -e "   ${GREEN}from app.models import User, Role${NC}"
echo -e "   ${GREEN}from app.extensions import bcrypt${NC}"
echo -e "   ${GREEN}app = create_app()${NC}"
echo -e "   ${GREEN}with app.app_context():${NC}"
echo -e "   ${GREEN}    admin = User(email='admin@fastbreak.one', password_hash=bcrypt.generate_password_hash('DeinPasswort').decode('utf-8'), role=Role.admin)${NC}"
echo -e "   ${GREEN}    db.session.add(admin)${NC}"
echo -e "   ${GREEN}    db.session.commit()${NC}"
echo -e "   ${GREEN}    print('Admin created!')${NC}"
echo -e "   ${GREEN}exit()${NC}"
echo ""
echo "4. Testen:"
echo -e "   ${GREEN}→${NC} http://emsg.2b6.de (wird zu HTTPS redirecten nach SSL-Setup)"
echo -e "   ${GREEN}→${NC} https://emsg.2b6.de/api/health"
echo ""
echo -e "${YELLOW}Gespeicherte Credentials:${NC}"
echo "  DB Password: ${POSTGRES_PASSWORD}"
echo "  JWT Secret: ${JWT_SECRET}"
echo -e "${RED}⚠ Speichere diese sicher!${NC}"

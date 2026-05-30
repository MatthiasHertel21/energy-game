#!/bin/bash
set -e

# EMSG Staging Deployment Script
# Version: 1.0
# Datum: 10. Dezember 2025

echo "=== EMSG Staging Deployment ==="
echo ""

# Farben für Output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Funktionen
error() {
    echo -e "${RED}ERROR: $1${NC}"
    exit 1
}

success() {
    echo -e "${GREEN}✓ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

info() {
    echo "→ $1"
}

# Checks
info "Checking prerequisites..."

# Docker installiert?
if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker first."
fi
success "Docker found"

# Docker Compose installiert?
if ! docker compose version &> /dev/null; then
    error "Docker Compose is not installed. Please install Docker Compose V2."
fi
success "Docker Compose found"

# .env existiert?
if [ ! -f .env ]; then
    warning ".env file not found"
    info "Creating .env template..."
    
    cat > .env << EOF
# Database
POSTGRES_USER=emsg_staging
POSTGRES_PASSWORD=$(openssl rand -base64 32)
POSTGRES_DB=emsg_staging
DATABASE_URL=postgresql://emsg_staging:<PASSWORT_HIER_EINFÜGEN>@postgres:5432/emsg_staging

# Redis
REDIS_URL=redis://redis:6379/0

# JWT Secret
JWT_SECRET_KEY=$(openssl rand -hex 32)

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
SMTP_FROM=noreply@staging.emsg.example.com

# CORS
CORS_ORIGINS=https://staging.emsg.example.com
EOF
    
    success ".env template created"
    warning "Please edit .env file and replace <PASSWORT_HIER_EINFÜGEN> with the generated password above!"
    echo ""
    echo "Generated passwords:"
    grep "POSTGRES_PASSWORD" .env
    echo ""
    read -p "Press Enter after you have updated the .env file..."
fi

success ".env file exists"

# Load .env
set -a
source .env
set +a

# Git Repository Status
if [ -d .git ]; then
    CURRENT_BRANCH=$(git branch --show-current)
    info "Current branch: $CURRENT_BRANCH"
    
    if [ "$CURRENT_BRANCH" != "main" ]; then
        warning "Not on main branch"
        read -p "Continue anyway? (y/n) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check for uncommitted changes
    if ! git diff-index --quiet HEAD --; then
        warning "You have uncommitted changes"
    fi
fi

# Deployment starten
echo ""
info "Starting deployment..."
echo ""

# Alte Container stoppen
if docker compose -f docker-compose.staging.yml ps -q 2>/dev/null | grep -q .; then
    info "Stopping existing containers..."
    docker compose -f docker-compose.staging.yml down
    success "Containers stopped"
fi

# Images bauen
info "Building Docker images..."
docker compose -f docker-compose.staging.yml build --no-cache

success "Images built"

# Container starten
info "Starting containers..."
docker compose -f docker-compose.staging.yml up -d

# Warten auf Backend Health Check
info "Waiting for backend to be ready..."
TIMEOUT=60
ELAPSED=0

while [ $ELAPSED -lt $TIMEOUT ]; do
    if docker compose -f docker-compose.staging.yml exec -T backend curl -f http://localhost:5000/api/health &> /dev/null; then
        success "Backend is ready"
        break
    fi
    sleep 2
    ELAPSED=$((ELAPSED + 2))
    echo -n "."
done

echo ""

if [ $ELAPSED -ge $TIMEOUT ]; then
    error "Backend failed to start within ${TIMEOUT}s. Check logs with: docker compose -f docker-compose.staging.yml logs backend"
fi

# Status anzeigen
echo ""
info "Container Status:"
docker compose -f docker-compose.staging.yml ps

# Health Checks
echo ""
info "Running health checks..."

# Backend Health
if curl -sf http://localhost:5000/api/health > /dev/null; then
    success "Backend health check passed"
else
    error "Backend health check failed"
fi

# Frontend erreichbar?
if curl -sf http://localhost:8080 > /dev/null; then
    success "Frontend is reachable"
else
    warning "Frontend might not be ready yet (this is normal)"
fi

# Database Connection
if docker compose -f docker-compose.staging.yml exec -T postgres pg_isready -U ${POSTGRES_USER} > /dev/null; then
    success "Database is ready"
else
    error "Database is not ready"
fi

# Redis Connection
if docker compose -f docker-compose.staging.yml exec -T redis redis-cli ping | grep -q PONG; then
    success "Redis is ready"
else
    error "Redis is not ready"
fi

echo ""
success "=== Deployment completed successfully ==="
echo ""
info "Next steps:"
echo "  1. Configure your reverse proxy (nginx) to point to localhost:8080"
echo "  2. Setup SSL with certbot"
echo "  3. Create initial admin user (see DEPLOYMENT_STAGING.md)"
echo "  4. Run smoke tests"
echo ""
info "Useful commands:"
echo "  - View logs: docker compose -f docker-compose.staging.yml logs -f"
echo "  - Restart: docker compose -f docker-compose.staging.yml restart"
echo "  - Stop: docker compose -f docker-compose.staging.yml down"
echo ""

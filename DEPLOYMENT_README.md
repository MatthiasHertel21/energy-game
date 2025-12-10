# EMSG - Staging Deployment Dokumentation

Diese Dokumentation enthält alle notwendigen Informationen für das Deployment der EMSG-Anwendung auf einen Staging-Server.

## 📋 Dokumentation Übersicht

### 1. [STAGING_READINESS.md](STAGING_READINESS.md)
**Zweck:** Quality Check und Statusbericht  
**Inhalt:**
- Technischer Stack
- Implementierte Features
- Bekannte Probleme
- Datenbank-Schema
- Nächste Schritte

**Wann lesen:** Vor dem Deployment, um den aktuellen Stand zu verstehen

---

### 2. [DEPLOYMENT_STAGING.md](DEPLOYMENT_STAGING.md)
**Zweck:** Schritt-für-Schritt Deployment-Guide  
**Inhalt:**
- Server-Setup
- Repository-Konfiguration
- Docker Compose
- Nginx Reverse Proxy
- SSL-Konfiguration
- Monitoring & Wartung
- Troubleshooting

**Wann lesen:** Während des Deployments, als Hauptanleitung

---

### 3. [STAGING_CHECKLIST.md](STAGING_CHECKLIST.md)
**Zweck:** Deployment-Checkliste zum Abhaken  
**Inhalt:**
- Pre-Deployment Tasks
- Server Setup
- Deployment Steps
- Post-Deployment Tests
- Rollback Plan

**Wann nutzen:** Als Checkliste während und nach dem Deployment

---

### 4. [docker-compose.staging.yml](docker-compose.staging.yml)
**Zweck:** Production-ready Docker Compose Konfiguration  
**Features:**
- Health Checks für alle Services
- Restart Policies
- Production Environment Variables
- Volume Persistence

**Wann nutzen:** Für den tatsächlichen Deployment-Befehl

---

### 5. [deploy-staging.sh](deploy-staging.sh)
**Zweck:** Automatisiertes Deployment-Script  
**Features:**
- Prerequisite Checks
- .env Template Generierung
- Automatisches Build & Start
- Health Checks
- Status Report

**Wann nutzen:** Für automatisiertes Deployment (empfohlen für Updates)

---

## 🚀 Quick Start

### Lokales Testing
```bash
# Repository klonen
git clone https://github.com/MatthiasHertel21/energy-game.git
cd energy-game
git checkout feature/catalog-campaigns

# Mit Staging-Compose testen (lokal)
./deploy-staging.sh
```

### Server Deployment

**Vorbereitung:**
1. Server mit Ubuntu 22.04+ bereitstellen
2. Domain konfigurieren (z.B. `staging.emsg.example.com`)
3. SSH-Zugriff sicherstellen

**Deployment:**
```bash
# Auf Server einloggen
ssh user@your-staging-server

# Repository klonen
git clone https://github.com/MatthiasHertel21/energy-game.git ~/apps/emsg-staging
cd ~/apps/emsg-staging
git checkout feature/catalog-campaigns

# Deployment-Script ausführen
./deploy-staging.sh

# Folge DEPLOYMENT_STAGING.md für Nginx & SSL Setup
```

**Post-Deployment:**
- Nginx als Reverse Proxy konfigurieren
- SSL-Zertifikat mit Certbot einrichten
- Admin-User erstellen
- Smoke Tests durchführen

---

## 📊 Deployment Flow

```
┌─────────────────────────────────────────────────┐
│  1. STAGING_READINESS.md lesen                 │
│     → Aktuellen Stand verstehen                 │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  2. STAGING_CHECKLIST.md öffnen                │
│     → Checkliste zum Abhaken bereit haben       │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  3. DEPLOYMENT_STAGING.md folgen               │
│     → Schritt-für-Schritt Server einrichten     │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  4. deploy-staging.sh ausführen                │
│     → Automatisches Build & Deploy              │
└──────────────────┬──────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────┐
│  5. Smoke Tests durchführen                    │
│     → Funktionalität verifizieren               │
└─────────────────────────────────────────────────┘
```

---

## 🔧 Troubleshooting

### Container startet nicht
```bash
# Logs prüfen
docker compose -f docker-compose.staging.yml logs backend

# Container-Status
docker compose -f docker-compose.staging.yml ps

# Health Check manuell
curl http://localhost:5000/api/health
```

### Database Connection Error
```bash
# PostgreSQL Status prüfen
docker compose -f docker-compose.staging.yml exec postgres pg_isready

# Connection Test
docker compose -f docker-compose.staging.yml exec postgres psql -U emsg_staging -d emsg_staging -c "SELECT 1"
```

### SSL-Probleme
```bash
# Zertifikat Status
sudo certbot certificates

# Nginx Config testen
sudo nginx -t

# Nginx neu laden
sudo systemctl reload nginx
```

---

## 🔐 Sicherheit

### Wichtige Punkte
- ✅ Niemals `.env` Datei committen
- ✅ Starke Passwörter generieren (`openssl rand -base64 32`)
- ✅ JWT Secret sicher generieren (`openssl rand -hex 32`)
- ✅ Firewall aktivieren (nur Port 22, 80, 443)
- ✅ SSL/TLS verwenden (Let's Encrypt)
- ✅ Regelmäßige Backups einrichten
- ⚠️ SMTP-Credentials sicher speichern
- ⚠️ Admin-Passwort sicher wählen

### Credentials Management
Verwenden Sie einen Password Manager für:
- Database Passwörter
- JWT Secret
- SMTP Credentials
- Admin Account Credentials

---

## 📦 Backup & Recovery

### Automatisches Backup einrichten
```bash
# Backup-Script installieren (siehe DEPLOYMENT_STAGING.md)
sudo /usr/local/bin/backup-emsg.sh

# Cronjob für tägliches Backup
crontab -e
# Eintrag: 0 2 * * * /usr/local/bin/backup-emsg.sh
```

### Manuelles Backup
```bash
# Database
docker compose -f docker-compose.staging.yml exec postgres pg_dump -U emsg_staging emsg_staging > backup.sql

# Uploads
tar -czf uploads-backup.tar.gz uploads/
```

### Restore
```bash
# Database
docker compose -f docker-compose.staging.yml exec -T postgres psql -U emsg_staging emsg_staging < backup.sql

# Uploads
tar -xzf uploads-backup.tar.gz
```

---

## 📈 Monitoring

### Empfohlene Tools
- **Logs:** Docker logs (`docker compose logs -f`)
- **Uptime:** UptimeRobot, Pingdom
- **Errors:** Sentry, Rollbar
- **Performance:** New Relic, Datadog
- **SSL:** SSL Labs

### Health Endpoints
- Backend: `https://staging.emsg.example.com/api/health`
- API Docs: `https://staging.emsg.example.com/api/doc`

---

## 🆘 Support

### Bei Problemen

1. **Logs prüfen:**
   ```bash
   docker compose -f docker-compose.staging.yml logs -f backend
   ```

2. **Status prüfen:**
   ```bash
   docker compose -f docker-compose.staging.yml ps
   docker stats
   ```

3. **Ressourcen prüfen:**
   ```bash
   df -h  # Disk space
   free -h  # Memory
   htop  # CPU & Memory
   ```

4. **Dokumentation konsultieren:**
   - DEPLOYMENT_STAGING.md Troubleshooting-Sektion
   - Docker Logs analysieren
   - System Logs: `/var/log/nginx/error.log`

---

## 📝 Changelog

### Version 1.0 (10. Dezember 2025)
- Initial Staging Deployment Dokumentation
- Docker Compose für Staging
- Automatisches Deployment-Script
- Checkliste für Deployment
- Nginx Reverse Proxy Konfiguration
- SSL Setup mit Let's Encrypt
- Backup & Recovery Prozeduren

---

## 📄 Lizenz

Diese Dokumentation ist Teil des EMSG-Projekts.

---

**Erstellt:** 10. Dezember 2025  
**Autor:** GitHub Copilot  
**Version:** 1.0

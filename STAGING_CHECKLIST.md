# Staging Deployment Checklist

> Status-Hinweis (2026-05-27): Diese Checkliste ist weiterhin nutzbar, enthält aber historische Rollout-Annahmen. Vor einer Übergabe oder einem Neuaufbau zusätzlich `docs/HANDOVER_CHECKLIST.md`, `docs/DEPLOYMENT.md` und `docs/RUNBOOK.md` nutzen.

## Pre-Deployment

### Server Vorbereitung
- [ ] Ubuntu 22.04+ Server bereitgestellt
- [ ] Server erreichbar via SSH
- [ ] Mindestens 2 GB RAM verfügbar
- [ ] 20 GB freier Speicher
- [ ] Root/Sudo-Zugriff vorhanden

### Domain & DNS
- [ ] Domain `energy.fastbreak.one` bereit
- [ ] DNS A-Record konfiguriert und propagiert
- [ ] DNS-Propagation überprüft: `dig energy.fastbreak.one`

### Lokal
- [ ] Repository auf `main` oder vereinbartem Release-Tag
- [ ] Alle Änderungen committed
- [ ] .gitignore prüfen (keine Secrets committen)

## Server Setup

### System
- [ ] SSH-Login funktioniert
- [ ] System aktualisiert: `sudo apt update && sudo apt upgrade -y`
- [ ] Docker installiert und funktioniert
- [ ] Docker Compose V2 installiert
- [ ] User zur docker-Gruppe hinzugefügt
- [ ] Firewall (UFW) konfiguriert: SSH (22), HTTP (80), HTTPS (443)

### Repository
- [ ] Git installiert
- [ ] Repository geklont nach `~/apps/emsg-staging`
- [ ] Auf korrekten Branch gewechselt

### Konfiguration
- [ ] `.env` Datei erstellt
- [ ] Starke Passwörter generiert
- [ ] JWT Secret generiert
- [ ] Database URL korrekt konfiguriert
- [ ] SMTP-Einstellungen konfiguriert (optional)
- [ ] CORS_ORIGINS auf Staging-Domain gesetzt

## Deployment

### Docker
- [ ] `docker-compose.staging.yml` vorhanden
- [ ] Images gebaut: `docker compose -f docker-compose.staging.yml build`
- [ ] Container gestartet: `docker compose -f docker-compose.staging.yml up -d`
- [ ] Alle Container laufen: `docker compose -f docker-compose.staging.yml ps`
- [ ] Backend Health Check erfolgreich: `curl http://localhost:5000/api/health`

### Reverse Proxy
- [ ] Nginx installiert
- [ ] Site-Config erstellt: `/etc/nginx/sites-available/emsg-staging`
- [ ] Symlink erstellt: `/etc/nginx/sites-enabled/emsg-staging`
- [ ] Nginx-Konfiguration getestet: `sudo nginx -t`
- [ ] Nginx neugestartet: `sudo systemctl restart nginx`

### SSL
- [ ] Certbot installiert
- [ ] SSL-Zertifikat generiert: `sudo certbot --nginx -d energy.fastbreak.one`
- [ ] Auto-Renewal funktioniert: `sudo certbot renew --dry-run`
- [ ] HTTPS funktioniert: Browser-Test

## Post-Deployment

### Initial Setup
- [ ] Admin-User erstellt (Python-Shell im Backend-Container)
- [ ] Login mit Admin-Account funktioniert
- [ ] Test-Cohort erstellt
- [ ] Test-Campaign erstellt
- [ ] Test-Scenario erstellt

### Smoke Tests
- [ ] Frontend lädt: `https://energy.fastbreak.one`
- [ ] Backend erreichbar: `https://energy.fastbreak.one/api/health`
- [ ] API Docs erreichbar: `https://energy.fastbreak.one/api/docs`
- [ ] Login funktioniert (Admin)
- [ ] WebSocket verbindet (Trainer Dashboard)
- [ ] Designer: Scenario erstellen
- [ ] Designer: Campaign erstellen
- [ ] Trainer: Cohort erstellen
- [ ] Trainer: Session starten
- [ ] Player: Solo-Session starten
- [ ] Player: Forecast eingeben
- [ ] Game Engine: Runde berechnet sich
- [ ] Results anzeigen

### Monitoring
- [ ] Logs prüfen: `docker compose -f docker-compose.staging.yml logs -f`
- [ ] Keine kritischen Fehler in Logs
- [ ] Container-Ressourcen normal: `docker stats`
- [ ] Disk Space ausreichend: `df -h`
- [ ] Memory Usage normal: `free -h`

### Backup
- [ ] Backup-Script installiert: `/usr/local/bin/backup-emsg.sh`
- [ ] Backup-Script ausführbar
- [ ] Cronjob für automatische Backups eingerichtet
- [ ] Manuelles Backup getestet
- [ ] Backup-Restore getestet

### Sicherheit
- [ ] Firewall aktiv: `sudo ufw status`
- [ ] Nur notwendige Ports offen (22, 80, 443)
- [ ] SSL A-Rating: https://www.ssllabs.com/ssltest/
- [ ] Security Headers gesetzt (CSP, X-Frame-Options, etc.)
- [ ] Fail2Ban installiert (optional)
- [ ] Passwort-Richtlinien dokumentiert

## Optional aber empfohlen

### Monitoring & Logging
- [ ] Log-Rotation konfiguriert
- [ ] Error Tracking (Sentry o.ä.) eingerichtet
- [ ] Uptime Monitoring (UptimeRobot o.ä.)
- [ ] Performance Monitoring
- [ ] Alert-System für kritische Fehler

### Performance
- [ ] Load Testing durchgeführt
- [ ] Database Indexes optimiert
- [ ] Redis-Cache funktioniert
- [ ] Static Assets gecacht (nginx)
- [ ] Compression aktiviert (gzip)

### Documentation
- [ ] Deployment dokumentiert
- [ ] Credentials sicher gespeichert (Password Manager)
- [ ] Runbook für häufige Probleme erstellt
- [ ] Admin-Kontakte dokumentiert

## Rollback Plan

Falls Probleme auftreten:

### Option 1: Container neu starten
```bash
docker compose -f docker-compose.staging.yml restart
```

### Option 2: Kompletter Neustart
```bash
docker compose -f docker-compose.staging.yml down
docker compose -f docker-compose.staging.yml up -d
```

### Option 3: Auf vorherige Version zurück
```bash
git checkout <previous-commit>
docker compose -f docker-compose.staging.yml up -d --build
```

### Option 4: Database Restore
```bash
# Latest Backup finden
ls -lh /var/backups/emsg/

# Restore
docker compose -f docker-compose.staging.yml exec -T postgres psql -U emsg_staging emsg_staging < /var/backups/emsg/db_YYYYMMDD_HHMMSS.sql
```

## Sign-off

- [ ] Deployment von: ________________ (Name)
- [ ] Datum: ________________
- [ ] Getestet von: ________________
- [ ] Freigegeben von: ________________

## Notizen

_Platz für zusätzliche Notizen, Probleme, oder besondere Konfigurationen:_

---

**Version:** 1.0  
**Letzte Aktualisierung:** 10. Dezember 2025

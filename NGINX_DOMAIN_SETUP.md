# Domain Setup: marketsimulationgame.energy

Dieses Dokument beschreibt, wie du die Market Simulation Game Anwendung unter der Domain **marketsimulationgame.energy** mit Nginx und SSL verfügbar machst.

## 🏗️ Architektur Überblick

```
┌─────────────────────────────────────────────────────┐
│ Internet (marketsimulationgame.energy)              │
└────────────────────┬────────────────────────────────┘
                     │ (Port 80 → 443)
┌────────────────────┴────────────────────────────────┐
│ Host Nginx (Reverse Proxy)                          │
│ - SSL/TLS Termination                               │
│ - HTTP → HTTPS Redirect                             │
│ - Security Headers                                  │
└────────────────────┬────────────────────────────────┘
                     │ (localhost:18080)
┌────────────────────┴────────────────────────────────┐
│ Traefik (Docker)                                    │
│ - Reverse Proxy für Backend/Frontend                │
│ - WebSocket Unterstützung                           │
└────────────────────┬────────────────────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
    ┌───┴────┐            ┌──────┴──┐
    │ Backend│            │Frontend │
    │(Flask) │            │(Vue.js) │
    └────────┘            └─────────┘
```

## 📋 Voraussetzungen

- **Server**: Ubuntu 22.04 LTS oder Debian 12+
- **Zugriff**: SSH Root/Sudo Zugriff
- **DNS**: Domain `marketsimulationgame.energy` muss auf deine Server-IP zeigen
- **Ports**: 80 und 443 müssen erreichbar sein
- **Docker**: Docker und Docker Compose müssen installiert sein

## 🚀 Setup-Schritte

### 1. SSH zum Server verbinden

```bash
ssh root@your-server-ip
cd /home/fb1/emsg
```

### 2. DNS Records konfigurieren

Vor dem Nginx-Setup **müssen** diese DNS-Records gesetzt werden:

```
Type  | Name                          | Value              | TTL
------|-------------------------------|--------------------|-----
A     | marketsimulationgame.energy   | YOUR_SERVER_IP     | 3600
AAAA  | marketsimulationgame.energy   | YOUR_SERVER_IPV6   | 3600
A     | www.marketsimulationgame.energy | YOUR_SERVER_IP   | 3600
```

**Wichtig**: Warte 5-10 Minuten, bis die DNS-Records propagiert haben. Du kannst dies testen mit:

```bash
nslookup marketsimulationgame.energy
# oder
dig marketsimulationgame.energy
```

### 3. Nginx und Let's Encrypt installieren

Führe das Automatisierungs-Skript aus:

```bash
chmod +x setup-nginx.sh
sudo ./setup-nginx.sh
```

Das Skript macht folgende Schritte automatisch:
- ✅ Installiert Nginx (falls nicht vorhanden)
- ✅ Installiert Certbot für SSL
- ✅ Kopiert die Nginx-Konfiguration nach `/etc/nginx/sites-available/`
- ✅ Aktiviert die Konfiguration
- ✅ Erstellt kostenlose SSL-Zertifikate von Let's Encrypt
- ✅ Konfiguriert automatische Zertifikats-Erneuerung
- ✅ Startet Nginx neu

### 4. Docker Container starten

```bash
# Docker Compose starten (falls nicht bereits laufend)
docker-compose up -d

# Status prüfen
docker-compose ps
docker-compose logs -f
```

### 5. Testen

```bash
# Test auf Port 80 (wird zu 443 weitergeleitet)
curl -L http://marketsimulationgame.energy

# Test auf Port 443 (HTTPS)
curl -I https://marketsimulationgame.energy

# WebSocket Test (Socket.IO)
curl -I https://marketsimulationgame.energy/socket.io/
```

### 6. Verify SSL Certificate

```bash
# SSL Zertifikat Informationen
certbot certificates

# Überprüfe SSL Status
openssl s_client -connect marketsimulationgame.energy:443
```

## 📝 Konfigurationsdateien

### `nginx-host.conf`
- **Ort**: `/home/fb1/emsg/nginx-host.conf`
- **Zweck**: Host-level Nginx Konfiguration (Vorlage)
- **Installiert nach**: `/etc/nginx/sites-available/marketsimulationgame.energy`
- **Funktionen**:
  - HTTP → HTTPS Redirect
  - SSL/TLS Zertifikate
  - Security Headers (HSTS, X-Frame-Options, etc.)
  - Gzip Kompression
  - WebSocket Unterstützung
  - Reverse Proxy zu Traefik (localhost:18080)

### `.env` Anpassungen
```bash
# Domain konfiguriert für Traefik
TRAEFIK_DOMAIN=marketsimulationgame.energy
```

## 🔄 SSL Zertifikat Erneuerung

Let's Encrypt Zertifikate laufen nach 90 Tagen ab. Certbot aktualisiert diese automatisch:

```bash
# Automatische Erneuerung aktivieren
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

# Status prüfen
sudo systemctl status certbot.timer

# Manuelle Erneuerung (wenn nötig)
sudo certbot renew --force-renewal
```

## 🔐 Security Best Practices

Die Nginx-Konfiguration enthält bereits:
- ✅ HTTPS Enforcement (HTTP → 301 Redirect)
- ✅ Modern TLS 1.2 + 1.3
- ✅ HSTS Header (Strict-Transport-Security)
- ✅ Sicherheits-Headers (X-Frame-Options, X-Content-Type-Options)
- ✅ Gzip Kompression (für bessere Performance)
- ✅ WebSocket Support (für Socket.IO)

Zusätzliche Maßnahmen:
```bash
# Firewall öffnen (UFW)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Überprüfe Firewall Status
sudo ufw status
```

## 🐛 Troubleshooting

### Problem: "marketsimulationgame.energy: No address associated with hostname"

**Lösung**: DNS-Records nicht propagiert. Warte 10-15 Minuten und teste erneut:
```bash
dig marketsimulationgame.energy @8.8.8.8
```

### Problem: "SSL certificate problem: self signed certificate"

**Lösung**: Let's Encrypt Zertifikat nicht erstellt. Führe aus:
```bash
sudo certbot renew --force-renewal
sudo systemctl reload nginx
```

### Problem: "Connection refused" auf Port 80/443

**Lösung**: Firewall blockiert oder Port nicht erreichbar:
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo systemctl restart nginx
```

### Problem: WebSocket-Fehler

**Lösung**: Überprüfe, dass Traefik auf Port 18080 läuft:
```bash
docker-compose ps
netstat -tlnp | grep 18080
```

### Problem: Backend nicht erreichbar

**Lösung**: Backend-Container prüfen:
```bash
docker-compose logs backend
docker-compose ps backend
```

## 📊 Monitoring und Logs

### Nginx Logs
```bash
# Real-time Access Log
tail -f /var/log/nginx/access.log

# Fehler Log
tail -f /var/log/nginx/error.log

# Spezifisch für marketsimulationgame.energy
tail -f /var/log/nginx/access.log | grep "marketsimulationgame.energy"
```

### Docker Logs
```bash
# Alle Container
docker-compose logs -f

# Spezifischer Container
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f traefik
```

### SSL Zertifikat Status
```bash
# Überprüfe alle Zertifikate
certbot certificates

# Überprüfe Ablaufdatum
echo | openssl s_client -servername marketsimulationgame.energy -connect marketsimulationgame.energy:443 2>/dev/null | openssl x509 -noout -dates
```

## 🔄 Deployment Updates

Nach Code-Updates:

```bash
# Repository aktualisieren
git pull origin main

# Docker Images neu bauen und starten
docker-compose down
docker-compose up -d --build

# Logs prüfen
docker-compose logs -f

# Nginx neuladen (falls nötig)
sudo systemctl reload nginx
```

## 🎯 Performance Optimierungen

### Frontend Caching (bereits konfiguriert)
- HTML: No-Cache (wird immer neu geladen)
- JS/CSS/Bilder: 1 Jahr Cache mit Content Hash
- Gzip Kompression für alle Textdateien

### Backend Optimierungen
```bash
# In docker-compose.yml anpassen:
# - Redis für Session/Cache
# - Connection Pooling
# - Rate Limiting
```

## 📞 Support / Hilfe

Falls Probleme auftreten:

1. **Logs prüfen**: 
   ```bash
   docker-compose logs
   sudo tail -f /var/log/nginx/error.log
   ```

2. **Test-URLs**:
   - Frontend: https://marketsimulationgame.energy/
   - API: https://marketsimulationgame.energy/api/health
   - Socket.IO: https://marketsimulationgame.energy/socket.io/
   - Uploads: https://marketsimulationgame.energy/uploads/

3. **Wichtige Befehle**:
   ```bash
   docker-compose ps                    # Status aller Container
   docker-compose logs -f               # Live-Logs
   sudo systemctl status nginx          # Nginx Status
   sudo nginx -t                        # Nginx Konfiguration prüfen
   certbot certificates                 # SSL Zertifikate prüfen
   ```

---

**Erstellt**: 2026-05-26  
**Domain**: marketsimulationgame.energy  
**Deployment-Typ**: Production mit Let's Encrypt SSL

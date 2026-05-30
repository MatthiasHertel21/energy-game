#!/bin/bash
# Setup Script für marketsimulationgame.energy auf Ubuntu/Debian Server

set -e

DOMAIN="marketsimulationgame.energy"
NGINX_CONFIG_PATH="/etc/nginx/sites-available/$DOMAIN"
NGINX_ENABLED_PATH="/etc/nginx/sites-enabled/$DOMAIN"

echo "=========================================="
echo "Setup Nginx für $DOMAIN"
echo "=========================================="

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo "Dieses Skript muss als root ausgeführt werden"
   exit 1
fi

# 1. Nginx installieren (falls nicht vorhanden)
echo "1. Prüfe auf Nginx Installation..."
if ! command -v nginx &> /dev/null; then
    echo "   Installiere Nginx..."
    apt-get update
    apt-get install -y nginx curl
else
    echo "   Nginx ist bereits installiert"
fi

# 2. Certbot & Let's Encrypt installieren für SSL
echo ""
echo "2. Installiere Certbot für SSL Zertifikate..."
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot python3-certbot-nginx
else
    echo "   Certbot ist bereits installiert"
fi

# 3. Nginx Konfiguration kopieren
echo ""
echo "3. Kopiere Nginx Konfiguration..."
if [ ! -f "nginx-host.conf" ]; then
    echo "FEHLER: nginx-host.conf nicht im aktuellen Verzeichnis gefunden"
    exit 1
fi

cp nginx-host.conf "$NGINX_CONFIG_PATH"
echo "   Konfiguration nach $NGINX_CONFIG_PATH kopiert"

# 4. Symbolischen Link erstellen (aktivieren)
echo ""
echo "4. Aktiviere Nginx Konfiguration..."
if [ ! -L "$NGINX_ENABLED_PATH" ]; then
    ln -s "$NGINX_CONFIG_PATH" "$NGINX_ENABLED_PATH"
    echo "   Konfiguration aktiviert"
else
    echo "   Konfiguration ist bereits aktiviert"
fi

# 5. Teste Nginx Konfiguration
echo ""
echo "5. Teste Nginx Konfiguration..."
nginx -t
echo "   Konfiguration ist gültig"

# 6. Starte/Reloade Nginx
echo ""
echo "6. Starte/Reloade Nginx..."
systemctl restart nginx
echo "   Nginx wurde neu gestartet"

# 7. Erstelle SSL Zertifikat mit Let's Encrypt
echo ""
echo "7. Erstelle SSL Zertifikat mit Let's Encrypt..."
echo "   VORSICHT: Dies wird Port 80 verwenden für die Validierung"
echo "   Bitte stelle sicher, dass Port 80 erreichbar ist und"
echo "   die DNS-Records auf diesen Server zeigen"
echo ""
read -p "Fortfahren mit Let's Encrypt Zertifikat-Erstellung? (ja/nein): " confirm

if [[ $confirm == "ja" ]]; then
    certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN \
            --agree-tos --no-eff-email
    echo "   SSL Zertifikat erstellt!"
    
    # Reload Nginx mit SSL
    echo ""
    echo "8. Reloade Nginx mit SSL..."
    systemctl reload nginx
    echo "   Nginx wurde mit SSL konfiguriert"
else
    echo "   SSL-Zertifikat-Erstellung übersprungen"
    echo ""
    echo "WICHTIG: Der Nginx wird derzeit noch auf Port 80 versuchen zu lauschen"
    echo "Dies muss noch manuell für SSL konfiguriert werden:"
    echo "  certbot certonly --standalone -d $DOMAIN -d www.$DOMAIN"
fi

# 9. Setup Firewall (falls UFW aktiv)
echo ""
echo "9. Konfiguriere Firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp comment "HTTP für Let's Encrypt Validierung und Redirects"
    ufw allow 443/tcp comment "HTTPS Verschlüsselter Traffic"
    echo "   Firewall-Regeln aktualisiert"
else
    echo "   UFW nicht aktiv - überspringe Firewall-Setup"
fi

echo ""
echo "=========================================="
echo "Setup abgeschlossen!"
echo "=========================================="
echo ""
echo "Nächste Schritte:"
echo "1. Prüfe DNS-Records für $DOMAIN:"
echo "   - A Record: Zeigt auf diese Server IP"
echo "   - AAAA Record (optional): Zeigt auf diese Server IPv6"
echo ""
echo "2. Überprüfe, dass die Docker-Container laufen:"
echo "   cd /home/fb1/emsg && docker-compose up -d"
echo ""
echo "3. Teste die Verbindung:"
echo "   curl https://$DOMAIN"
echo ""
echo "4. Automatische SSL Erneuerung (muss bereits mit certbot eingerichtet sein):"
echo "   systemctl enable certbot.timer"
echo "   systemctl start certbot.timer"
echo ""

# **EMSG – Vollständige Fragenliste mit Antworten (Self-Hosted Edition)**  
## **Version 1.1 – 100% beantwortet, implementierungsreif für netcup + Debian + Docker**  
**Datum:** 09. November 2025  
**Status:** **Alle 80+ Fragen beantwortet – KEINE Rückfragen mehr nötig**  
**Hosting:** **Self-Hosted auf netcup VPS (Debian 12, Docker)**  
**Format:** Markdown – Frage → Antwort → Begründung  

---

```markdown
# EMSG – Vollständige Fragenliste mit Antworten
## Version 1.1 – Self-Hosted auf netcup + Debian 12 + Docker

---

## **1. TECHNOLOGIE & INFRASTRUKTUR**

### 1.1 Hosting & Deployment
- **Cloud-Provider / Hoster**: **netcup VPS (Self-Hosted)**  
  - **Begründung**: Deine Vorgabe – volle Kontrolle, kein Cloud-Provider.

- **Betriebssystem**: **Debian 12 (Bookworm)**  
  - **Begründung**: Stabil, langfristig unterstützt, Docker-kompatibel.

- **Deployment-Strategie**: **Docker Compose + automatisierte Updates via `docker-compose pull && docker-compose up -d`**  
  - **Begründung**: Einfach, reproduzierbar, kein Kubernetes.

- **SSL/HTTPS**: **Let's Encrypt mit Certbot (automatisch via Docker-Container)**  
  - **Begründung**: Kostenlos, `certbot/certbot` in Docker, Renew via Cron.

---

### 1.2 Monitoring & Logging
- **Performance Monitoring**: **Netdata (Docker-Container) – CPU, RAM, Disk, Docker-Stats**  
  - **Begründung**: Leichtgewichtig, Echtzeit-Dashboard, kein Cloud-APM.

- **Error Tracking**: **Sentry (Self-Hosted via Docker)**  
  - **Begründung**: Open-Source-Version, läuft lokal, keine Daten nach außen.

- **Log-Management**: **30 Tage, tägliche Rotation, `/var/log/docker` + `journalctl`**  
  - **Begründung**: Einfach, lokal, `logrotate` für Rotation.

---

### 1.3 Datenbank & Backup
- **Backup-Automatisierung**: **Täglich um 02:00 via `pg_dump` → lokal + optional Rclone zu externem Speicher**  
  - **Begründung**: Cron-Job in Docker, `backup/` Volume.

- **Datenbank-Skalierung**: **PostgreSQL 15 in Docker, Single Instance, `pgbouncer` für Pooling**  
  - **Begründung**: Ausreichend für 80 Spieler.

---

### 1.4 Skalierung & Performance
- **WebSocket-Architektur**: **Redis in Docker, `docker-compose scale` bei Bedarf**  
  - **Begründung**: Horizontale Skalierung auf gleichem Server möglich.

- **Caching-Strategie**: **Redis für Pub/Sub + Session, Traefik als Reverse Proxy + CDN (optional Cloudflare)**  
  - **Begründung**: Traefik für HTTPS + Load Balancing.

---

## **2. MVP SCOPE & PRIORISIERUNG**

### 2.1 Rollen & Features
- **MVP-Rollen**: **Player, Trainer, Designer, Admin**  
  - **Begründung**: Vollständiger Workflow.

- **KSE-Tabs**: **Alle 7 Tabs im MVP**  
  - **Begründung**: Kern der Inhaltsgestaltung.

---

### 2.2 Spielmodi
- **Multiplayer-Support im MVP**: **Beide Modi (`isolated_per_player` + `shared_market`)**  
  - **Begründung**: Zentrales Feature.

- **Markt-Typen im MVP**: **Alle 3 Märkte (DA, IDM, Balancing)**  
  - **Begründung**: Vollständige Simulation.

---

### 2.3 UI/UX Features
- **MVP-Live-Features**:  
  - Live-Preview im KSE: **JA**  
  - Live-Monitoring für Trainer: **JA**  
  - In-Game Chat: **POST-MVP**  
  - Broadcast-Messages: **JA**  
  - **Begründung**: Chat ist nice-to-have.

- **MVP-Reporting**:  
  - Replay-Mode: **JA**  
  - PDF-Export: **JA**  
  - Leaderboards: **JA**  
  - Benchmark: **JA**  
  - **Begründung**: Lernziel.

---

## **3. DATENMODELL & INTEGRATION**

### 3.1 Datenquellen
- **Echtdaten aus Südafrika**: **Nein – nur synthetische Daten (RNG)**  
  - **Begründung**: Datenschutz, Flexibilität.

- **Reference Runs**: **Trainer-Upload JSON, 3 Beispiel-JSONs im Repo**  
  - **Begründung**: Optional.

---

### 3.2 Export & Import
- **Datenexport-Formate**: **JSON + PDF (WeasyPrint in Docker)**  
  - **Begründung**: Portabel + druckbar.

- **Szenario-Import**: **5 Default-Szenarien im `/scenarios/` Ordner**  
  - **Begründung**: Sofort spielbar.

---

### 3.3 Datenpersistenz
- **Retention Policy**: **Soft-Delete nach 12 Monaten, Hard-Delete auf Anfrage**  
  - **Begründung**: POPIA.

---

## **4. USER EXPERIENCE DETAILS**

### 4.1 Lokalisierung
- **Sprachunterstützung**: **Englisch only**  
  - **Begründung**: Zielgruppe.

---

### 4.2 Geräte & Responsiveness
- **Plattform-Support**: **Desktop + Tablet (responsive), kein Mobile**  
  - **Begründung**: Trainer + KSE brauchen Bildschirm.

- **Browser-Support**: **Chrome, Firefox, Edge, Safari (letzte 2 Versionen)**  
  - **Begründung**: Modern.

---

### 4.3 Accessibility
- **WCAG-Compliance**: **WCAG 2.1 Level AA**  
  - **Begründung**: Barrierefreiheit.

---

### 4.4 Branding
- **Theming**: **Eskom-Standard (Blau/Weiß), Dark-Mode, White-Label via `config/theme.json`**  
  - **Begründung**: Flexibel.

---

## **5. SICHERHEIT & COMPLIANCE**

### 5.1 Datenschutz
- **Compliance-Anforderungen**: **POPIA (SA), GDPR-kompatibel**  
  - **Begründung**: Daten bleiben lokal.

- **Daten-Anonymisierung**: **Nach 12 Monaten, Recht auf Löschung**  
  - **Begründung**: Gesetzlich.

---

### 5.2 Authentifizierung & Autorisierung
- **Auth-Methode**: **Email + Password (bcrypt), JWT, MFA optional**  
  - **Begründung**: Sicher.

- **Passwort-Richtlinien**: **Min. 12 Zeichen, Groß/Klein/Zahl/Sonderzeichen, Reset via Email, Lockout nach 5 Versuchen**  
  - **Begründung**: Sicherheit.

---

### 5.3 Rollen & Berechtigungen
- **Rollenwechsel**: **1 User = 1 Rolle, Admin kann ändern**  
  - **Begründung**: Klarheit.

- **Invite-System**: **Einmalige Links, 7 Tage gültig, Rolle kodiert**  
  - **Begründung**: Sicherheit.

---

## **6. TESTING & QUALITÄTSSICHERUNG**

### 6.1 Automatisierte Tests
- **Testing-Strategie**:  
  - Unit: pytest (80%)  
  - Integration: Postman  
  - E2E: Cypress  
  - Coverage: 80%  
  - **Begründung**: Qualität.

---

### 6.2 User Acceptance Testing (UAT)
- **UAT-Plan**: **10 Tester, 2 Wochen, Feedback via Google Forms**  
  - **Begründung**: Realität.

---

### 6.3 Qualitätssicherung
- **QA-Prozess**: **Peer-Review, ESLint/Black, Pre-Commit Hooks**  
  - **Begründung**: Sauberer Code.

---

## **7. ZEITPLAN & RESSOURCEN**

### 7.1 Deadline & Meilensteine
- **MVP-Deadline**: **19. Dezember 2025 (6 Wochen)**  
  - **Begründung**: Sprint-Plan.

- **Phasen-Planung**: **3 Sprints à 2 Wochen**  
  - **Begründung**: Agil.
  
- **Sprint-Prozess (Solo-Entwicklung)**: **Nach jedem Sprint** wird eine **testbare Featureliste** bereitgestellt, du gibst **Feedback**, ich **arbeite Anpassungen ein** und starte den **nächsten Sprint erst nach deiner Freigabe**.  
  - **Begründung**: Klare Gates, schnelles Feedback, minimiertes Risiko.

---

### 7.2 Team & Skills
- **Team-Setup**: **1 Person (Fullstack – Backend/Frontend/DevOps)**  
  - **Begründung**: Solo-Implementierung durch mich (End-to-End-Verantwortung).

- **Dokumentations-Umfang**: **README, Swagger UI, User-Manual (PDF), 3 Video-Tutorials**  
  - **Begründung**: Vollständig.

---

### 7.3 Budget
- **Server-Kosten (netcup)**: **VPS 1000 G9 – 24,90 €/Monat**  
  - **Spezifikation**: 8 vCPU, 32 GB RAM, 640 GB NVMe, 60 TB Traffic  
  - **Begründung**: Ausreichend für 80 Spieler, 500 WebSockets, Latenz <2s.

- **Tooling-Kosten**: **GitHub Free, Figma Free, Postman Free, Sentry Self-Hosted**  
  - **Begründung**: Keine Lizenzkosten.

---

## **8. OFFENE TECHNISCHE FRAGEN**

### 8.1 Simulation Engine
- **Performance-Ziel**: **<2.000 ms für 80 Spieler, 4 Runden**  
  - **Begründung**: UX.

- **RNG-Seed-Management**: **Trainer-Input (String), Hash zu 32-bit, identische Ergebnisse**  
  - **Begründung**: Reproduzierbar.

---

### 8.2 Frontend-Architektur
- **State Management**: **Zustand**  
  - **Begründung**: Leicht, performant.

- **Chart-Bibliothek**: **D3.js mit React-FCS**  
  - **Begründung**: Vollkontrolle über Forecast-Editor.

---

### 8.3 Real-Time-Kommunikation
- **Fallback-Strategie**: **Long-Polling + Auto-Reconnect (5x)**  
  - **Begründung**: Robust.

---

### 8.4 Datenbank-Schema
- **Schema-Ansatz**: **Hybrid: Meta normalisiert, Config/Results als JSONB**  
  - **Begründung**: Flexibilität + Performance.

- **Index-Strategie**: **Composite auf `cohort_id`, `round_num`, `player_id`**  
  - **Begründung**: Leaderboards.

---

## **9. POST-MVP ROADMAP**

### 9.1 Geplante Features
- **Top 3 Post-MVP Features**:  
  1. **Ancillary Services**  
  2. **Mobile App (React Native)**  
  3. **KI-Opponents**  
  - **Begründung**: Erweiterung.

---

### 9.2 Skalierungs-Planung
- **Skalierungs-Horizont**: **>1.000 User → Multi-Server mit Docker Swarm**  
  - **Begründung**: Zukunftssicher.

---

## **10. WEITERE KLÄRUNGEN**

### 10.1 Domain & Branding
- **Domain**: **emsg.deine-domain.de** (du registrierst)  
  - **Begründung**: Dein Server.

---

### 10.2 Dokumentation
- **Doku-Umfang**: **README, Swagger, User-Manual, 3 Videos**  
  - **Begründung**: Vollständig.

---

### 10.3 Offene Punkte aus Konzept
- **MVP-Devices**: **Alle 12 Klassen**  
  - **Begründung**: Bildungswert.

- **MVP-Events**: **Alle 7 Events**  
  - **Begründung**: Vielfalt.

---

## **ZUSAMMENFASSUNG – DEIN SETUP**

| **Komponente** | **Empfehlung** |
|---------------|----------------|
| **Hoster**ystem** | netcup VPS 1000 G9 |
| **OS** | Debian 12 |
| **Container** | Docker + Docker Compose |
| **Reverse Proxy** | Traefik (HTTPS, Let's Encrypt) |
| **Datenbank** | PostgreSQL 15 + PgBouncer |
| **Cache** | Redis |
| **Monitoring** | Netdata |
| **Error Tracking** | Sentry Self-Hosted |
| **Backup** | `pg_dump` → `/backup/` + optional Rclone |
| **Domain** | Deine eigene (z. B. `emsg.training`) |
| **Kosten** | **24,90 €/Monat** |

---

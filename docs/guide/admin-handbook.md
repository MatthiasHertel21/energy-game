# Admin Handbook
## Energy Market Simulation Game (EMSG)

Version: 1.0  
Date: 17 Nov 2025  
Audience: System Administrators

---

## Quick Guide

- Role: Manage users and roles, invites, monitor activity, review sessions.
- Three tabs: Users | Activity Dashboard | Sessions.
- System limits (guidance): ≤1,000 users, ≤500 WebSocket connections, ≤10 concurrent cohorts, upload ≤5 MB.
- Ops: ensure backups, logs/monitoring, and security hygiene.

---

## Detailed Guide

### 1) Access & Navigation

- Login at `/login`. Admins land on `/admin`.
- Tabs:
  - Users: list/edit roles, invite, create/delete users.
  - Activity Dashboard: KPIs and time series (logins, registrations, sessions).
  - Sessions: system-wide session list + filters.

---

### 2) Users

2.1 User List
- Columns: Email, Role, Created, Status, Actions; pagination and optional search.
- Change role: POST `/api/admin/users/{id}/role` with `{ role }` (player|trainer|designer|admin)`.
- Delete user: confirm → DELETE `/api/admin/users/{id}`; list reloads.

2.2 Invite User
- Dialog fields: Email, Role.
- POST `/api/admin/invites` → returns `{ invite: { link, email_sent } }`.
- If `email_sent=false`: copy link and send manually.

2.3 Create User
- Dialog fields: Email, Role, optional Password.
- POST `/api/admin/users` with `{ email, role, password? }`.
- Success: snackbar “User created” (+ “and email sent” if configured).

Security
- Minimum password length enforced by backend.
- Follow least-privilege; only necessary admins.

---

### 3) Activity Dashboard

- Period filter (e.g., 30d) triggers reload of:
  - Summary tiles (users by role, active users, sessions started).
  - Time series: logins, registrations, sessions
    - GET `/api/admin/activity/timeseries?metric=...&period=...`.
  - Recent: GET `/api/admin/activity/recent?limit=50`.
- Charts are accessible (role="img").

---

### 4) Sessions (System-wide)

- Filters: status, scenario id, date from/to, rows per page.
- GET `/api/admin/sessions` with filters; table shows ID, scenario, cohort, started, status, rounds, players.
- Actions (optional): open comparison/replay (trainer views) and export.

Export
- CSV/PDF if enabled; filenames like `sessions_{from}_{to}.csv`.

Note
- Trainers control running sessions (pause/end). Admin endpoints to force control are optional and governance-dependent.

---

### 5) Operations & Maintenance

5.1 Backups
- Use provided scripts (e.g., `backend/scripts/backup.sh`) or your infra tooling.
- Schedule daily DB backups; retain ≥14 days; test restores.

5.2 Logs & Monitoring
- Backend logs (Docker/your stack); consider centralization (ELK/OpenSearch/CloudWatch).
- Frontend error capture (Sentry/RUM) optional.
- Infra metrics: CPU/RAM, DB connections, WebSocket count/latency.

5.3 RBAC
- Roles: player, trainer, designer, admin.
- Admins have full access to users/invites and reporting.

5.4 Privacy
- Limit PII in logs; honor delete/anonymize requests.
- Use email only for platform needs.

5.5 Security
- HTTPS everywhere; CORS properly configured.
- Rate-limit login/invite endpoints.
- Enforce password policy; MFA recommended if available.
- Validate uploads for type/size.

---

### 6) Troubleshooting & FAQ

Common Issues
- Invite emails not sent: verify SMTP; use invite link manually.
- Role change has no effect: user may need to re-login; check API response.
- Empty activity charts: switch period; inspect network/console.
- Empty sessions list: reset filters; increase limit; backend reachable?
- User cannot login: check status; reset password; inspect logs.

FAQ
- Force end sessions as admin? Typically no; trainers manage sessions. Admin override can be added by policy.
- Branding/theme? Optional tab if enabled; otherwise set via deployment config.

---

Support
- Technical: support@emsg.example.com
- Security: security@emsg.example.com
- Admin team: admin@emsg.example.com# Admin Handbuch
## Energy Market Simulation Game (EMSG)

**Version:** 1.0  
**Datum:** 17. November 2025  
**Zielgruppe:** Administratoren/Systembetreiber

---

## Quick Guide – Das Wichtigste auf einen Blick

### Ihre Rolle als Admin
Admins verwalten Nutzer, Rollen, Einladungen und behalten Systemaktivitäten sowie Sessions im Blick. Ziel ist sichere, stabile und skalierbare Bereitstellung.

### Kernaufgaben in 5 Schritten

1. **Nutzerübersicht prüfen** → Rollen zuweisen, Nutzer anlegen/löschen
2. **Einladungen versenden** → Trainer/Designer/Admin per Invite einladen
3. **Aktivität monitoren** → Logins/Registrierungen/Sessions im Activity Dashboard
4. **Sessions prüfen** → Systemweite Sessions filtern und nachverfolgen
5. **Backups fahren** → Regelmäßig Daten sichern (Server/Shell-Skripte)

### Wichtigste Screens

- **Users (Admin Panel):** Nutzerverwaltung, Rollen, Invites, Create User
- **Activity Dashboard:** Kennzahlen und Zeitreihen (Logins, Registrierungen, Sessions)
- **Sessions:** Systemweite Liste + Filter (Status/Szenario/Zeitraum)

### Systemlimits (Richtwerte)

- Max Nutzer: 1.000
- Max WebSocket-Verbindungen: 500
- Max gleichzeitige Cohorts: 10
- Upload-Limit: 5 MB

---

## Ausführliche Dokumentation

### 1. Zugang & Navigation

- **Login:** `/login` → Admin-Accounts werden nach Login auf `/admin` geleitet
- **Admin Panel Tabs:** Users | Activity Dashboard | Sessions

---

### 2. Users – Nutzerverwaltung

**URL:** `/admin` → Tab "Users"

**Zweck:** Nutzer auflisten, Rollen ändern, neue Nutzer anlegen, Einladungen versenden, Nutzer löschen.

#### 2.1 Kopfbereich – Aktionen

- Button `Invite User` (öffnet Invite-Dialog)
- Button `Create User` (öffnet Create-Dialog)

#### 2.2 Tabelle – Nutzerliste

- Spalten: `Email`, `Role`, `Created`, `Status`, `Actions`
- Paginierung: Zeilen/Seite (z.B. 10), Navigation über Seiten (falls implementiert)
- Suche/Filter: Textfeld `Search` (falls vorhanden)

Aktionen pro Zeile:
- `Role` Dropdown: `player | trainer | designer | admin`
  - Änderung sendet: POST `/api/admin/users/{id}/role` `{ role }`
  - UI: Optimistisches Update, Fehler → Rolle wird zurückgerollt
- `Delete` Button:
  - Confirm: "Delete user {email}?"
  - DELETE `/api/admin/users/{id}`
  - Erfolg: Snackbar "User deleted" und Liste neu laden

Status/Feedback:
- Snackbar bei Erfolg/Fehler: z.B. "Role updated", "Failed to delete user"
- Ladeindikatoren (Skeletons) beim initialen Laden

#### 2.3 Invite User – Einladungen

Dialog: `Invite User`
- Felder:
  - `Email` (Pflicht)
  - `Role` Dropdown (`trainer | designer | admin | player`)
- Button: `Send Invite`
- Request: POST `/api/admin/invites` `{ email, role }`
- Response: `{ invite: { link, email_sent } }`
  - Wenn `email_sent=false`: Link kopieren und manuell versenden
- Snackbar: "Invite email sent" oder "Invite created (copy link)"

Hinweise:
- Einladungslink vergibt Rolle vor – Nutzer registriert sich mit gesetzter Rolle
- Gültigkeit/Expiry je nach Systemkonfiguration (falls gesetzt)

#### 2.4 Create User – Nutzer direkt anlegen

Dialog: `Create User`
- Felder:
  - `Email` (Pflicht)
  - `Role` (`trainer | designer | admin | player`)
  - `Password` (optional; leer → Einladungsmail, falls konfiguriert)
- Button: `Create`
- Request: POST `/api/admin/users` `{ email, role, password? }`
- Erfolg: Snackbar "User created" (+ "and email sent" falls Versand aktiv)

Sicherheitsregeln:
- Admin kann jede Rolle vergeben
- Passwörter müssen Mindestlänge erfüllen (Backend-Validierung)

---

### 3. Activity Dashboard – Systemaktivität

**URL:** `/admin` → Tab "Activity Dashboard"

**Zweck:** Überblick über wichtige Aktivitätsmetriken und -verläufe.

#### 3.1 Filter & Zeitraum

- Feld: `Period` Dropdown (`7d | 30d | 90d`, abhängig von Implementierung; Standard: `30d`)
- Änderung triggert Neuladung aller Metriken

#### 3.2 Summary-Kacheln

- `Total Users by Role`: Spieler/Trainer/Designer/Admin
- `Active Users (7/30d)`: Anzahl aktiver Nutzer
- `Sessions Started`: Anzahl im Zeitraum
- Darstellung: Karten/Kacheln (sofern Backend bereitstellt)

#### 3.3 Zeitreihen-Charts

- Metriken (seriell geladen):
  - `logins` → GET `/api/admin/activity/timeseries?metric=logins&period={p}`
  - `registrations` → GET `/api/admin/activity/timeseries?metric=registrations&period={p}`
  - `sessions` → GET `/api/admin/activity/timeseries?metric=sessions&period={p}`
- Darstellung: Linienchart mit gefüllter Fläche
  - Achsen: X=Tag, Y=Count
  - Zugänglichkeit: `role="img"`, `aria-label="Activity chart"`

#### 3.4 Recent Activity – Letzte Ereignisse

- Liste: GET `/api/admin/activity/recent?limit=50`
- Spalten: `Timestamp`, `User`, `Action`, `Details`
- Nutzung: Schnellprüfung ungewöhnlicher Aktivitäten

Hinweise:
- Backend kann Daten aus `user_activity`/`sessions`/`users` aggregieren
- Bei Fehlern: Anzeige leerer States, Retry-Option

---

### 4. Sessions – Systemweite Sitzungen

**URL:** `/admin` → Tab "Sessions"

**Zweck:** Alle Sessions systemweit einsehen und filtern (Transparenz, Auditing).

#### 4.1 Filterleiste

- Felder:
  - `Status` Dropdown: `running | paused | ended | (leer=alle)`
  - `Scenario ID` Number (optional)
  - `Date From` (YYYY-MM-DD)
  - `Date To` (YYYY-MM-DD)
  - `Rows per page` (z.B. 25)
- Request: GET `/api/admin/sessions` mit Parametern `{ status?, scenario_id?, date_from?, date_to?, limit, offset }`

#### 4.2 Sessions Tabelle

- Spalten (typisch): `ID | Scenario | Cohort | Started | Status | Rounds | Players`
- Sortierung: Neueste zuerst
- Aktionen (optional): `View` (öffnet Comparison/Replay in Trainer-Ansicht), `Export`

#### 4.3 Export

- CSV/PDF-Export (falls vorhanden) für Reporting/Audit
- Dateinamen: `sessions_{from}_{to}.csv`

Hinweise:
- Admin kann Sessions nicht zwingend steuern (Pause/End via Trainer), außer spezielle Admin-Endpunkte sind implementiert

---

### 5. Betrieb & Wartung

#### 5.1 Backups

- Server-Skript: `backend/scripts/backup.sh`
- Empfohlen: Tägliches DB-Backup (cron), Aufbewahrung ≥ 14 Tage
- Prüfen: Restore-Tests regelmäßig durchführen

#### 5.2 Logs & Monitoring

- Backend-Logs: Fehlerlevel anzeigen/aggregieren (z.B. `docker logs`, ELK/CloudWatch, je nach Deployment)
- Frontend-Fehler: Sentry/RUM (optional)
- Metriken: CPU/RAM, DB-Verbindungen, WebSocket-Count

#### 5.3 Rollen & RBAC

- Rollen: `player`, `trainer`, `designer`, `admin`
- Admin-Rechte: Vollzugriff auf Nutzer/Einladungen/Sessions-Reporting
- Sicherheit: Least-Privilege-Prinzip befolgen (nur notwendige Admins)

#### 5.4 Datenschutz

- E-Mail-Adressen nur für Plattformzwecke nutzen
- Löschanfragen respektieren (Nutzer löschen/anonymisieren)
- Logs ohne PII speichern, wo möglich

---

### 6. Sicherheit & Compliance

- Passwort-Policy: Mindestlänge, ggf. Rotation (organisatorisch)
- MFA (optional, empfohlen, falls verfügbar)
- Session-Timeouts: Browser/JWT-Lebensdauer sinnvoll setzen
- Rate Limiting für Login/Invite-Endpunkte
- Upload-Validierung (Dateitypen/Größen)
- CORS/HTTPS erzwingen

---

### 7. Troubleshooting & FAQ

#### 7.1 Häufige Probleme

**Problem:** "Invite email sent" = false, kein Mailversand
- Lösung: SMTP-Konfiguration prüfen; Invite-Link manuell kopieren und senden

**Problem:** Rollenwechsel wirkt nicht
- Lösung: API-Response prüfen; Seite neu laden; prüfen, ob der Nutzer aktiv eingeloggt ist (Neulogin nötig)

**Problem:** Activity Charts leer
- Lösung: Zeitraum ändern (`Period`), Backend-Endpunkte prüfen, Fehler in Konsole/Netzwerk-Tab checken

**Problem:** Sessions-Liste leer
- Lösung: Filter zurücksetzen (Status/Datum), `limit` erhöhen, Backend erreichbar?

**Problem:** Nutzer kann sich nicht einloggen
- Lösung: Nutzerstatus prüfen, Passwort zurücksetzen, Logs auf Fehler prüfen

#### 7.2 FAQ

**F: Kann ich einen Nutzer herabstufen/aktualisieren ohne Logout zu erzwingen?**  
A: Ja, aber Rolle wird u.U. erst nach Re-Login vollständig wirksam.

**F: Wie viele Admins sollten wir haben?**  
A: So wenige wie nötig (2–3), um Risiko zu minimieren.

**F: Kann ich Sessions direkt beenden?**  
A: Standardmäßig steuern Trainer Sessions. Ein Admin-Endpunkt kann ergänzt werden, falls Governance dies vorsieht.

**F: Wo ändere ich Branding/Theme?**  
A: Branding ist optional; wenn aktiviert, erscheint ein zusätzlicher Admin-Tab "Branding". Andernfalls per Deployment/Theme-Config.

---

### 8. Glossar

| Begriff | Erklärung |
|---------|-----------|
| **Invite** | Einladungslink zum Erstellen eines Accounts mit vordefinierter Rolle |
| **RBAC** | Role-Based Access Control – rollenbasierte Rechteverwaltung |
| **Activity** | Aggregierte Ereignisse: Logins, Registrierungen, Sessions pro Zeitraum |
| **Session** | Spielinstanz eines Szenarios (Trainer-gesteuert oder Solo) |
| **Cohort** | Gruppe von Spielern, denen Szenarien/Sessions zugeordnet sind |
| **KPI** | Key Performance Indicator (z.B. Profit, Imbalance) |

---

### 9. Kontakt & Support

**Technischer Support:** support@emsg.example.com  
**Security Contact:** security@emsg.example.com  
**Admin Team:** admin@emsg.example.com

**Dokumentation:**
- Admin: `/docs/guide/admin-handbook.md`
- Trainer: `/docs/guide/trainer-handbook.md`
- Player: `/docs/guide/player-handbook.md`
- Designer: `/docs/guide/designer-handbook.md`

---

**Ende des Admin Handbuchs**  
**Version:** 1.0 | **Datum:** 17.11.2025  
**Lizenz:** Intern | © EMSG Project Team

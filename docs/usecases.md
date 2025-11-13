# Use Cases – Campaigns, Catalog, Solo/Cohort

Date: 2025-11-11

This document captures core use cases and maps them to UI, API, and acceptance criteria.

---

## UC-PT1: Designer definiert Player Types je Szenario (IMPLEMENTIERT)

- Actor: Designer (KSE)
- Ziel: Spielerarchetypen pro Szenario definieren und Geräte zuordnen, sodass das System erlaubte Eingaben je Runde aus den Geräten ableitet.
- Preconditions: Geräte sind in `config.devices` definiert.
- Hauptablauf:
   1) Designer erstellt einen Player Type `{ id, name, description? }`.
   2) Designer wählt zugehörige `devices[]` (Geräte‑IDs aus dem Szenario) und optional `zone`.
   3) KSE validiert (eindeutige `id`, existierende Geräte, Name ≠ leer) und speichert in `config.player_types[]`.
- Nachbedingungen: Szenario enthält konsistente `player_types[]`.
- Akzeptanzkriterien (erfüllt):
   - Hinzufügen/Bearbeiten/Löschen von Types möglich.
   - Validierung blockiert fehlerhafte Zuordnungen (siehe Backend `kse.validate_config`, Tests ergänzt).

## UC-PT2: Trainer wählt erlaubte Player Types + Caps (shared_market) (IMPLEMENTIERT)

- Actor: Trainer
- Ziel: Vor Start festlegen, welche Typen wählbar sind und wie viele Spieler je Typ zugelassen sind.
- Preconditions: Szenario hat `player_types[]`; Modus `shared_market`.
- Hauptablauf:
   1) Trainer öffnet Startformular und setzt `mode=shared_market`.
   2) Liste der Types erscheint mit Checkbox und optionalem `max_players` je Typ.
   3) Trainer wählt erlaubte Typen und setzt Caps; Start.
   4) Backend speichert `allowed_player_types[]` (mit Caps) für die Session.
- Nachbedingungen: Session enthält erlaubte Typen; Briefing/Join API liefert Restkapazitäten.
- Akzeptanzkriterien (erfüllt):
   - Ungültige Caps werden abgelehnt (`/api/sessions/:id/allowed-types`).
   - Restkapazität in Briefing; volle/unerlaubte Typen nicht wählbar (`/api/sessions/:id/briefing`).

## UC-1 Player selects and plays a Scenario (Catalog) – IMPLEMENTIERT

- Actor: Player
- Goal: Aus einem veröffentlichten Kampagnenkatalog ein Szenario auswählen und spielen – entweder Solo (isolated) oder der Cohorte (Trainer‑Session) beitreten.
- Preconditions:
  - Player ist eingeloggt.
  - Mindestens eine veröffentlichte Kampagne existiert (Campaign.published=true).
  - Für Cohort‑Beitritt: Player ist Mitglied in mindestens einer Cohorte; Trainer hat eine aktive Session gestartet.

User Flow
1) Player öffnet „Catalog“ (`/catalog`).
   - Sieht Karten mit Cover, Name, Beschreibung, Fortschritt (completed/total), Published‑Badge.
2) Klick auf eine Kampagne → „Campaign Detail“ (`/catalog/:id`).
   - Sieht eine geordnete Liste der Szenarien (Designer‑Reihenfolge, `order_index`).
   - Pro Szenario sieht der Player den eigenen Status (not_started | in_progress | completed).
3) Auswahl einer Spielform:
   - Solo: Button „Play solo“ ist aktiviert, wenn `solo_enabled=true` für die Zuordnung in dieser Kampagne.
   - Cohort: Bereich „Trainer cohort“ zeigt aktive Sessions dieses Szenarios in Player‑Kohorten (Auswahl per Cohort/Session – falls mehrere offen) – nur wenn `cohort_enabled=true`.
4) Start:
   - Solo: System erstellt eine Solo‑Session im Modus `isolated_per_player` und navigiert zum Spiel („Player“ Screen).
   - Cohort: Bei aktiver Session → Player wird zur Briefing‑Seite der Session navigiert; Spiel läuft trainer‑gesteuert.

Alternative/Fehlerfälle
- Kein Solo erlaubt → Button disabled mit Tooltip „Solo not enabled by designer“.
- Keine aktiven Cohort‑Sessions → Hinweis „No active session“.
- Mehrere aktive Sessions → Auswahl nach Cohort/Session (Drop‑down).

Progress‑Tracking
- Beim Solo‑Start wird `player_progress.status = in_progress` (falls noch nicht vorhanden) und `started_at` gesetzt.
- Beim Session‑Ende (Solo wie Cohort) wird der Status für betroffene Spieler/Szenarios auf `completed` gesetzt.

UI Mapping
- `frontend/src/pages/Catalog.jsx`
- `frontend/src/pages/CampaignDetail.jsx`

API Mapping (implementiert)
- GET `/api/catalog/campaigns` → list published Kampagnen mit Progress Aggregat.
- GET `/api/catalog/campaigns/:id` → Detail mit Szenario‑Mapping (order_index, solo_enabled, cohort_enabled) und Player‑Status je Szenario.
- GET `/api/me/sessions` → aktive Sessions (Cohort‑Join Anzeige/Filter).
- POST `/api/player/solo-sessions` { scenario_id, campaign_id? } → erstellt Solo‑Session (mode=isolated_per_player) und setzt Progress=in_progress.

Acceptance Criteria (erfüllt)
- Published Kampagnen erscheinen in `/catalog` in korrekter Reihenfolge und mit Fortschritt.
- „Play solo“ sichtbar und nutzbar nur, wenn erlaubt.
- Cohort‑Join nur möglich, wenn aktive Trainer‑Session existiert (mit Auswahl bei mehreren Sessions).
- Progress wird korrekt gesetzt/aktualisiert (in_progress, completed).

---

## UC-2 Designer verwaltet Kampagnen (n:m, Bild, Reihenfolge, Flags) – IMPLEMENTIERT

- Actor: Designer (oder Admin)
- Goal: Kampagnen erstellen/bearbeiten (Name, Beschreibung, Cover‑Bild, Publish), Szenarien n:m zuordnen, Reihenfolge bestimmen, Spielbarkeits‑Flags je Szenario setzen (solo_enabled, cohort_enabled).
- Preconditions:
  - Designer ist eingeloggt.
  - Szenarien existieren (können später hinzugefügt werden).

User Flow
1) Designer öffnet „Campaign Management“ (`/designer/campaigns`).
2) Kampagne anlegen (Name, Beschreibung) – Status „Draft“ (published=false).
3) Cover‑Bild hochladen (quadratisch, max 640×640px) – Server croppt/resize’t und speichert.
4) Szenarien zuordnen (n:m): Auswahl per Liste, Zuordnung wird mit initialem `order_index` am Ende ergänzt.
5) Reihenfolge anpassen (Up/Down oder Drag&Drop) – `order_index` wird persistiert.
6) Flags je Szenario setzen: `solo_enabled` und `cohort_enabled`.
7) Publish‑Toggle setzen (sichtbar für Player im Katalog).

UI Mapping
- `frontend/src/pages/DesignerCampaigns.jsx`

API Mapping (implementiert)
- GET/POST `/api/kse/campaigns` → Liste/Erstellung (Name, Beschreibung).
- PATCH `/api/kse/campaigns/:id` → Update `name`, `description`, `published`.
- POST `/api/kse/campaigns/:id/image` (multipart) → Cover upload; Server croppt auf square und resized ≤ 640px; setzt `cover_image_url`.
- GET `/api/kse/campaigns/:id/scenarios` → aktuelle Zuordnungen in Reihenfolge.
- POST `/api/kse/campaigns/:id/scenarios` → Zuordnung hinzufügen (`scenario_id`, optional `order_index`, `solo_enabled`, `cohort_enabled`).
- PUT `/api/kse/campaigns/:id/scenarios/reorder` → Batch‑Reihenfolge setzen.
- PATCH `/api/kse/campaigns/:id/scenarios/:scenario_id` → Flags/Reihenfolge ändern.
- DELETE `/api/kse/campaigns/:id/scenarios/:scenario_id` → Zuordnung entfernen.

Acceptance Criteria (erfüllt)
- Bild‑Upload akzeptiert PNG/JPG, wird serverseitig auf square≤640px normalisiert, und als `/uploads/campaigns/{id}.png` ausgeliefert.
- Szenario‑Zuordnungen sind n:m; ein Szenario kann in mehreren Kampagnen vorkommen.
- Reihenfolge wird korrekt gespeichert und in Player‑Ansicht respektiert.
- Publish/Unpublish steuert Sichtbarkeit im Catalog.

Security/RBAC
- Catalog Endpoints: player+ (alle eingeloggten Nutzer).
- Campaign Management & Upload: designer/admin.

---

## UC-3 Designer – Szenarienliste ansehen und zur Bearbeitung öffnen – IMPLEMENTIERT

- Ist‑Stand:
   - API: GET `/api/kse/scenarios` liefert alle Szenarien (id, name, campaign_id, config).
   - UI: Keine dedizierte Szenario‑Übersicht mit „Edit“; Bearbeiten erfolgt aktuell ad hoc im KSE (neu erstellen) oder indirekt über Kampagnen‑Zuordnung.

- Ziel/Flow:
   1) Designer öffnet „Scenarios“ (`/designer/scenarios`).
   2) Liste mit Suche/Sort (Name, Kampagne, erstellt am, zuletzt bearbeitet optional).
   3) Aktionen je Zeile: Edit (öffnet KSE mit Szenario), Duplicate, Delete (siehe UC‑4), Export.

- UI Mapping (neu): `frontend/src/pages/DesignerScenarios.jsx` (Liste) + Deep‑Link zu `KSE.jsx` mit `?id=...`.
- API Mapping: GET `/api/kse/scenarios` (bestehend).
- Acceptance (erfüllt):
   - Liste mit Suche; „Edit“ öffnet Szenario im KSE (`DesignerScenarios.jsx`).

## UC-4 Designer – Szenarienliste ansehen und einzelne Szenarien löschen – IMPLEMENTIERT

- Ist‑Stand:
   - API: DELETE `/api/kse/scenarios/:id` vorhanden.
   - UI: Keine Delete‑Aktion in einer Szenario‑Liste (nur Entfernen aus Kampagne, nicht global).

- Ziel/Flow:
   1) In `DesignerScenarios.jsx` → Klick auf Delete.
   2) Confirm‑Dialog („This will permanently delete the scenario. This action cannot be undone.“).
   3) Erfolg: Zeile verschwindet; Snackbar.

- Acceptance (erfüllt):
   - Delete mit Confirm und Fehler‑Handling (`DesignerScenarios.jsx`).

## UC-5 Trainer – Sichtbare Kampagnen pro Cohort auswählen – IMPLEMENTIERT

- Ziel/Flow:
   1) Trainer öffnet „Cohorts“ Detail/Tab „Campaigns“ (`/cohorts` → Detail).
   2) Liste aller Kampagnen (Name, Published); Checkbox „Visible in this cohort“.
   3) Speichern pro Cohort.

- Datenmodell (neu): `cohort_campaigns` (cohort_id, campaign_id, visible bool, active bool, UNIQUE).
- API (neu):
   - GET `/api/cohorts/:id/campaigns` → Sichtbarkeit/Aktivierung je Kampagne für Cohort.
   - PATCH `/api/cohorts/:id/campaigns/:cid` { visible?, active? }.

- Acceptance (erfüllt):
   - Sichtbarkeit/Activation via `/api/cohorts/:id/campaigns`; Catalog kann nach `for_me, active` filtern.

## UC-6 Trainer – Kampagne für Cohort aktivieren/deaktivieren (Multiplayer erlauben) – IMPLEMENTIERT

- Ziel/Flow:
   1) Im Cohort‑Campaigns Tab: Toggle „Active“ je Kampagne.
   2) Nur aktive Kampagnen erlauben das Starten/Öffnen von Sessions für diese Cohort.

- API: wie UC‑5 (`active` Flag).
- Acceptance (erfüllt):
   - Start aus aktivierten Kampagnen in `Cohorts.jsx`.

## UC-7 Trainer – Szenario aus aktivierter Kampagne/Cohort eröffnen; Spielerübersicht; Rundensteuerung; Auswertung – IMPLEMENTIERT

- Ist‑Stand:
   - Start einer Session: POST `/api/sessions` (vorhanden) mit cohort_id, scenario_id, mode.
   - Steuerung: Trainer.jsx mit Timer/Controls, Status‑Matrix, Live‑Charts.
   - Auswertung: Evaluation/Comparison/Replay vorhanden.
   - „Start aus Kampagne/Cohort“: UI‑Verknüpfung fehlt (siehe UC‑5/6).

- Ziel/Flow:
   1) Im Cohort‑Campaigns Tab: Drill‑down zu Kampagne → geordnete Szenarienliste.
   2) “Open” startet Session (Form: mode, Dauer optional) aus aktivierter Kampagne.
   3) Weiterleitung zu Trainer‑Dashboard; Spielerübersicht/Status live; Links zu Evaluation/Replay.

- Acceptance (erfüllt):
   - Start aus Kampagnenkontext; Live‑Status/Charts in `Trainer.jsx`.

## UC-8 Trainer – Aktives Szenario schließen – IMPLEMENTIERT

- API/UI: PATCH `/api/sessions/:id/end` vorhanden; Button in `Trainer.jsx`.
- Acceptance: Session Status → ended; weitere Aktionen/Timer blockiert; UI zeigt Endzustand.

---

## UC-9 Designer – Fiktives Datum und Startuhrzeit je Szenario festlegen

Status: Nicht unterstützt (NEU)

- Ziel: Ein fiktiver Kalendertag (z. B. 2025‑01‑15) und eine Startuhrzeit (z. B. 08:00) werden in der Szenario‑Config gepflegt und im Briefing/Detail angezeigt (Kontext für Teilnehmer, Zeitachsenbeschriftung).

- Flow:
   1) KSE → Tab General: Felder `fake_date (YYYY‑MM‑DD)` und `start_time (HH:MM)`.
   2) Validierung: Datum/Format korrekt; Zeit 00:00–23:59.
   3) Anzeige: Briefing (`/api/sessions/:id/briefing`) und Campaign Detail zeigen Datum/Zeit; (optional) X‑Achse in Previews mit lokaler Uhrzeit.

- UI Mapping (neu): `KSE.jsx` Felder in General; Briefing Page zeigt Meta.
- API Mapping (neu): Validierung in `backend/app/kse.py` (validate_config), Briefing Response ergänzt Felder.
- Acceptance: Werte werden gespeichert, validiert und an Player/Trainer UI ausgeliefert.

## UC-10 Player – Forecast per Drag&Drop in Chart eingeben

Status: Nicht unterstützt (NEU)

- Ziel: Forecast (MWh/MW) interaktiv als Linie im Zeit‑Chart erfassen; Snap‑to‑Hour; DA/IDM Freeze respektieren; optional per‑Device im Typen‑Kontext.

- Flow:
   1) Player Page: Chart (x=Stunde 1..H, y=Leistung/MWh) mit editierbarer Linie.
   2) Interaktion: Ziehen von Punkten/Segmenten (d3.drag), Doppelklick auf Punkt fügt/entfernt Marker; Tastatur‑Feineinstellung (↑/↓ um Step).
   3) Constraints: Freeze‑Stunden gesperrt (Cursor/Tooltip „locked"); Min/Max/Step validiert (Server/Client).
   4) Speichern: „Save Full Forecast" sendet Linienwerte (Array) an `/api/player/forecast/full`; Submit sendet Slice an `/api/player/forecast`.

- UI Mapping (neu): `frontend/src/pages/Player.jsx` → Komponente `ForecastChartEditor` (SVG/Canvas) mit Tooltips und Rückfall auf Textfelder.
- Acceptance: Linie editierbar, Freeze sichtbar, Werte setzen Textfelder; Speichern/Submit funktioniert mit Validation.

---

## UC-11 Trainer – Cohort bearbeiten und löschen

Status: Teilweise unterstützt (ERWEITERUNG ERFORDERLICH)

- Ist‑Stand:
  - POST `/api/cohorts` – Cohort erstellen (Name, trainer_id)
  - GET `/api/cohorts` – Liste aller Cohorts
  - POST `/api/cohorts/:id/players` – Spieler CSV-Import (Mitglieder hinzufügen)
  - Keine Endpoints zum Umbenennen, Löschen von Cohorts, oder Entfernen einzelner Mitglieder

- Ziel: Trainer kann eine bestehende Cohort umbenennen, Mitglieder einzeln entfernen, oder die gesamte Cohort löschen.

- Flow:
   1) Trainer öffnet „Cohorts" (`/cohorts`) und wählt eine Cohort aus der Liste.
   2) **Bearbeiten**: Button „Edit" öffnet Inline-Editor oder Modal, erlaubt Umbenennung des Cohort-Namens; PATCH `/api/cohorts/:id` { name }.
   3) **Mitglieder entfernen**: In der Mitgliederliste pro Spieler ein „Remove"-Button; DELETE `/api/cohorts/:id/players/:user_id`.
   4) **Cohort löschen**: Button „Delete Cohort" mit Bestätigungsdialog („This will permanently delete the cohort and all memberships. Sessions remain."); DELETE `/api/cohorts/:id`.

- API Mapping (neu):
  - PATCH `/api/cohorts/:id` { name? } → Update Cohort-Name
  - DELETE `/api/cohorts/:id/players/:user_id` → Mitgliedschaft entfernen
  - DELETE `/api/cohorts/:id` → Cohort löschen (cascading delete auf CohortMember, CohortCampaign)

- UI Mapping (neu): `frontend/src/pages/Cohorts.jsx` – Edit/Delete Buttons, Confirm-Dialog
- Acceptance:
  - Trainer kann Cohort-Namen ändern; Änderung wird sofort sichtbar.
  - Einzelne Spieler können aus Cohort entfernt werden (erscheinen nicht mehr in Liste).
  - Cohort kann gelöscht werden; Sessions bleiben erhalten (cohort_id wird nullable oder bleibt referenziert für History).

---

## UC-12 Trainer – Zeitliche Übersicht zu Schüleraktivitäten

Status: Nicht unterstützt (NEU)

- Ziel: Trainer sieht eine Timeline oder Aktivitätsliste für eine Cohort oder Session: Wann haben sich Spieler eingeloggt, wann Forecasts abgegeben, wann haben sie Runden abgeschlossen.

- Flow:
   1) Trainer öffnet „Cohorts" → Detail-Ansicht einer Cohort oder „Trainer" → Session-Detail.
   2) Tab „Activity Log" zeigt chronologische Liste: Timestamp, Spieler, Aktion (login, forecast_submit, round_complete, logout optional).
   3) Filter: Nach Spieler, Zeitraum, Aktionstyp.
   4) Export als CSV optional.

- Datenmodell (neu): Tabelle `activity_log(id, user_id, session_id?, cohort_id?, action_type, timestamp, details jsonb)` oder Activity Events in Redis/Log aggregiert.
- API Mapping (neu):
  - GET `/api/cohorts/:id/activity` → Timeline für Cohort (alle Sessions)
  - GET `/api/sessions/:id/activity` → Timeline für eine Session
  - Optional: GET `/api/activity?user_id=...&session_id=...&from=...&to=...`

- UI Mapping (neu): `frontend/src/pages/Cohorts.jsx` (Activity Tab), `frontend/src/pages/Trainer.jsx` (Session Activity Panel)
- Acceptance:
  - Trainer sieht zeitlich geordnete Liste der Aktivitäten.
  - Filter funktioniert; CSV-Export erzeugt lesbare Datei.
  - Keine Performance-Probleme bei >1000 Events (Pagination/Infinite Scroll).

---

## UC-13 Admin – Gesamtübersicht zur Benutzeraktivität

Status: Nicht unterstützt (NEU)

- Ziel: Admin sieht systemweite Benutzeraktivität: Anzahl aktiver Nutzer (letzte 7/30 Tage), Login-Häufigkeit, Session-Starts, Forecasts, Registrierungen über Zeit.

- Flow:
   1) Admin öffnet „Admin" → Tab „Activity Dashboard".
   2) Metriken: Registrierte Nutzer (Gesamt, pro Rolle), Aktive Nutzer (letzte 7/30 Tage), Sessions gestartet (letzte 7/30 Tage), durchschnittliche Forecasts pro Spieler.
   3) Diagramme: Zeitreihe (Registrierungen, Logins, Sessions pro Tag), Verteilung nach Rolle.
   4) Optional: Liste „Recent Activity" (letzte 50 Aktionen systemweit).

- Datenmodell (bestehend + neu):
  - `users.created_at` → Registrierungen über Zeit
  - `sessions.started_at` → Session-Starts
  - Neue Tabelle `user_activity(id, user_id, action_type, timestamp)` mit Logins/Logout optional (oder aus Activity Log UC-12)

- API Mapping (neu):
  - GET `/api/admin/activity/summary?period=7d|30d` → Aggregat-Metriken
  - GET `/api/admin/activity/timeseries?metric=logins|sessions|registrations&period=30d` → Daten für Chart
  - GET `/api/admin/activity/recent?limit=50` → Letzte Aktionen

- UI Mapping (neu): `frontend/src/pages/AdminUsers.jsx` → neuer Tab „Activity" mit KPI-Cards und Charts (recharts/d3)
- Acceptance:
  - Admin sieht KPIs und Charts auf einen Blick.
  - Zeitreihen laden performant (max 2s bei 10k Events).
  - Keine personenbezogenen Details ohne Datenschutz-Compliance (anonymisierte Ansicht optional).

---

## UC-14 Trainer – Session-Teilnehmer und Spielertypen live sehen

Status: Teilweise unterstützt (ERWEITERUNG ERFORDERLICH)

- Ist‑Stand:
  - Trainer sieht in `Trainer.jsx` Status-Matrix (Spieler × Runde × Status/Score).
  - Briefing API (`/api/sessions/:id/briefing`) liefert `allowed_player_types`, `selected_type` je Spieler (über Redis/DB).
  - Keine dedizierte Ansicht „Wer hat sich mit welchem Typ angemeldet, wer fehlt noch?".

- Ziel: Trainer sieht vor/während Session-Start eine Teilnehmerliste: Welche Spieler der Cohort haben sich angemeldet, welchen Typ gewählt, welche fehlen noch.

- Flow:
   1) Trainer öffnet „Trainer" → Session-Detail oder startet neue Session.
   2) Panel „Participants" zeigt:
      - Liste: Spieler (Name/Email), Status (joined/pending), gewählter Typ (falls joined), Timestamp des letzten Updates.
      - Zusammenfassung: X von Y Spielern angemeldet; Verteilung nach Typ (z. B. „3× Solar, 2× Wind, 1× Gas").
   3) Auto-Refresh (via Websocket oder Polling alle 5s) aktualisiert die Liste.
   4) Button „Refresh" für manuelles Update.

- API Mapping (neu):
  - GET `/api/sessions/:id/participants` → Liste { user_id, email, name?, status: "joined"|"pending", selected_type?, joined_at? }
  - Status „joined" = hat Typ gewählt und Briefing abgerufen; „pending" = Mitglied der Cohort, aber noch nicht in Session aktiv.
  - Nutzt bestehende Daten: `CohortMember`, `SessionPlayerType` (oder Redis `session:X:selected:Y`).

- UI Mapping (neu): `frontend/src/pages/Trainer.jsx` → neues Panel „Participants" (Sticky oder Collapsible Sidebar)
- Acceptance:
  - Trainer sieht Echtzeit-Updates bei Teilnehmer-Join.
  - Fehlende Spieler erkennbar; Verteilung nach Typ visualisiert (optional: Pie Chart).
  - Keine manuelle Session-ID-Eingabe nötig; Daten kommen direkt aus Session-Kontext.

---

## UC-15 Player – Angefangene oder beendete Sessions/Scenarios löschen

Status: Nicht unterstützt (NEU)

- Ziel: Spieler kann eigene Solo-Sessions (Status: running, paused, ended) aus der Liste „My Sessions" entfernen, um Übersichtlichkeit zu wahren. Cohort-Sessions bleiben unberührt (Trainer-Kontrolle).

- Flow:
   1) Player öffnet „Home" → Tab „My Sessions" zeigt Liste (Scenario-Name, Status, Modus, Started At).
   2) Für Solo-Sessions (mode=isolated_per_player): Button „Delete" neben jedem Eintrag.
   3) Bestätigungsdialog: „Delete this session? Your forecasts and results will be permanently removed." (oder Soft-Delete mit `deleted_at`).
   4) Nach Bestätigung: DELETE `/api/player/sessions/:id` → Session wird gelöscht (oder `deleted_at` gesetzt).
   5) Session verschwindet aus Liste; verwandte Forecasts/Results bleiben optional für Archiv oder werden cascading gelöscht.

- API Mapping (neu):
  - DELETE `/api/player/sessions/:id` → Löscht Session (oder Soft-Delete), nur wenn `mode=isolated_per_player` UND `user_id == current_user`.
  - Validation: Verhindere Löschen von Cohort-Sessions (`mode=shared_market` oder cohort_id nicht null).

- UI Mapping (neu): `frontend/src/pages/Home.jsx` → „My Sessions" Tab mit Delete-Button (Confirm-Dialog)
- Acceptance:
  - Spieler kann nur eigene Solo-Sessions löschen; Cohort-Sessions zeigen keinen Delete-Button.
  - Bestätigungsdialog verhindert versehentliches Löschen.
  - Nach Löschung: Session nicht mehr in `/api/me/sessions`; Forecasts optional archiviert oder gelöscht (Designer-Entscheidung).

---

## UC-16 Player – Grafische Timeline der Kampagnen-Szenarien mit Fortschritt

Status: Nicht unterstützt (NEU)

- Ist‑Stand:
  - `CampaignDetail.jsx` zeigt Szenarien als Kartenliste mit Status-Chips (completed/in_progress/not_started).
  - Keine visuelle Timeline oder Bubble-Darstellung zur schnellen Übersicht.

- Ziel: Spieler sieht auf einen Blick den Fortschritt einer Kampagne als horizontale Timeline mit Bubbles (Kreise) für jedes Szenario, farblich kodiert nach Status.

- Flow:
   1) Player öffnet „Campaign Detail" (`/catalog/:id`).
   2) Über der Szenario-Kartenliste erscheint eine horizontale Timeline:
      - Linie mit Bubbles (Kreise) für jedes Szenario in `order_index`-Reihenfolge.
      - Farben: Grün = completed, Orange = in_progress, Grau = not_started.
      - Bubble-Größe: Alle gleich (oder optional größer für aktives Szenario).
      - Label: Szenario-Nummer (#1, #2, ...) im Bubble; Szenario-Name als Tooltip.
   3) Interaktion: Klick auf Bubble scrollt zur entsprechenden Karte in der Liste oder öffnet die Karte direkt.
   4) Optional: Animation beim Laden (Bubbles faden ein, Linie zeichnet sich von links nach rechts).

- UI Mapping (neu): `frontend/src/pages/CampaignDetail.jsx` → neue Komponente `CampaignTimeline` (SVG mit d3.js oder Canvas)
  - Responsive: Horizontaler Scroll bei vielen Szenarien (>10).
  - Accessibility: ARIA-Labels, Keyboard-Navigation (Tab zwischen Bubbles, Enter zum Aktivieren).

- Datenmodell (bestehend): Nutzt vorhandene API-Daten aus `GET /api/catalog/campaigns/:id`:
  - `scenarios[]` mit `order_index`, `status` (not_started|in_progress|completed), `name`

- Acceptance:
  - Timeline zeigt alle Szenarien in korrekter Reihenfolge.
  - Farbkodierung klar erkennbar (Grün/Orange/Grau).
  - Klick auf Bubble führt zur entsprechenden Karte.
  - Timeline funktioniert auf Desktop (1280px+) und Tablet (768px+); Mobile zeigt vereinfachte Liste.
  - Keine Backend-Änderungen erforderlich (nutzt bestehende Catalog API).

---

## UC-17 Admin – Verwaiste Sessions aufräumen

Status: Nicht unterstützt (NEU)

- Ziel: Admin kann Sessions identifizieren und löschen, deren referenzierte Cohort oder Scenario gelöscht wurde (verwaiste Sessions).

- Ist‑Stand:
  - DELETE `/api/kse/scenarios/:id` löscht Scenario, aber Sessions bleiben bestehen (Foreign Key-Constraint verhindert Löschung).
  - Keine UI oder API zum Identifizieren/Bereinigen verwaister Sessions.

- Flow:
   1) Admin öffnet „Admin" → neuer Tab „Session Cleanup".
   2) Liste zeigt:
      - Sessions mit gelöschten Scenarios (scenario_id nicht in scenarios.id).
      - Sessions mit gelöschten Cohorts (cohort_id nicht in cohorts.id).
      - Spalten: Session ID, Scenario ID (missing), Cohort ID (missing), Status, Created At, Player Count.
   3) Checkbox „Select all orphaned sessions".
   4) Button „Delete selected" mit Bestätigung („This will permanently delete X sessions and all related forecasts/results.").
   5) Backend: DELETE `/api/admin/sessions/orphaned` mit optional `{ session_ids: [...] }` oder `all: true`.

- API Mapping (neu):
  - GET `/api/admin/sessions/orphaned` → Liste verwaister Sessions (LEFT JOIN auf scenarios/cohorts, WHERE NULL).
  - DELETE `/api/admin/sessions/orphaned` { session_ids?: [...], all?: bool } → Löscht Sessions inkl. cascading delete auf Forecasts, Results, SessionAllowedType, SessionPlayerType.

- UI Mapping (neu): `frontend/src/pages/AdminUsers.jsx` → neuer Tab „Session Cleanup" mit Tabelle und Bulk-Delete.

- Datenmodell (Änderung):
  - Foreign Keys auf `sessions.scenario_id` und `sessions.cohort_id` ändern zu `ON DELETE SET NULL` oder `ON DELETE CASCADE` (Designer-Entscheidung).
  - Migration: Bestehende verwaiste Sessions identifizieren und bereinigen.

- Acceptance:
  - Admin sieht alle verwaisten Sessions.
  - Bulk-Delete funktioniert; Sessions und Abhängigkeiten werden gelöscht.
  - Keine falschen Positives (nur tatsächlich verwaiste Sessions).

---

## UC-18 Designer – Sessions zu einem Scenario ansehen

Status: Nicht unterstützt (NEU)

- Ziel: Designer kann für ein Scenario alle bestehenden Sessions einsehen (inkl. Spieler, Cohort, Erstelldatum, Status) zur Kontrolle und Analyse.

- Flow:
   1) Designer öffnet „Scenarios" (`/designer/scenarios`) und wählt ein Scenario aus der Liste.
   2) Button „View Sessions" öffnet Detail-Ansicht oder Drawer.
   3) Tabelle zeigt:
      - Session ID, Cohort-Name, Status (running/paused/ended), Modus (solo/shared), Created At, Player Count.
      - Spieler-Liste (expandierbar): Email, gewählter Typ (falls shared_market), Forecasts eingereicht (Anzahl).
   4) Filter: Nach Status, Cohort, Zeitraum.
   5) Optional: Export als CSV.

- API Mapping (neu):
  - GET `/api/kse/scenarios/:id/sessions?status=...&cohort_id=...&from=...&to=...` → Liste der Sessions für dieses Scenario.
  - Response: `{ sessions: [{ id, cohort_id, cohort_name, status, mode, started_at, player_count, players: [{ user_id, email, type_id?, forecast_count }] }] }`

- UI Mapping (neu): `frontend/src/pages/DesignerScenarios.jsx` → neuer Button „View Sessions" (öffnet Modal oder neue Seite `ScenarioSessions.jsx`).

- Acceptance:
  - Designer sieht alle Sessions zu einem Scenario.
  - Spieler-Details expandierbar; Filter funktioniert.
  - Performance: <2s bei 100+ Sessions pro Scenario (Pagination).

---

## UC-19 Designer – Kampagnen und Szenarien löschen mit Cascade

Status: Teilweise unterstützt (ERWEITERUNG ERFORDERLICH)

- Ist‑Stand:
  - DELETE `/api/kse/scenarios/:id` – Scenario löschen (existiert, aber Sessions bleiben bestehen → Foreign Key-Fehler oder orphaned sessions).
  - Keine DELETE-API für Campaigns.
  - Keine UI-Option zum Löschen von Campaigns.
  - Keine cascading delete auf Sessions beim Löschen eines Scenarios.

- Ziel: Designer kann Kampagnen und Szenarien löschen; Sessions zu gelöschten Szenarien werden automatisch mitgelöscht (cascading delete).

- Flow:
   1) **Campaign löschen**:
      - Designer öffnet „Campaigns" (`/designer/campaigns`).
      - Button „Delete" neben Kampagne mit Bestätigung („Delete campaign? This will remove all scenario assignments but NOT delete the scenarios themselves.").
      - DELETE `/api/kse/campaigns/:id` → Löscht Campaign und CampaignScenario-Zuordnungen; Scenarios bleiben.
   
   2) **Scenario löschen mit Sessions**:
      - Designer öffnet „Scenarios" (`/designer/scenarios`).
      - Button „Delete" neben Scenario.
      - Warnung: „This scenario has X active sessions. Deleting will also delete all sessions, forecasts, and results. Continue?"
      - Bei Bestätigung: DELETE `/api/kse/scenarios/:id?cascade=true` → Löscht Scenario inkl. cascading delete auf Sessions, Forecasts, Results, PlayerProgress.

- API Mapping (neu/erweitert):
  - DELETE `/api/kse/campaigns/:id` → Löscht Campaign + CampaignScenario; Scenarios bleiben.
  - DELETE `/api/kse/scenarios/:id?cascade=true` → Löscht Scenario + Sessions (mit Forecasts, Results, SessionAllowedType, SessionPlayerType, PlayerProgress).
  - GET `/api/kse/scenarios/:id/session-count` → Anzahl aktiver/beendeter Sessions zu diesem Scenario (für Warnung).

- UI Mapping (neu):
  - `DesignerCampaigns.jsx` → Delete-Button mit Confirm-Dialog.
  - `DesignerScenarios.jsx` → Erweiterte Delete-Logik: API-Call zum Prüfen der Session-Anzahl, Warnung anzeigen, cascade=true senden.

- Datenmodell (Änderung):
  - Foreign Key `sessions.scenario_id` ändern zu `ON DELETE CASCADE` (oder Soft-Delete mit `deleted_at` für Archivierung).
  - Migration: Bestehende Daten bereinigen oder migrieren.

- Acceptance:
  - Campaign löschen entfernt Zuordnungen; Scenarios bleiben.
  - Scenario löschen mit Sessions zeigt Warnung und löscht alles bei Bestätigung.
  - Keine verwaisten Sessions nach Scenario-Löschung (außer explizit gewünscht).

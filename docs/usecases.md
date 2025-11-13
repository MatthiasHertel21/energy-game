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
   3) Constraints: Freeze‑Stunden gesperrt (Cursor/Tooltip „locked“); Min/Max/Step validiert (Server/Client).
   4) Speichern: „Save Full Forecast“ sendet Linienwerte (Array) an `/api/player/forecast/full`; Submit sendet Slice an `/api/player/forecast`.

- UI Mapping (neu): `frontend/src/pages/Player.jsx` → Komponente `ForecastChartEditor` (SVG/Canvas) mit Tooltips und Rückfall auf Textfelder.
- Acceptance: Linie editierbar, Freeze sichtbar, Werte setzen Textfelder; Speichern/Submit funktioniert mit Validation.

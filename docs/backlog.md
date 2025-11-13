# EMSG Backlog (migrated from UI Requests) — 2025-11-10

This backlog consolidates all actionable UI/UX work from the former `docs/ui-requests.md`, grouped by priority. Each item has a brief description, target files, and acceptance criteria. UI remains English-only for MVP.

Legend
- P0: Immediate (MVP enabling)
- P1: High priority (MVP polish/completeness)
- P2: Medium priority (post-MVP polish)
- W*: Scoped “Wow” enhancements
- WB*: Larger “Wow backlog” slices

---

## P0 — Immediate

Status (2025-11-11): All P0 items completed.

1) Student entry and navigation (Home) — Done 2025-11-11
- Problem: No Home/My Scenarios; players need manual routes.
- Action: Add `Home / My Scenarios` with scenario list and CTAs (Briefing, Play/Resume, Reports). Default `/` → player→Home; admin/designer/trainer → role-specific.
- Target files: `frontend/src/App.jsx`, `frontend/src/pages/Home.jsx` (new), `frontend/src/pages/Briefing.jsx` (stub)
- Acceptance: After login as player, Home shows scenario cards (placeholder ok), no manual IDs to begin.

2) Round Editor UX (Player) — Done 2025-11-11
- Problem: Manual session/round inputs; no timer/feedback.
- Action: Derive active session/round via API; add countdown with T-30s warning; simple chart and live KPIs placeholder; block invalid submit; toasts.
- Target files: `frontend/src/pages/Player.jsx`
- Acceptance: Player cannot submit without active session; sees remaining time; gets success/error toast.

3) Error handling + 404 — Done 2025-11-11
- Problem: No global toast; no 404 route.
- Action: Add app-wide Snackbar/Alert provider; add `/404` and fallback `*` route.
- Target files: `frontend/src/components/SnackbarProvider.jsx` (new), `frontend/src/components/NotFound.jsx` (new), `frontend/src/App.jsx`
- Acceptance: API failures surface consistent toasts; unknown routes show 404 with Home link.

4) Auth flow and copy consistency (English) — Done 2025-11-11
- Problem: Mixed DE/EN; unclear first-user-admin note; role redirects vary.
- Action: Unify copy (EN); Register note “The first user becomes admin.”; deterministic role redirects.
- Target files: `frontend/src/pages/Login.jsx`, `frontend/src/pages/Register.jsx`, `frontend/src/App.jsx`
- Acceptance: Labels/tooltips in English; routing deterministic per role.

5) KSE – Struktur, Orientierung, Lesbarkeit (NEW)
- Problem: Tabs sind überladen; viele Felder passen nicht in eine Zeile; fehlende visuelle Hierarchie.
- Action:
	- Zweispaltiges Formular-Grid (MUI Grid: sm=12, md=6, lg=4). Max content width = lg, spacing 2–3.
	- Progressive Disclosure: „Advanced Settings“ pro Sektion (Accordion) – Standard nur Kernfelder sichtbar.
	- Sticky Action Bar (unten) für Save/Validate/Export + rechts ein Sticky „Validation Panel“ mit Fehlerliste und Deep-Links.
	- Sektionen mit klaren Überschriften + 1‑Zeilen‑Guidance.
- Target files: `frontend/src/pages/KSE.jsx` (+ neue Komponenten `FormSection`, `StickyActions`, `ValidationPanel`).
- Acceptance:
	- Kein horizontaler Scroll bei md≥1280px; Felder/HelperTexts nicht abgeschnitten.
	- Max. 7 sichtbare Kernfelder pro Sektion; Advanced vollständig einklappbar.
	- Fehlerliste klickbar → scrollt zum Feld; CTAs bleiben beim Scrollen sichtbar.

---

## P1 — High Priority

Status (2025-11-11): 5, 6, 7, 8 completed. PT1–PT3 (Player Types) completed in Sprint 9.

5) AppBar and navigation clarity — Done 2025-11-11
- Problem: No user menu/logout clarity; no active state.
- Action: Add right-aligned user menu (email, role, logout); highlight current route; add Home for players.
- Target files: `frontend/src/App.jsx`, `frontend/src/components/UserMenu.jsx` (new)
- Acceptance: Active nav visible; logout consistently placed.

6) Admin Users table ergonomics — Done 2025-11-11
- Problem: No pagination/search; heavy refresh on role change.
- Action: Add search by email; pagination (client-side now, server later); optimistic role update with inline feedback.
- Target files: `frontend/src/pages/AdminUsers.jsx`
- Acceptance: Admin can quickly find/update roles; table scales toward 1k users.

### P1 – Catalog & Campaigns (UC-1, UC-9, UC-10) — ✅ Completed (Sprint 9-10, 2025-11-13)

9) Campaigns & Catalog – Player selection and Solo Sessions — ✅ Done
- Problem: Spieler können keine Kampagnen/Scenarios bibliotheksartig entdecken/starten; Solo‑Sessions fehlen.
- Status: ✅ Fully implemented
  - Backend: Catalog API, Solo Sessions API, Player Progress tracking
  - Frontend: Catalog.jsx, CampaignDetail.jsx with "Play Solo" button
  - Features: Published campaigns, progress tracking, solo/cohort mode selection

10) Campaign Management – n:m Zuordnung, Reihenfolge, Bild, Publish — ✅ Done
- Problem: Spieler können keine Kampagnen/Scenarios bibliotheksartig entdecken/starten; Solo‑Sessions fehlen.
- Scope:
	- Backend
		- GET `/api/catalog/campaigns` (auth: player+) → list published campaigns, ordered by designer (fields: id, name, description, cover_image_url, scenarios_count, progress[completed/total]).
		- GET `/api/catalog/campaigns/:id` → campaign detail incl. ordered scenarios array with per‑scenario flags `{ scenario_id, name, order_index, solo_enabled, cohort_enabled }`.
		- POST `/api/player/solo-sessions` → start solo session for `scenario_id` if at least one published campaign links that scenario with `solo_enabled=true`; creates `Session` with `mode=isolated_per_player` and ephemeral cohort (or null cohort if supported) scoped to the player.
		- Player progress tracking: table `player_progress(user_id, campaign_id, scenario_id, status[not_started|in_progress|completed], started_at, completed_at)`. Auto‑update on session end.
	- Frontend
		- New pages: `Catalog.jsx` (grid of published campaigns) and `CampaignDetail.jsx` (scenario list in designer‑Reihenfolge, Fortschritt je Scenario, Buttons: "Play solo" wenn `solo_enabled`; Hinweis "Join trainer session" wenn `cohort_enabled` und aktive Sessions vorhanden; Auswahl nach Cohort, falls mehrere offen).
		- Player Home: Link auf Catalog, Anzeige Progress (Badge) neben Kampagnennamen.
	- Acceptance
		- Spieler sieht alle published Kampagnen, geordnet; kann Details öffnen und ein Szenario als Solo starten, wenn erlaubt.
		- Wenn mehrere Trainer‑Sessions desselben Szenarios laufen, Auswahl nach Cohort (Dialog/Select).
		- Fortschritt pro Spieler wird aktualisiert (in_progress nach Start, completed nach Abschluss einer Session des Szenarios).

10) Campaign Management – n:m Zuordnung, Reihenfolge, Bild, Publish — ✅ Done
- Problem: Designer können keine Kampagnen verwalten (Bild/Publish), Szenarien mehrfach zuordnen, Reihenfolge/Spielbarkeit steuern.
- Status: ✅ Fully implemented
  - Backend: Campaign-Scenario n:m table, image upload API, publish toggle
  - Frontend: DesignerCampaigns.jsx with drag-drop reorder, cover upload, flags
  - Features: Multi-campaign scenarios, custom ordering, solo/cohort flags per scenario

11) Uploads & Static Serving (Support) — ✅ Done
- Scope: Backend `/uploads` static route, image validation, Docker volume mount, Traefik routing
- Status: ✅ Implemented and deployed
- Acceptance: Cover images served via `/uploads/campaigns/`, validation enforced (PNG/JPG, max 640×640, 512KB)

18) Trainer – Cohort×Campaign Visibility/Activation (Model+API+UI) — ✅ Done (Sprint 10)

18b) Designer – Events Editor Refactor — ✅ Done (Sprint 11 Optional)
	- Problem: Event‑Parameter überladen im Inline‑Form; schlechte Übersicht.
	- Status: ✅ Implemented
		- Components: `frontend/src/components/events/EventsList.jsx` (NEW), `EventEditor.jsx` (NEW)
		- Features: Table view with Name/Type/Trigger/Duration/Target/Impact columns, Edit/Duplicate/Delete actions
		- EventEditor: Drawer with 4 tabs (Basics | Trigger | Target | Effect), uses NumberInput/RangeInput
		- Integration: KSE.jsx Events tab refactored from inline forms to EventsList + EventEditor
	- Action: Liste (Name, Typ, Trigger, Dauer, Ziel, Wirkung) mit Aktionen Edit/Delete/Duplicate; Edit in rechtem Drawer/Modal mit Tabs (Basics | Trigger | Target | Effect); Presets (7 Default‑Events) + Suche/Filter.
	- Target files: `frontend/src/pages/KSE.jsx` (Refactor), evtl. `frontend/src/components/events/*` (neu).
	- Acceptance: ✅ Erstellen/Bearbeiten ohne Überlänge; Duplikat in ≤2 Klicks; klare Spaltenübersicht.
	- Note: Event presets deferred as optional future enhancement

	13) Devices‑Editor – Karten + Expand — ✅ Done (Sprint 11 Extension)
	- Problem: Parametrisierung aller Devices als lange Liste; geringe Erfassbarkeit.
	- Status: ✅ Implemented
		- Component: `frontend/src/components/devices/DeviceCard.jsx` (NEW)
		- Presets: `frontend/src/components/devices/devicePresets.js` (NEW)
		- Features: Expandable cards with type-specific icons, Duplicate/Delete, preset menu
		- Integration: KSE Player Types tab uses DeviceCard, max 1 expanded
	- Acceptance: ✅ Max 1 Expanded Card, Add in ≤2 Klicks, Validierungsstatus pro Karte sichtbar (Error‑Badge).

	14) ATC‑Matrix – Vollbild‑Modal + CSV — ✅ Done (Sprint 11)
	- Problem: Matrix Editing ist eng; Symmetrie kopieren fehleranfällig.
	- Status: ✅ Implemented
		- Component: `frontend/src/components/grid/AtcEditor.jsx` (NEW)
		- Features: Fullscreen dialog, sticky headers, symmetry lock, CSV import/export
		- Integration: KSE.jsx Grid tab has "Edit Matrix" button
	- Acceptance: ✅ Editieren ohne horizontalen Scroll; Symmetrie garantiert; CSV Import/Export in ≤3 Klicks.

	15) Feldarten vereinheitlichen + Mikrocopy straffen + Empty States — ✅ Extended (Sprint 11)
	- Problem: Uneinheitliche Eingaben (freie Zahl vs. Range); zu lange Tooltips; leere Bereiche ohne Guidance.
	- Status: ✅ NumberInput and RangeInput extended to Market tab
		- Components: `frontend/src/components/inputs/NumberInput.jsx`, `RangeInput.jsx`
		- Integration: General tab (horizon, forecast, rounds), Market tab (base_price, base_volume, floor, cap), Player Types tab (all device parameters)
		- Remaining: Environment tab numeric fields, tooltip review, EmptyStates audit
	- Acceptance: Partial - Number fields have steppers and units across 3 tabs; Range sliders for percentages; tooltips and EmptyStates need full review.

	16) Designer – Scenarios Index (Liste, Suche, Edit‑DeepLink) — ✅ Done (Sprint 11)
	- Problem: Designer hat keine zentrale Liste zur Auswahl/Bearbeitung bestehender Szenarien.
	- Status: ✅ Enhanced from existing page
		- File: `frontend/src/pages/DesignerScenarios.jsx` (enhanced)
		- Features: Table view, search, pagination, Edit/Duplicate/Export/Delete actions
		- Navigation: Already at `/designer/scenarios`
	- Acceptance: ✅ Edit öffnet bestehendes Szenario; UI performant bei 100+ Szenarien.

	17) Designer – Scenario Delete (UI) — ✅ Done (Sprint 11)
	- Problem: Globales Löschen existiert nur via API, nicht in der UI.
	- Status: ✅ Implemented in DesignerScenarios.jsx
		- Features: Delete IconButton with Material-UI confirmation dialog
		- Error handling: Shows backend errors (e.g., "in use by campaigns")
		- Toast feedback: Success/error snackbar after deletion
	- Acceptance: ✅ Szenario verschwindet aus Liste; nicht mehr abrufbar.

	18) Trainer – Cohort×Campaign Visibility/Activation — ✅ Done (Sprint 10)
	- Problem: Trainer kann nicht steuern, welche Kampagnen pro Cohort sichtbar/aktiv sind.
	- Status: ✅ Implemented
		- DB: Tabelle `cohort_campaigns` (cohort_id, campaign_id, visible, active)
		- API: GET/PATCH `/api/cohorts/:id/campaigns/:cid`
		- UI: Cohorts.jsx with Campaigns table and Visible/Active toggles
	- Acceptance: ✅ Player see only visible campaigns; Start only from active campaigns

	19) Trainer – Start from Campaign (Cohort Context) — ✅ Done (Sprint 10)
	- Problem: Start einer Session ist nicht an Kampagnenkontext gekoppelt.
	- Status: ✅ Implemented in Cohorts.jsx
		- Drill-down from Campaigns tab to scenario list
		- "Open" button starts session with mode selection
		- Direct navigation to Trainer dashboard
	- Acceptance: ✅ Start in ≤2 clicks from campaign context

	20) KSE – Fiktives Datum & Startuhrzeit je Szenario — ✅ Done (Sprint 12)
	- Problem: Szenarien haben keine kontextuelle Tages-/Zeitangabe; Briefings/Charts sind weniger anschaulich.
	- Status: ✅ Implemented
		- Backend: `backend/app/kse.py` validates YYYY-MM-DD and HH:MM formats (regex)
		- Frontend: `frontend/src/pages/KSE.jsx` General tab with type="date" and type="time" inputs
		- Optional fields, stored in config.general.fake_date and config.general.start_time
	- Acceptance: ✅ Werte werden korrekt gespeichert/validiert; Frontend zeigt Date/Time Picker.

	21) Player – Drag&Drop Forecast Chart Editor (NEW)
	- Problem: Stundenweise Eingabe als Textfelder ist langsam/fehleranfällig; keine direkte visuelle Kontrolle.
	- Action:
		- Neue Komponente `ForecastChartEditor` (SVG d3.js oder Canvas) in `Player.jsx`:
			- Editierbare Linie (x=Stunde, y=MWh/MW), Punkte ziehbar (d3.drag), Snap‑to‑Hour, Tooltip, Keyboard‑Steps.
			- Respektiert Freeze‑Hours (locked Bereiche), Min/Max/Step Constraints (Device‑abhängig, falls per‑Device aktiv) und globale Validierung.
			- Two‑way‑Binding: Linie ↔ Array/Textfelder.
	- Acceptance: Intuitive Eingabe per Drag&Drop; Freeze‑Segmente gesperrt; Speichern/Submit funktioniert wie zuvor.

7) Trainer — Live session control — Done 2025-11-11
- Problem: Log-only feedback; no player×round×status table; no disabled states.
- Action: Add status table; disable invalid controls; auto-scroll logs; show session meta (scenario, cohort, round).
- Target files: `frontend/src/pages/Trainer.jsx`
- Acceptance: Trainer sees real-time status; cannot perform invalid actions.

8) KSE — Editor usability — Done 2025-11-11
- Problem: Validation summary only; matrix editing lacks guidance.
- Action: Field-level hints; disable Save until valid; ATC headers and symmetric lock; clarify Preview (units/assumptions).
- Target files: `frontend/src/pages/KSE.jsx`
- Acceptance: Errors easy to fix; ATC editing safe and clear.

---

## P2 — Medium Priority (Sprint 10 focus)

9) Global theming and readability — Done 2025-11-11
- Action: Set consistent Container maxWidth, spacing, typography rhythm; optional dark mode toggle.
- Target files: `frontend/src/theme.js`, `frontend/src/App.jsx`
- Acceptance: Consistent layout/typography across pages.

10) Accessibility and keyboard support
- Action: Labels for all inputs, roles for interactive elements, visible focus; ESC closes dialogs; Enter submits.
- Target: Global pass across `src/pages/*`, `src/components/*`
- Acceptance: Basic WCAG AA in forms and navigation.

11) Microcopy and guidance
- Action: Helper texts/tooltips for key inputs; empty states for Admin/Trainer tables.
- Target files: `frontend/src/components/*`, affected pages
- Acceptance: First-time users can proceed without external docs.

12) Mini‑TOC/Anker + Breadcrumb + A11y‑Pass (NEW)
- Action: Mini Inhaltsverzeichnis je Tab (Sprunglinks zu Sektionen); Breadcrumb (KSE > Scenario > Tab > Section); ARIA‑Labels an IconButtons/Drawers/Modals; Enter/ESC‑Handling; Fokus sichtbar.
- Target files: `frontend/src/pages/KSE.jsx`, globale Keyboard‑Handler, `components/*` Toolbars/Drawers.
- Acceptance: Sprunglinks funktionieren; Axe‑Audit ohne kritische Fehler; Enter submit, ESC schließt Modal/Drawer; Fokusreihenfolge korrekt.

---

## W — Scoped “Wow” Enhancements

W1) Design tokens and theme
- Files: `frontend/src/theme.js`, `frontend/src/styles/tokens.css` (new)

W2) Iconography and navigation affordances
- Files: `frontend/src/App.jsx`, table/action icon buttons

W3) Data visualization uplift (first slice)
- Files: `frontend/src/pages/KSE.jsx`, `frontend/src/pages/Player.jsx`

W4) Motion and micro-interactions
- Files: `frontend/src/components/*`

W5) Dark mode toggle
- Files: `frontend/src/App.jsx`, `frontend/src/theme.js`

W6) Skeletons and empty states
- Files: `frontend/src/components/*`

Acceptance across W: Visual polish, performance retained, reduced motion respected.

W10) Wizard „Create Scenario“ (optional)
- Action: 5‑Schritt‑Wizard (General → Market → Grid → Events → Review) mit Validierungsstopps und „Back/Next“. Autosave Draft + Draft‑Badge.
- Acceptance: Vollständiges Szenario in < 5 Minuten erstellbar; Validierungsfehler blocken Next; Draft sichtbar.

W11) Autosave & Undo/Redo (optional)
- Action: Form‑Autosave im localStorage (key per scenario draft); Undo/Redo auf Feldgruppebene (History Stack pro Tab).
- Acceptance: Kein Datenverlust bei Refresh; Undo/Redo je Tab verfügbar.

---

## WB — Larger “Wow backlog” slices

WB1) Brand & Landing (M) — assets + landing/hero
WB2) Advanced data visualization (L) — DA/IDM/Balance chart, overlays, exports, ATC map
WB3) Onboarding & guidance (M) — walkthrough, contextual tooltips
WB4) Gamification & feedback (S) — progress bars, celebration
WB5) Motion system (S) — route/page transitions
WB6) A11y & mobile polish (M) — WCAG AA, keyboard shortcuts
WB7) Robustness & performance (M) — ErrorBoundary, code-splitting, web vitals
WB8) PWA & analytics (M) — Workbox, manifest, vitals (privacy)
WB9) Design system docs (S) — Storybook or doc page

Each WB item contains deliverables/acceptance in the original request; scope to be sliced during planning.

---

## Rollout notes
- Non-breaking; can be shipped incrementally via routes/components.
- Suggested order: P0 → P1 → P2; weave W1/W6 into P0/P1; schedule WB in later sprints.

### P1 – Player Types & Selection (PT1–PT3) — Completed (Sprint 9)

PT1) KSE: Define Player Types per Scenario
- Problem: No constrained player archetypes; devices apply globally.
- Action: Add `player_types[]` to scenario config in KSE; map devices to each type; validation of ids and device references.
- Target files: `frontend/src/pages/KSE.jsx`, `backend/app/kse.py` (validation)
- Acceptance: Designer can add/edit/remove types; config saves; validation errors shown inline.

PT2) Trainer: Allowlist + Caps per Type (shared_market)
- Problem: In shared sessions, trainer cannot limit selectable types or balance participants.
- Action: Extend session start to accept `allowed_player_types[]` with optional `max_players`; persist selection.
- Target files: `backend/app/sessions.py`, DB migration (session_player_types table or JSON), `frontend/src/pages/Trainer.jsx` (start form)
- Acceptance: Trainer can pick allowed types and caps; API rejects invalid/cap-over limits; briefing exposes allowed list.

PT3) Player: Pre-Session Type Selection
- Problem: Players join sessions without choosing a type; inputs not constrained.
- Action: Add pre-start selection UI; enforce capacity; lock choice for session; brief which devices they will control.
- Target files: `frontend/src/pages/Home.jsx` or join dialog, `backend/app/player.py` (store selection), DB migration
- Acceptance: Player must select a type from allowed list; type shown in UI; validation prevents over-capacity or invalid types.

### Sprint 10 – Testing & Performance (New)

12) E2E Stabilisierung Trainer/Player-Type Flow
- Action: Tests für Allowed Types + Caps, Player‑Type Auswahl, Device‑Eingabe, Submit. Replay‑E2E stabilisieren.
- Acceptance: E2E grün, geringe Flakiness.

13) Performance / Load (Locust)
- Action: 80 Spieler (Websocket + Forecast‑POST), p95 < 2s; kleine Backend‑Optimierungen falls nötig.
- Acceptance: Report dokumentiert, Schwellen eingehalten.

---

## P2 — Medium Priority (Sprint 11+ focus)

### P2 – Cohort Management & Activity Tracking (UC-11, UC-12, UC-13, UC-14, UC-15)

22) Trainer – Cohort bearbeiten und löschen (UC-11) — ✅ Done (Sprint 12)
- Problem: Keine Möglichkeit, Cohort-Namen zu ändern, einzelne Mitglieder zu entfernen oder Cohort zu löschen.
- Status: ✅ Implemented
  - Backend: `backend/app/cohorts.py` - 4 new endpoints
    - PATCH `/api/cohorts/:id` { name? } → Update Cohort-Name
    - GET `/api/cohorts/:id/players` → List members with email/name
    - DELETE `/api/cohorts/:id/players/:user_id` → Mitgliedschaft entfernen
    - DELETE `/api/cohorts/:id` → Cohort löschen (cascading delete auf CohortMember, CohortCampaign; Sessions bleiben)
  - Frontend: `frontend/src/pages/Cohorts.jsx` → Edit/Delete IconButtons, Confirm-Dialogs, Members Table
- Acceptance:
  - ✅ Trainer kann Cohort umbenennen; Änderung sofort sichtbar.
  - ✅ Einzelne Spieler können entfernt werden.
  - ✅ Cohort kann gelöscht werden; Sessions bleiben für History erhalten.

23) Trainer – Zeitliche Übersicht zu Schüleraktivitäten (UC-12) — 🚧 Planned (Sprint 13)
- Problem: Keine Einsicht, wann Spieler sich eingeloggt haben, Forecasts abgegeben, Runden abgeschlossen haben.
- Status: 🚧 Planned for Sprint 13
- Action:
  - Backend:
    - Neue Tabelle `activity_log(id, user_id, session_id, cohort_id, action_type, timestamp, details jsonb)`
    - Actions: login, forecast_submit, round_complete, session_join, type_select
    - GET `/api/cohorts/:id/activity?from=...&to=...&user_id=...&action_type=...` → Timeline
    - GET `/api/sessions/:id/activity` → Timeline für Session
    - CSV Export: GET `/api/cohorts/:id/activity?format=csv`
  - Frontend: `Cohorts.jsx` → neuer Tab „Activity", `Trainer.jsx` → Activity Panel
    - Chronologische Liste mit Filter (Spieler, Zeitraum, Aktionstyp)
    - Export-Button
- Acceptance:
  - Trainer sieht zeitlich geordnete Aktivitäten.
  - Filter funktioniert; CSV-Export erzeugt lesbare Datei.
  - Performance: Pagination/Infinite Scroll bei >1000 Events.

24) Admin – Gesamtübersicht zur Benutzeraktivität (UC-13) — 🚧 Planned (Sprint 13)
- Problem: Keine systemweite Sicht auf Benutzeraktivität (Registrierungen, Logins, Sessions, Forecasts).
- Status: 🚧 Planned for Sprint 13 (depends on UC-23)
- Action:
  - Backend:
    - GET `/api/admin/activity/summary?period=7d|30d` → KPIs (registered users, active users, sessions started, avg forecasts)
    - GET `/api/admin/activity/timeseries?metric=logins|sessions|registrations&period=30d` → Chart-Daten
    - GET `/api/admin/activity/recent?limit=50` → Letzte Aktionen systemweit
    - Nutzt `activity_log` (UC-12) + `users.created_at`, `sessions.started_at`
  - Frontend: `AdminUsers.jsx` → neuer Tab „Activity Dashboard"
    - KPI-Cards (Total Users, Active 7d/30d, Sessions Started, Avg Forecasts)
    - Charts: Registrierungen/Logins/Sessions über Zeit (recharts/d3)
    - Recent Activity Liste
- Acceptance:
  - Admin sieht KPIs und Charts auf einen Blick.
  - Zeitreihen laden performant (max 2s bei 10k Events).
  - Datenschutz: Optional anonymisierte Ansicht.

25) Trainer – Session-Teilnehmer und Spielertypen live sehen (UC-14)
- Problem: Keine dedizierte Ansicht „Wer hat sich angemeldet, wer fehlt noch, welche Typen wurden gewählt?".
- Action:
  - Backend:
    - GET `/api/sessions/:id/participants` → Liste { user_id, email, name, status: "joined"|"pending", selected_type?, joined_at? }
    - „joined" = hat Typ gewählt und Briefing abgerufen; „pending" = Mitglied, aber noch nicht aktiv
    - Nutzt `CohortMember`, `SessionPlayerType` (oder Redis)
  - Frontend: `Trainer.jsx` → neues Panel „Participants" (Sticky oder Collapsible Sidebar)
    - Liste: Spieler, Status, Typ, Timestamp
    - Zusammenfassung: X von Y angemeldet; Verteilung nach Typ (optional: Pie Chart)
    - Auto-Refresh via Websocket oder Polling (5s)
- Acceptance:
  - Trainer sieht Echtzeit-Updates bei Teilnehmer-Join.
  - Fehlende Spieler erkennbar; Verteilung nach Typ visualisiert.

26) Player – Angefangene oder beendete Sessions löschen (UC-15) — ✅ Done (Sprint 12)
- Problem: Spieler können Solo-Sessions nicht aus der Liste entfernen; Unübersichtlichkeit.
- Status: ✅ Implemented
  - Backend: `backend/app/player.py`
    - DELETE `/api/player/sessions/:id` → Löscht Session (hard delete)
    - Validation: Nur `mode=isolated_per_player` UND `user_id == current_user`; 403 Forbidden für Cohort-Sessions
    - Cascading delete auf Forecasts
  - Frontend: `frontend/src/pages/Home.jsx`
    - "Solo" Chip badge für isolated_per_player sessions
    - Delete IconButton nur für Solo-Sessions (ended oder created status)
    - Confirmation Dialog mit Warning über permanente Löschung
- Acceptance:
  - ✅ Spieler kann nur eigene Solo-Sessions löschen; Cohort-Sessions zeigen keinen Delete-Button.
  - ✅ Bestätigungsdialog verhindert versehentliches Löschen.
  - ✅ Nach Löschung: Session nicht mehr in `/api/me/sessions`.

27) Player – Grafische Timeline der Kampagnen-Szenarien mit Fortschritt (UC-16) — 🚧 Planned (Sprint 13)
- Problem: Spieler sehen Szenarien nur als Kartenliste; keine schnelle visuelle Übersicht über Kampagnen-Fortschritt.
- Status: 🚧 Planned for Sprint 13
- Action:
  - Frontend: `CampaignDetail.jsx` → neue Komponente `CampaignTimeline` (SVG mit d3.js oder Canvas)
    - Horizontale Timeline mit Bubbles (Kreise) für jedes Szenario in `order_index`-Reihenfolge
    - Farben: Grün = completed, Orange = in_progress, Grau = not_started
    - Bubble-Größe: Alle gleich (oder optional größer für aktives Szenario)
    - Label: Szenario-Nummer (#1, #2, ...) im Bubble; Szenario-Name als Tooltip
    - Klick auf Bubble scrollt zur entsprechenden Karte oder expandiert sie
    - Optional: Lade-Animation (Bubbles faden ein, Linie zeichnet sich von links)
  - Responsive: Horizontaler Scroll bei >10 Szenarien; Mobile zeigt vereinfachte Liste
  - Accessibility: ARIA-Labels, Keyboard-Navigation (Tab, Enter)
  - Keine Backend-Änderungen (nutzt bestehende `GET /api/catalog/campaigns/:id`)
- Acceptance:
  - Timeline zeigt alle Szenarien in korrekter Reihenfolge mit Farbkodierung.
  - Klick auf Bubble führt zur entsprechenden Karte.
  - Funktioniert auf Desktop/Tablet (768px+); Mobile zeigt alternative Ansicht.
  - Performance: <200ms Rendering bei 20 Szenarien.

28) Admin – Verwaiste Sessions aufräumen (UC-17)
- Problem: Gelöschte Scenarios/Cohorts hinterlassen verwaiste Sessions; keine UI zum Bereinigen.
- Action:
  - Backend:
    - GET `/api/admin/sessions/orphaned` → Liste verwaister Sessions (LEFT JOIN scenarios/cohorts, WHERE NULL)
    - DELETE `/api/admin/sessions/orphaned` { session_ids?: [...], all?: bool } → Cascading delete auf Forecasts, Results, SessionAllowedType, SessionPlayerType
    - Migration: Foreign Keys auf `sessions.scenario_id`/`cohort_id` ändern zu `ON DELETE SET NULL` oder `ON DELETE CASCADE`
  - Frontend: `AdminUsers.jsx` → neuer Tab „Session Cleanup"
    - Tabelle: Session ID, Scenario ID (missing), Cohort ID (missing), Status, Created At, Player Count
    - Checkbox „Select all orphaned sessions"
    - Button „Delete selected" mit Bestätigung
- Acceptance:
  - Admin sieht alle verwaisten Sessions.
  - Bulk-Delete funktioniert; keine falschen Positives.
  - Sessions und Abhängigkeiten werden komplett gelöscht.

29) Designer – Sessions zu einem Scenario ansehen (UC-18)
- Problem: Designer kann nicht sehen, welche Sessions zu einem Scenario laufen; keine Kontrolle/Analyse.
- Action:
  - Backend:
    - GET `/api/kse/scenarios/:id/sessions?status=...&cohort_id=...&from=...&to=...` → Sessions für Scenario
    - Response: `{ sessions: [{ id, cohort_id, cohort_name, status, mode, started_at, player_count, players: [{ user_id, email, type_id?, forecast_count }] }] }`
  - Frontend: `DesignerScenarios.jsx` → Button „View Sessions" (Modal oder neue Seite `ScenarioSessions.jsx`)
    - Tabelle: Session ID, Cohort, Status, Modus, Created At, Player Count
    - Expandierbare Spieler-Liste: Email, Typ, Forecasts
    - Filter: Status, Cohort, Zeitraum
    - Optional: CSV Export
- Acceptance:
  - Designer sieht alle Sessions zu einem Scenario.
  - Spieler-Details expandierbar; Filter funktioniert.
  - Performance: <2s bei 100+ Sessions (Pagination).

30) Designer – Kampagnen und Szenarien löschen mit Cascade (UC-19)
- Problem: Keine DELETE-API für Campaigns; Scenario-Delete lässt Sessions verwaist; keine cascading delete.
- Action:
  - Backend:
    - DELETE `/api/kse/campaigns/:id` → Löscht Campaign + CampaignScenario; Scenarios bleiben
    - GET `/api/kse/scenarios/:id/session-count` → Anzahl Sessions (für Warnung)
    - DELETE `/api/kse/scenarios/:id?cascade=true` → Löscht Scenario + Sessions (Forecasts, Results, SessionAllowedType, SessionPlayerType, PlayerProgress)
    - Migration: Foreign Key `sessions.scenario_id` ändern zu `ON DELETE CASCADE`
  - Frontend:
    - `DesignerCampaigns.jsx` → Delete-Button mit Confirm-Dialog
    - `DesignerScenarios.jsx` → Erweiterte Delete-Logik: Session-Count abrufen, Warnung anzeigen, cascade=true senden
- Acceptance:
  - Campaign löschen entfernt Zuordnungen; Scenarios bleiben.
  - Scenario löschen mit Sessions zeigt Warnung („X sessions will be deleted") und löscht alles bei Bestätigung.
  - Keine verwaisten Sessions nach Scenario-Löschung.


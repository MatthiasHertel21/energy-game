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

9) Campaigns & Catalog – Player selection and Solo Sessions (NEW)
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

10) Campaign Management – n:m Zuordnung, Reihenfolge, Bild, Publish (NEW)
- Problem: Designer können keine Kampagnen verwalten (Bild/Publish), Szenarien mehrfach zuordnen, Reihenfolge/Spielbarkeit steuern.
- Scope:
	- Backend (Model/Migration)
		- Extend `campaigns`: add `cover_image_url` (string, nullable), `published` (bool, default false), optional `tags` (json/text, optional).
		- New join table `campaign_scenarios` (id, campaign_id, scenario_id, order_index int, solo_enabled bool default true, cohort_enabled bool default true, UNIQUE(campaign_id, scenario_id)).
	- Backend (API)
		- POST `/api/kse/campaigns/:id/image` (multipart) → upload square ≤640×640, store under `/uploads/campaigns/{id}.png`, update `cover_image_url`.
		- GET/POST/PUT `/api/kse/campaigns/:id/scenarios` → list/assign/reorder scenarios with flags `solo_enabled`, `cohort_enabled`, `order_index`.
		- PATCH `/api/kse/campaigns/:id` → update `name`, `description`, `published` (toggle publish/unpublish).
	- Frontend (Designer)
		- New page: `DesignerCampaigns.jsx` – list campaigns, create/edit (name, description, publish toggle), upload cover image, manage scenario assignments (multi‑select + drag&drop reorder + per‑scenario flags toggles).
	- Acceptance
		- Designer kann Kampagne anlegen, Bild hochladen (validiert, ggf. auto‑resize/crop), Szenarien zuordnen und Reihenfolge/Flags setzen.
		- Szenario kann in mehreren Kampagnen vorkommen (n:m). Reihenfolge je Kampagne wird in der Player‑Ansicht eingehalten.
		- Publish/Unpublish steuert Sichtbarkeit in Catalog (Player sieht alle published Kampagnen).

11) Uploads & Static Serving (Support) (NEW)
- Scope:
	- Backend: `/uploads` static; validate image (PNG/JPG, max 640×640, max 512KB), store as PNG; ENV `UPLOAD_DIR` (default /app/uploads).
	- Docker: Mount volume for uploads; Traefik route `/uploads` → backend.
	- Acceptance: Cover‑Images werden performant und sicher ausgeliefert; invalid files/oversized werden abgelehnt.

	12) Events‑Editor – Tabelle + Drawer (NEW)
	- Problem: Event‑Parameter überladen im Inline‑Form; schlechte Übersicht.
	- Action: Liste (Name, Typ, Trigger, Dauer, Ziel, Wirkung) mit Aktionen Edit/Delete/Duplicate; Edit in rechtem Drawer/Modal mit Tabs (Basics | Trigger | Target | Effect); Presets (7 Default‑Events) + Suche/Filter.
	- Target files: `frontend/src/pages/KSE.jsx` (Refactor), evtl. `frontend/src/components/events/*` (neu).
	- Acceptance: Erstellen/Bearbeiten ohne Überlänge; Duplikat in ≤2 Klicks; Presets wählbar; klare Spaltenübersicht.

	13) Devices‑Editor – Karten + Expand (NEW)
	- Problem: Parametrisierung aller Devices als lange Liste; geringe Erfassbarkeit.
	- Action: Kartenliste je Device‑Typ (Icon, Kurzinfo, Kapazität/Kosten); Expand zeigt Parameter‑Gruppen; Schnell‑Add Presets (Coal/Gas/Hydro/Nuclear/Solar/Wind/Battery/Loads) mit Default‑Werten.
	- Target files: `frontend/src/pages/KSE.jsx` → `frontend/src/components/devices/*` (neu).
	- Acceptance: Max 1 Expanded Card, Add in ≤2 Klicks, Validierungsstatus pro Karte sichtbar (Error‑Badge).

	14) ATC‑Matrix – Vollbild‑Modal + CSV (NEW)
	- Problem: Matrix Editing ist eng; Symmetrie kopieren fehleranfällig.
	- Action: Vollbild‑Modal mit fixierter Kopf-/Seitenspalte; Symmetry‑Lock; CSV Import/Export; Validierung inline.
	- Target files: `frontend/src/pages/KSE.jsx` → `frontend/src/components/grid/AtcEditor.jsx` (neu).
	- Acceptance: Editieren ohne horizontalen Scroll; Symmetrie garantiert; CSV Import/Export in ≤3 Klicks.

	15) Feldarten vereinheitlichen + Mikrocopy straffen + Empty States (NEW)
	- Problem: Uneinheitliche Eingaben (freie Zahl vs. Range); zu lange Tooltips; leere Bereiche ohne Guidance.
	- Action: Number mit Stepper (sinnvolle Steps); Ranges mit Slider + Input; Einheiten als Adornments (%/MW/ZAR); Tooltips ≤140 Zeichen, 1‑Zeiler bleibt über Feld; EmptyState & Skeletons überall konsistent.
	- Target files: `frontend/src/components/*` (Wrapper), `frontend/src/pages/*` (Verwendung), `InfoLabel.jsx` (Copy).
	- Acceptance: Keine Freitexte für Range‑Felder; alle Einheiten sichtbar; leere Zustände mit Aktion; Loading via Skeleton.

	16) Designer – Scenarios Index (Liste, Suche, Edit‑DeepLink) (NEW)
	- Problem: Designer hat keine zentrale Liste zur Auswahl/Bearbeitung bestehender Szenarien.
	- Action: Neue Seite `DesignerScenarios.jsx` mit Tabelle/Kacheln (Name, Kampagne, erstellt am), Suche/Sort/Pagination, Aktionen: Edit (öffnet KSE mit ?id=…), Duplicate, Export.
	- API: GET `/api/kse/scenarios` (bestehend), optional Query/Filter (später).
	- Acceptance: Edit öffnet bestehendes Szenario; UI performant bei 100+ Szenarien.

	17) Designer – Scenario Delete (UI) (NEW)
	- Problem: Globales Löschen existiert nur via API, nicht in der UI.
	- Action: Delete‑Aktion mit Confirm‑Dialog; Fehler‑Handling; Snackbar.
	- API: DELETE `/api/kse/scenarios/:id` (bestehend).
	- Acceptance: Szenario verschwindet aus Liste; nicht mehr abrufbar.

	18) Trainer – Cohort×Campaign Visibility/Activation (Model+API+UI) (NEW)
	- Problem: Trainer kann nicht steuern, welche Kampagnen pro Cohort sichtbar/aktiv sind.
	- Action:
		- DB: Tabelle `cohort_campaigns` (cohort_id, campaign_id, visible bool, active bool, UNIQUE).
		- API: GET `/api/cohorts/:id/campaigns`, PATCH `/api/cohorts/:id/campaigns/:cid` { visible?, active? }.
		- UI: In `Cohorts.jsx` Detail ein Tab „Campaigns“ mit Toggle Visible/Active je Kampagne.
	- Acceptance: Player aus Cohort sehen nur visible Kampagnen; Start ist nur aus active Kampagnen möglich.

	19) Trainer – Start from Campaign (Cohort Context) (NEW)
	- Problem: Start einer Session ist nicht an Kampagnenkontext gekoppelt.
	- Action: Aus dem Cohort‑Campaigns Tab Drill‑down in Kampagne → Szenarienliste; Button „Open“ startet Session (Form: mode, Timer optional) und navigiert zum Trainer‑Dashboard.
	- API: POST `/api/sessions` (bestehend); Validierung: nur active Kampagnen.
	- Acceptance: Start in ≤2 Klicks aus Kampagnenkontext; Direktlink zum laufenden Dashboard.

	20) KSE – Fiktives Datum & Startuhrzeit je Szenario (NEW)
	- Problem: Szenarien haben keine kontextuelle Tages-/Zeitangabe; Briefings/Charts sind weniger anschaulich.
	- Action:
		- UI: In `KSE.jsx` Tab „General“ Felder `fake_date (YYYY‑MM‑DD)` und `start_time (HH:MM)` mit Validierung und HelperText.
		- Backend: `validate_config()` prüft Format/Werte; Briefing (`/api/sessions/:id/briefing`) liefert `fake_date`/`start_time` mit.
		- Frontend Anzeige: Briefing Page + Campaign Detail zeigt Datum/Zeit; (optional) Preview‑X‑Achse mit Uhrzeit‑Labels.
	- Acceptance: Werte werden korrekt gespeichert/validiert und im Briefing angezeigt.

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

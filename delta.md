
- KSE: Tab label renamed — "Market & Preview" → "Market" (global in KSE). Tests updated accordingly.
- KSE Market: Added Generator Mix (PV, Wind, Hydro, Coal, Gas, Nuclear) and Randomness (capacity/price jitter) controls; preview curves now non-linear and cost-based; removed over-label texts, tooltips retained.
	- Added Consumer Mix (Industrial, Household, Agriculture); Y-axis scales to actual price range; click charts to export PNG (removed PNG/SVG buttons).
- KSE UI polish (General tab):
	- Advanced always visible; no over-label texts; tooltips kept via inline icons.
	- Field order: Fictional Date, Start Time, Rounds, Round Span, Scenario Horizon (computed), Forecast Horizon, Player Zone.
	- Scenario Horizon now computed (rounds × span) and read-only.
- KSE: Fixed "Load Template" button, added template picker dialog using `/api/kse/templates`; moved button into General tab and removed from sticky bar.
# EMSG UI Delta — Concept v1.0 vs Current Implementation (2025-11-11)

This document highlights which UI screens from Chapter 3 (Application Concept) are implemented, partial, or missing in the current codebase.

Code references use project paths like `frontend/src/...`.

## 1) Student App

Stand 11.11.2025:
- Home / My Scenarios: Implementiert (`/home`, Sessions‑Liste mit CTA Briefing/Start)
- Round Editor: Countdown, Validierung, Snackbar, Live‑SMP/Vol implementiert. Freeze‑Lock vorhanden. Weitere KPIs folgen.
- Scenario Briefing: Implementiert (Basis‑Layout, Details iterativ)
- Evaluation Report: Implementiert (`/evaluation`) – Tabelle + Radar/Export (Basis)
- Replay Mode: Implementiert (`/replay`) – Slider + KPI‑Tabelle, Test instabil
- Offene Punkte: Profile & Help (weiter offen)

## 2) Trainer App

Stand 11.11.2025:
- Live Session Control erweitert: Status‑Tabelle (Players×Runden), Countdown, Broadcast, Charts (SMP, Volume, Top Profit, Imbalance/Curtailment), Reset.
- Controls: Disabled States bei fehlender Session.
- Comparison Dashboard: Implementiert (Basis) unter `/comparison`
- Offene Punkte: Session‑Meta (Name/Cohort) prominenter, Cohort Overview/Detail UI, Reference Runs (S3), Player Detail, Trainer Settings, Fast‑Forward (post‑MVP)

## 3) Editor App (MVP)

Stand 11.11.2025:
- KSE Usability: Live‑Validierung, Inline‑Fehler/HelperText; Save/Preview deaktiviert wenn ungültig; ATC‑Matrix symmetrisch mit Headern; Devices‑Tab mit Specs/Validierung.
- Offene Punkte: Campaign‑Übersicht (S2), Env‑Generator (S3), Reference Runs (S3), Device‑Assignments UI, Zonen‑Benennung & Player‑Mapping, Freeze Version Control, Validierungs‑Warnings mit Deep‑Links

Update 2025-11-17:
- Tab‑Reihenfolge angepasst: Description ist jetzt der erste Tab und Standard.
- Description: Icon‑Toggle zwischen Markdown‑Bearbeitung und Vorschau (Ein‑Pane statt Side‑by‑Side).
- Footer‑Toolbar bereinigt: Save / Import/Export / Edit Description entfernt (Redundanz); Aktionen im Header verbleiben.

## 4) Comparison Dashboard (3.4)
→ Implementiert (Basis) – Filter/Sortierung, KPIs, Bar‑Chart, Export

## 5) Persistence & Export (3.5) — UI scope
→ Implementiert: Scenario JSON Export/Import (UI+API), Reports JSON/PDF (Reportlab). Offene Ergänzung: Curve‑Persistence‑Toggles, Round‑Level‑Export Detail.

## 6) Additional existing pages (not listed in Chapter 3 UI)
- Register → Implemented (`/register`, Copy EN + First‑User‑Admin Hinweis)
- Admin User Management → Implemented (`/admin`, Rollen ändern, Invite/Create, Suche/Pagination, Delete)
- 404 → Implemented (catch‑all), SnackbarProvider global (API‑Fehler Toaster)

## 7) Quick mapping summary

- Implemented: `Login`, `Home`, `Briefing`, `Player` (verbessert), `Trainer` (Live Control), `KSE` (Editor + Devices), `Comparison`, `Evaluation`, `Replay`, `AdminUsers`, `Register`, `404`, Snackbar.
- In Plan: Personal Dashboard; Trainer Overview/Detail; Editor Campaign/Profile; EnvGen (D3); Freeze Version Control.
- Offene Punkte: Profile & Help (Student), Player Detail & Trainer Settings, Device‑Assignments UI, Zonen‑Benennung & Zuordnung, Beispiel‑Bibliothek, Curve‑Persistence‑Toggles, Round‑Level‑Export Detail, Fast‑Forward (post‑MVP)

## 8) Suggested next steps (UI)
Entfallen – im Plan (S2/S3) verankert. Offene Restpunkte priorisieren und terminieren.

Update 2025-11-17 (Player UI polish):
- Player: Fixed drag-and-drop in chart editor (corrected data index handling).
- Player: Countdown initializes reliably and updates via WebSocket ticks; Solo sessions now start with status=running.
- Player: Fields editor inputs widened (min 84px, responsive grid xs=2) to avoid clipped digits.


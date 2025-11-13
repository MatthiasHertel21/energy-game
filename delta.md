# EMSG UI Delta — Concept v1.0 vs Current Implementation (2025-11-11)

This document highlights which UI screens from Chapter 3 (Application Concept) are implemented, partial, or missing in the current codebase.

Code references use project paths like `frontend/src/...`.

## 1) Student App

Stand 11.11.2025:
- Home / My Scenarios: Implementiert (`/home`, Sessions‑Liste mit CTA Briefing/Start)
- Round Editor: Countdown, Validierung, Snackbar, Live‑MCP/Vol implementiert. Freeze‑Lock vorhanden. Weitere KPIs folgen.
- Scenario Briefing: Implementiert (Basis‑Layout, Details iterativ)
- Evaluation Report: Implementiert (`/evaluation`) – Tabelle + Radar/Export (Basis)
- Replay Mode: Implementiert (`/replay`) – Slider + KPI‑Tabelle, Test instabil
- Offene Punkte: Profile & Help (weiter offen)

## 2) Trainer App

Stand 11.11.2025:
- Live Session Control erweitert: Status‑Tabelle (Players×Runden), Countdown, Broadcast, Charts (MCP, Volume, Top Profit, Imbalance/Curtailment), Reset.
- Controls: Disabled States bei fehlender Session.
- Comparison Dashboard: Implementiert (Basis) unter `/comparison`
- Offene Punkte: Session‑Meta (Name/Cohort) prominenter, Cohort Overview/Detail UI, Reference Runs (S3), Player Detail, Trainer Settings, Fast‑Forward (post‑MVP)

## 3) Editor App (MVP)

Stand 11.11.2025:
- KSE Usability: Live‑Validierung, Inline‑Fehler/HelperText; Save/Preview deaktiviert wenn ungültig; ATC‑Matrix symmetrisch mit Headern; Devices‑Tab mit Specs/Validierung.
- Offene Punkte: Campaign‑Übersicht (S2), Env‑Generator (S3), Reference Runs (S3), Device‑Assignments UI, Zonen‑Benennung & Player‑Mapping, Freeze Version Control, Validierungs‑Warnings mit Deep‑Links

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


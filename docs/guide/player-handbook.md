# Player Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 1.1 (Sprint 21)  
**Date**: 20 Nov 2025  
**Audience**: Players/Students

---

## What's New (Sprint 21)

- **Campaign Catalog**: Browse published campaigns at `/catalog` with progress tracking
- **Chart Editor**: Improved forecast editor with drag-anywhere editing and smooth radius (3-hour falloff)
- **Device View Toggle**: Switch between chart and fields view for per-device editing
- **Briefing Access**: Return to briefing anytime via button in player interface
- **Timer Persistence**: Session timer now persists across page reloads
- **Known Issues**: KSE Market/Preview tabs accessibility improvements in progress

---

## Quick Guide

- Play a 24h day in 4 rounds (default 300s per round).
- Flow: Login → Home/Catalog → Briefing → Player → Evaluation.
- Modes: `isolated_per_player` (solo) or `shared_market` (multiplayer).
- Key actions:
  - Save Full Forecast: persist all hours (no submission).
  - Submit Current Round: submit only the current round’s slice.
- Watch the freeze: early hours become locked after the first round.
- Live charts (MCP/Volume) and KPIs update after each clearing.

---

## Detailed Guide

### 1) Getting Started

- Register `/register` (may require approval). Login `/login` → `/home`.
- **Home** (`/home`) shows your active sessions and assigned scenarios.
- **Campaign Catalog** (`/catalog`) displays published campaigns with:
  - Campaign cards showing cover image, description, and completion progress
  - Scenario timeline with visual progress indicators
  - Solo play button (if enabled by designer)
  - Join active cohort sessions (if available)
  - Reset scenario progress

### 2) Briefing

URL: `/briefing?sessionId=...`
- Objectives, general parameters (rounds, duration, forecast horizon, freeze), market rules (DA/IDM/Balancing, floor/cap, imbalance pricing), grid (zones/ATC), your role & devices (if shared market), events, and scoring weights.
- Start Playing → opens Player. Back to Home returns to dashboard.

### 3) Player Interface

URL: `/player?sessionId=...`

Layout
- Left: Countdown Timer, Session Info, Live KPIs.
- Right: Forecast Editor (hour inputs), device sparks (if per‑device), Save/Submit.
- Bottom: MCP and Volume charts over rounds.

3.1 Countdown & Session Info
- Timer color: green >60s, amber 31–60s, red ≤30s. At 0s you cannot submit.
- Session Info: status chip (active/paused/ended), round N/M, forecast horizon, locked until hX (freeze hours).

3.2 Live KPIs
- MCP (ZAR/MWh) and Volume (MWh) for the last cleared round. Shows “Waiting for market data…” until first clearing.

3.3 Forecast Editor
- **View Toggle**: Switch between Chart (interactive D3.js editor) and Fields (numeric inputs)
- Enter an hourly schedule:
  - Solo: one aggregate series for all hours (h1..hH).
  - Shared market: per‑device inputs for assigned devices; an aggregate is auto‑summed.
- **Chart Editor** (Sprint 21 improvements):
  - Drag anywhere on the chart to edit values (not just points)
  - 3-hour smooth radius: editing one hour adjusts neighboring hours with triangular falloff
  - Y-axis auto-scales to device capacity (when provided)
  - Height increased to 320px for better precision
- **Field Editor**: Numeric inputs with min/max/step rules; hours ≤ freeze or when timeRemaining = 0 are disabled.
- **Actions**:
  - Save Full Forecast → POST `/api/player/forecast/full` `{ session_id, hours, devices? }` (persists without submission)
  - Submit Current Round → POST `/api/player/forecast` `{ session_id, round_num, hours: slice, devices? }` (submits round slice)
- Errors show as red fields with tooltips; validation runs on submit (device constraints checked).

3.4 Player Type (shared market)
- If allowed types exist and none is selected, a dialog lists types with remaining capacity. Select to load device inputs.

3.5 Charts
- MCP (green) and Volume (blue) lines across rounds with tooltips; update after each clearing via WebSocket.

### 4) After Playing

4.1 Evaluation
- Summary KPIs (Profit, Revenue, Imbalance Cost, Curtailment Cost), round table, trend charts, benchmarking vs cohort average; export PDF.

4.2 Leaderboard
- Rank players by scoring rules; choose metric (Profit/Revenue/Imbalance/Curtailment); export PNG/CSV.

4.3 Replay
- Step rounds, autoplay/pause; view submitted slices and market outcomes; optional cohort average/reference overlay.

### 5) Tips, Troubleshooting, FAQ

Tips
- Save often; saving is not submission. Submit before the timer hits 0.
- Mind the freeze boundary; locked hours cannot be changed later.

Troubleshooting
- Cannot submit: timer ended, session paused/ended, or player type not selected.
- No charts: first clearing not yet received; refresh if socket dropped.
- No scenarios on Home: ask trainer to assign or activate a session.

FAQ
- Rounds: default 4; varies per scenario. Late submissions are not accepted.
- Negative prices: possible; floor/cap are scenario‑defined.
- Edits after submit: not for the submitted slice.

---

## South Africa Context

- SAWEM focus: educational simulation aligned to Eskom SO and NTCSA concepts.
- Currency & units: ZAR, MW/MWh; typical price floor −500, cap +5,000 ZAR/MWh (scenario‑specific).
- Timezone: SAST (UTC+2), no DST; fake date/time labels use local time.
- Grid: example 2‑zone model with ATC (e.g., 5,000 MW) and curtailment by cost order.
- Negative pricing: enabled; expect MCP < 0 during oversupply.

---

Support
- Technical: support@emsg.example.com
- Trainer/Admin: via your cohort contact

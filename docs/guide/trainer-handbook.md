# Trainer Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 1.1 (Sprint 21)  
**Date**: 20 Nov 2025  
**Audience**: Trainers/Facilitators

---

## What's New (Sprint 21)

- **Campaign-First Workflow**: Start session flow now uses Cohort → Campaign → Scenario selection
- **Active Session Detection**: Automatic detection prevents duplicate sessions for same cohort
- **Improved Presence Panel**: Player type names shown (not just IDs), connected/playing status colors
- **Session End Cleanup**: Session state properly cleared on end event
- **Bulk Session Cleanup**: Admin can delete ALL sessions (with DELETE confirmation)
- **Performance**: Baseline metrics available (p95=8ms response time, see docs/PERFORMANCE_RESULTS.md)

---

## Quick Guide

- Run cohorts, start/stop sessions, broadcast messages, monitor live progress.
- Steps: Create cohort → Add players → Activate campaigns → Start session → Monitor & evaluate.
- Controls: Start, Pause, Resume, End, Force Round End (emergency only).
- Monitoring: Presence, status matrix, type distribution, capacity remaining, device frequency, MCP/Volume charts, aggregated KPIs.
- Post-session: Leaderboard, comparison dashboard, replay, PDF exports.

---

## Detailed Guide

### 1) Navigation
- `/cohorts`: manage groups and campaign visibility.
- `/trainer`: start/control a session; live monitoring.
- `/comparison?sessionId=...`: cross-player metrics.
- `/leaderboard?sessionId=...`: rankings.
- `/replay?sessionId=...`: round-by-round playback.

### 2) Cohorts
- List/create cohorts; add members via CSV or invite; remove as needed.
- Campaigns tab: toggle Visible/Active per campaign, then drill down to scenarios and “Open Session”.
- Sessions tab: history list; open evaluation/replay; export.

### 3) Start & Control a Session

**New Workflow (Sprint 21)**:
1. Select **Cohort** (auto-checks for active session)
2. Select **Campaign** (only shows published campaigns visible to cohort)
3. Select **Scenario** (from campaign, cohort-enabled scenarios only)
4. Choose **Mode** (`isolated_per_player` for solo | `shared_market` for multiplayer)
5. Configure **Player Types** (for shared market): Enable types and set max players per type
6. Click **Start Scenario** (disabled if active session exists for cohort)

**Session Controls** (right side of session info panel):
- **Pause** (⏸): Freeze timer, prevent submissions
- **Resume** (▶): Continue from paused state
- **End** (⏹): Close session, trigger evaluation redirect
- **Force Round End** (emergency): Skip to next round immediately

**Status Display**:
- Session ID chip, Status color (green=running, yellow=paused, grey=created, red=ended)
- Round N/M, Scenario name, Mode, Timer countdown

### 4) Live Monitoring
- Broadcast: POST `/api/sessions/:id/broadcast` to all players.
- Status Matrix: per player online/ready/forecasted/submitted/type/last activity; auto-refresh 5s + socket events; filter views.
- Participants & Types (shared market): joined/pending; charts for type distribution, capacity remaining, device frequency.
- Market Charts: MCP/Volume over rounds; export PNG/SVG.
- Aggregated KPIs: Profit, Revenue, Imbalance, Curtailment, Rounds per player; sort/export CSV.
- Event Log: session/player/market events; simple filters; clear.

### 5) Evaluation & Reporting
- Comparison Dashboard: metric filters, bar chart, table; export PNG/CSV.
- Leaderboard: ranking by scoring rules; optional PDF.
- Replay: step rounds; overlay averages/reference runs.
- Player Detail: deep-dive charts and KPIs; cohort overlays.

### 6) Advanced
- Presence: `/api/trainer/presence` with cohort filter.
- Reference Runs: upload expert/optimal baselines; compare.
- Activity Dashboard (optional): timeline of login/submit/complete; filters; CSV.
- Best Practices: prepare cohorts/invites early; dry-run sockets/timers; broadcast time cues; debrief with charts.

---

## South Africa Context
- SAWEM training context; Eskom SO/NTCSA references in examples.
- ZAR currency; MW/MWh units across UI/exports.
- SAST (UTC+2) timezone; no DST.
- Example 2‑zone grid with ATC ≈ 5,000 MW; congestion → curtailment by cost.
- Negative pricing enabled; coach on oversupply behavior.
- POPIA: avoid unnecessary PII in exports/reports.

---

Support
- Technical: support@emsg.example.com
- Admin contact: admin@emsg.example.com

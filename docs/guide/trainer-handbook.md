# Trainer Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 1.5 (Sprint 24)  
**Date**: 23 Dec 2025  
**Audience**: Trainers/Facilitators

---

## What's New (Sprint 24)

- **DA/ID Market Breakdown**: Spieler sehen nach jeder Runde detaillierte Marktaufschlüsselung:
  - Day-Ahead vs Intraday Volume mit separaten Preisen
  - Tägliche Aufschlüsselung als Accordion
  - ID Adjustment Prozentsatz zeigt Handelsaktivität
- **Consumer Role Support**: Verbraucher-Rollen werden korrekt dargestellt:
  - Angepasste Labels (Kosten statt Revenue)
  - Rosa Farbcodierung für Consumer-Karten
- **ID Price Spread**: Konfigurierbarer Preisaufschlag für Intraday-Handel
  - Scenario-Parameter `id_price_spread_percent`
  - Pädagogisch wertvoll: zeigt reale Marktdynamik

**Previous (Sprint 23)**:
- **Hourly Market Clearing**: Engine now performs market clearing for each hour within a round
  - More granular price signals reflecting hourly supply/demand dynamics
  - Round MCP shown as average across all hours
  - Better pedagogical value for teaching time-varying energy markets
  - Works with any round duration (1h, 3h, 4h, 6h, 8h, custom)
- **Campaign Catalog Integration**: Published campaigns visible to all cohorts in catalog
- **Solo Session Support**: Players can start solo sessions directly from catalog
- **Player Progress Tracking**: Automatic scenario completion tracking with reset functionality
- **Enhanced Session Info**: Campaign and scenario names displayed during gameplay
- **Multi-Bid Pricing Support**: When enabled by designer, players submit strategic price-quantity bids
- **Improved Evaluation**: Better cross-player comparison with device-level metrics
- **Currency Formatting**: All ZAR values properly formatted with thousands separators

**Previous (Sprint 22)**:
- Enhanced Presence Panel with color-coded status
- Campaign-First Workflow preventing duplicate sessions
- Improved Session Controls and UI Layout
- Performance baseline metrics (p95=8ms)

---

## Quick Guide

- Run cohorts, start/stop sessions, broadcast messages, monitor live progress.
- Steps: Create cohort → Add players → Activate campaigns → Start session → Configure player types → Monitor & evaluate.
- Controls: Start, Pause, Resume, End, Force Round End (emergency only).
- All trainer sessions use **Shared Market mode** with player types for role-based gameplay.
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
- **List View** (Sprint 22): Enhanced table with trainer email, member count, active campaign count
  - Click row to select and expand cohort details
  - ID column hidden for cleaner interface
  - Quick visibility of cohort composition
- **Management**: Create cohorts; add members via CSV or invite; remove as needed
- **Campaigns tab**: Toggle Visible/Active per campaign, then drill down to scenarios and "Open Session"
- **Sessions tab**: History list; open evaluation/replay; export

### 3) Start & Control a Session

**New Workflow (Sprint 22)**:
1. Select **Cohort** (auto-checks for active session)
2. Select **Campaign** (only shows published campaigns visible to cohort)
3. Select **Scenario** (from campaign, cohort-enabled scenarios only)
4. Configure **Player Types**: Enable types and set max players per type (always shared market mode)
5. Click **Start Scenario** (disabled if active session exists for cohort)

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
- **Status Matrix** (Sprint 22 improvements): 
  - Per player online/ready/forecasted/submitted/type/last activity
  - **Visual Status**: Green background = actively playing, Yellow = connected but not playing
  - **Player Type Display**: Shows player type name (e.g., "Generator Operator") instead of ID
  - Auto-refresh 5s + real-time socket events; filter views
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

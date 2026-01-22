# Trainer Handbook
## Energy Market Simulation Game (EMSG)

**Version**: 2.1 (Sprint 24)  
**Date**: January 22, 2026  
**Audience**: Trainers/Facilitators

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Cohort Management](#2-cohort-management)
3. [Starting a Session](#3-starting-a-session)
4. [Controlling a Session](#4-controlling-a-session)
5. [Live Monitoring](#5-live-monitoring)
6. [Communication](#6-communication)
7. [Evaluation & Reporting](#7-evaluation--reporting)
8. [Replay Function](#8-replay-function)
9. [Best Practices](#9-best-practices)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Introduction

### Role of the Trainer

As a trainer, you are responsible for:
- Managing cohorts (player groups)
- Starting and controlling sessions
- Live monitoring during gameplay
- Evaluation and debriefing

### Navigation

| Route | Function |
|-------|----------|
| `/trainer` | Cohort and campaign management (formerly `/cohorts`) |
| `/session-control?cohort=...` | Session control and live monitoring |
| `/comparison?sessionId=...` | Cross-player comparison |
| `/leaderboard?sessionId=...` | Ranking |
| `/replay?session=...` | Round-by-round playback |

### Workflow Overview

```
1. Preparation
   ├── Create cohort
   ├── Invite players
   └── Activate campaigns

2. Conduct Session
   ├── Select scenario
   ├── Configure Player Types
   ├── Start session
   ├── Monitor live
   └── End session

3. Follow-up
   ├── Analyze evaluation
   ├── Show leaderboard
   └── Conduct debriefing
```

---

## 2. Cohort Management

### 2.1 Create Cohort

**Route**: `/trainer` → "Create Cohort" button in toolbar

| Field | Description | Example |
|-------|-------------|---------|
| **Name** | Unique cohort name | "WS 2025 Group A" |

**Features (Sprint 24 Update)**:
- Modal-based creation dialog
- Simplified single-field form
- Immediate feedback on creation

### 2.2 Manage Members

**Members Tab (NEW in Sprint 24)**:

The Members tab in the cohort details modal shows:

| Column | Description |
|--------|-------------|
| **Email** | Player email address |
| **Name** | Player's display name (editable in profile) |
| **Last Login** | Last login timestamp or "Never" |
| **Solo Sessions** | Count of solo sessions completed by this player |

**Add Players:**

| Method | Description |
|--------|-------------|
| **Registration Link** | Share cohort-specific link (NEW in Sprint 24) |
| ↳ Auto-assignment | Players automatically join cohort on registration |
| ↳ Copy link | Click copy icon to copy registration URL |

**Remove Players:**
- Click delete icon next to the player
- ⚠️ Player loses access to all cohort sessions

**Note**: CSV import has been removed. Use registration links for bulk onboarding.

### 2.3 Activate Campaigns

**Campaigns Tab:**

The Campaigns tab shows active campaigns with detailed information:

| Column | Description |
|--------|-------------|
| **Campaign Name** | Campaign name with scenario count |
| **Published** | Publication status |
| **Visible** | Visible in catalog for this cohort |
| **Active** | Sessions can be started |

**Actions:**
- Toggle "Visible" → Players see campaign in catalog
- Toggle "Active" → Trainer can start sessions

**Display Format (NEW in Sprint 24)**:
- Campaigns shown with names instead of just IDs
- Scenario count displayed for each campaign
- Example: "Tutorial Campaign (3 scenarios)"

### 2.4 Activity Tab

**Activity Tab (Sprint 24)**:
- Shows recent activity logs for the cohort
- Pagination with 50 items per page
- Filterable by action type and user

---

## 3. Starting a Session

### 3.1 Session Start Workflow

**Route**: `/session-control?cohort=...` (or via "Session Control" button in Trainer Panel)

**Step 1: Choose Cohort**
- Select cohort from URL parameter
- ⚠️ Warning if cohort already has active session

**Step 2: Choose Campaign**
- Only published campaigns active for cohort
- Campaign image and description displayed

**Step 3: Choose Scenario**
- List of scenarios in the campaign
- Only "cohort-enabled" scenarios
- Objectives preview (first 200 characters)

**Step 4: Configure Player Types**

| Setting | Description |
|---------|-------------|
| **Enable Type** | Toggle per Player Type |
| **Max Players** | How many players can choose this type |

**Step 5: Start Session**
- Click "Start Scenario"
- Session is created with status "Created"
- Players can join and see briefing

### 3.2 Session Modes

| Mode | Description | Market |
|------|-------------|--------|
| **Shared Market** | All trainer sessions | Shared market |

ℹ️ Solo mode is started directly by players via catalog.

### 3.3 Automatic Start

After session creation:
1. Players join (see briefing)
2. Trainer clicks "Run" → Session starts
3. Timer begins for all players simultaneously

---

## 4. Controlling a Session

### 4.1 Session Status

| Status | Color | Meaning |
|--------|-------|---------|
| **Created** | Gray | Session created, not yet started |
| **Running** | Green | Session running, timer active |
| **Paused** | Yellow | Session paused, timer stopped |
| **Ended** | Red | Session ended, evaluation available |

### 4.2 Control Elements

**Trainer Dashboard** (`/trainer`):

```
┌─────────────────────────────────────────────────────────────┐
│  Session Info: Cohort | Scenario | Status | Round N/M       │
├─────────────────────────────────────────────────────────────┤
│  [▶ Run]  [⏸ Pause]  [⏹ End]  [⏭ Force Round End]          │
└─────────────────────────────────────────────────────────────┘
```

| Button | Function | When to Use |
|--------|----------|-------------|
| **▶ Run** | Start/resume session | After Created or Paused |
| **⏸ Pause** | Stop timer | For explanations, breaks |
| **⏹ End** | End session | After last round or abort |
| **⏭ Force Round End** | End round immediately | ⚠️ Emergency, skips timer |

### 4.3 Round Management

**Automatic Round Flow:**
1. Timer runs (e.g., 300s)
2. Players submit forecasts
3. Timer ends → Market Clearing
4. Round Results are displayed
5. Players signal "Ready"
6. When all Ready → Next round

**Manual Intervention:**
- "Force Round End" → Skips waiting players
- Only use if players have technical problems

### 4.4 Ending a Session

**Normal End:**
- After last round automatically
- Players see Scenario Results
- Redirect to Evaluation

**Early End:**
- "End" button → Session ends immediately
- All previous results are preserved
- Players are redirected to Evaluation

---

## 5. Live Monitoring

### 5.1 Dashboard Layout

```
┌────────────────────────────────────────────────────────────────┐
│  Session Info Bar                                              │
├──────────────────────┬─────────────────────────────────────────┤
│                      │                                         │
│  Presence Panel      │        Status Matrix                    │
│  (Online/Offline)    │        (Player × Status)                │
│                      │                                         │
├──────────────────────┼─────────────────────────────────────────┤
│                      │                                         │
│  Type Distribution   │        Market Charts                    │
│  (Pie Chart)         │        (MCP, Volume)                    │
│                      │                                         │
├──────────────────────┴─────────────────────────────────────────┤
│  Aggregated KPIs Table                                         │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Presence Panel

Shows online status of all players:

| Symbol | Status |
|--------|--------|
| 🟢 | Online, active |
| 🟡 | Online, inactive (>1 min) |
| 🔴 | Offline |

**Automatic Refresh**: Every 5 seconds

### 5.3 Status Matrix

Detailed overview per player:

| Column | Description |
|--------|-------------|
| **Player** | Email or name |
| **Type** | Chosen Player Type |
| **Online** | Connection status |
| **Forecasted** | Forecast created? |
| **Submitted** | Submitted this round? |
| **Ready** | Ready for next round? |
| **Last Activity** | Timestamp |

**Color Coding:**
- 🟢 Green: Actively playing
- 🟡 Yellow: Connected but inactive
- ⬜ White: Not connected

### 5.4 Type Distribution

Pie chart shows:
- How many players chose each Player Type
- Remaining slots per type
- Helpful for balance check

### 5.5 Device Frequency

Bar chart shows:
- How often each device was chosen
- Identifies popular/unpopular devices

### 5.6 Market Charts

**MCP over Rounds:**
- Green line
- Shows price development
- Tooltips with values

**Volume over Rounds:**
- Blue line
- Total trading volume

**Export:** PNG/SVG

### 5.7 Aggregated KPIs

Table with all players:

| Column | Description |
|--------|-------------|
| **Player** | Name/Email |
| **Type** | Player Type |
| **Profit** | Total profit (ZAR) |
| **Revenue** | Total revenue (ZAR) |
| **Imbalance** | Total imbalance costs |
| **Curtailment** | Total curtailment costs |
| **Rounds** | Number of rounds played |

**Actions:**
- Sort by any column
- Export as CSV

### 5.8 Event Log

Chronological list of all events:

| Event Type | Example |
|------------|---------|
| Session | "Session started", "Round 3 ended" |
| Player | "player@email.com joined", "Forecast submitted" |
| Market | "MCP = 450 ZAR/MWh", "Clearing completed" |

**Filters:**
- By event type
- By player
- By time period

---

## 6. Communication

### 6.1 Broadcast Messages

Send messages to all players:

1. Input field in Trainer Dashboard
2. Enter message
3. Click "Send"
4. All players see toast notification

**Examples:**
- "5 minutes until round ends!"
- "Note the Koeberg event in Round 3"
- "Pause for questions"

### 6.2 Player-specific Communication

Currently not implemented. Workarounds:
- Send email directly
- Use parallel chat tool (Teams, Slack)

---

## 7. Evaluation & Reporting

### 7.1 Comparison Dashboard

**Route**: `/comparison?sessionId=...`

Comparison of all players:

| Element | Description |
|---------|-------------|
| **Metric Filter** | Choose KPI (Profit, Imbalance, etc.) |
| **Bar Chart** | Visual representation per player |
| **Table** | Detailed numbers |

**Export:** PNG/CSV

### 7.2 Leaderboard

**Route**: `/leaderboard?sessionId=...`

Ranking by scoring rules:

| Element | Description |
|---------|-------------|
| **Rank** | 1, 2, 3, ... |
| **Player** | Name/Email |
| **Score** | Total Score (0-100) |
| **Breakdown** | Individual KPIs |

**Options:**
- Choose metric
- Filter by role
- PDF export

### 7.3 Evaluation

**Route**: `/evaluation?sessionId=...`

Complete evaluation:

| Section | Content |
|---------|---------|
| **Summary KPIs** | Aggregated over all rounds |
| **Round Table** | Details per round |
| **Trend Charts** | Profit, MCP, Volume over time |
| **Market Breakdown** | DA vs ID Volume/Revenue |
| **Cohort Comparison** | Player vs average |

**Export:** PDF

### 7.4 DA/ID Market Breakdown

New feature (Sprint 24):

| Metric | Description |
|--------|-------------|
| **DA Volume** | Committed in Day-Ahead |
| **ID Delta** | Intraday adjustments |
| **Final Position** | Final position |
| **ID Adjustment %** | Percentage change |

**Pedagogical Value:**
- Shows trading activity
- Identifies "adjusters"
- Discussion basis for debriefing

---

## 8. Replay Function

### 8.1 Start Replay

**Route**: `/replay?sessionId=...`

### 8.2 Navigation

| Button | Function |
|--------|----------|
| **⏮** | To first round |
| **◀** | Previous round |
| **▶** | Next round |
| **⏭** | To last round |
| **⏯** | Autoplay start/stop |

### 8.3 Display per Round

- Submitted forecasts of all players
- Market clearing results
- MCP and volume
- Active events

### 8.4 Overlays

| Overlay | Description |
|---------|-------------|
| **Cohort Average** | Average of all players |
| **Reference Run** | Reference uploaded by designer |

### 8.5 Export

- Round-by-round screenshots
- Data as CSV

---

## 9. Best Practices

### 9.1 Preparation

| Task | Timing |
|------|--------|
| Create cohort | 1 week before |
| Invite players | 1 week before |
| Test session | 1-2 days before |
| Briefing material | Day before |

### 9.2 During Session

| Tip | Reasoning |
|-----|-----------|
| **Announce timer** | "2 minutes remaining!" |
| **Pause for questions** | Ensure understanding |
| **Watch status matrix** | Detect problems early |
| **Don't intervene too often** | Allow learning experience |

### 9.3 Debriefing

| Element | Description |
|---------|-------------|
| **Show leaderboard** | Motivation, comparison |
| **Interview top performers** | "What was your strategy?" |
| **Discuss mistakes** | "What went wrong for Player X?" |
| **Explain market dynamics** | Discuss MCP development |
| **Analyze DA vs ID** | Who planned well? |

### 9.4 Common Situations

| Situation | Response |
|-----------|----------|
| Player arrives late | Wait for next round |
| Technical problems | Pause, solve problem |
| Questions during game | Brief answer, details later |
| Unbalanced teams | Adjust capacities in Player Types |

---

## 10. Troubleshooting

### 10.1 Common Problems

| Problem | Cause | Solution |
|---------|-------|----------|
| Session won't start | Active session exists | End old session |
| Player can't see session | Not in cohort | Check cohort |
| Timer not running | Session "Created" | Click "Run" |
| No results | No submit | Force Round End |
| Unstable connection | WebSocket issue | Reload page |

### 10.2 Emergency Actions

| Action | When |
|--------|------|
| **Force Round End** | Player can't submit |
| **Pause** | Technical problem for all |
| **End Session** | Critical error, restart needed |

### 10.3 Contact Support

- **Technical**: support@emsg.example.com
- **Logs**: Trainer Dashboard → Export Event Log
- **Screenshots**: Status Matrix, Error Messages

---

## Appendix: API Reference

### Important Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sessions` | POST | Create session |
| `/api/sessions/:id/start` | POST | Start session |
| `/api/sessions/:id/pause` | POST | Pause session |
| `/api/sessions/:id/end` | POST | End session |
| `/api/sessions/:id/broadcast` | POST | Send message |
| `/api/trainer/presence` | GET | Online status of all players |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `session:status` | Server→Client | Status update |
| `round:end` | Server→Client | Round ended |
| `player:submit` | Server→Client | Player submitted |
| `broadcast` | Server→Client | Trainer message |

---

*Last updated: December 23, 2025*

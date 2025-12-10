# Sprint 23 Summary – Unified Solo/Shared Flow

**Date:** 2025-12-02  
**Status:** ✅ Completed

---

## **Overview**

Sprint 23 implemented a **unified phase-based session flow** for both Solo and Shared Market modes, providing consistent UX and better pedagogical control through structured pacing between rounds.

---

## **Completed Features**

### **Backend**

#### **1. Unified Session Flow (scheduler.py)**
- ✅ Phase-based state machine replacing timer-only approach
- ✅ Six session states: `briefing`, `round_active`, `round_closing`, `calculating`, `round_results`, `scenario_complete`
- ✅ Both Solo and Shared modes use same advancement mechanism (no auto-advance)
- ✅ Round-to-round flow:
  - Briefing → Round Active (manual start)
  - Round Active → Round Closing (timer=0)
  - Round Closing → Calculating (2s grace + auto-submit)
  - Calculating → Round Results (engine complete)
  - Round Results → Next Round or Complete (player advance)

#### **2. New API Endpoints (sessions.py)**
- ✅ `POST /sessions/{sid}/start-briefing` – Player starts scenario from briefing (Solo mode)
- ✅ `GET /sessions/{sid}/submit-status` – Poll submit count per player type (Shared waiting screen)
- ✅ `GET /sessions/{sid}/round-results/{round}` – Individual KPIs + ranking with weighted scores
- ✅ `GET /sessions/{sid}/final-results` – Cumulative KPIs + final ranking + round history
- ✅ `POST /sessions/{sid}/advance-round` – Player signals ready; Solo=1 player, Shared=all players
- ✅ `POST /sessions/{sid}/freeze` – Trainer pause/unpause (Shared only)

#### **3. Auto-Submit & Grace Period**
- ✅ 2-second grace period in `round_closing` phase
- ✅ Auto-submit creates null forecasts (0 MWh) for missing players
- ✅ Prevents session blocking while allowing last-second submits

#### **4. Weighted Scoring System**
- ✅ `/round-results`: Calculates weighted total_score = (profit_weight × profit) + (imbalance_weight × imbalance) + (curtailment_weight × curtailment)
- ✅ Weights from scenario config (defaults: 0.6, 0.3, 0.1)
- ✅ Ranking sorted by total_score descending
- ✅ `/final-results`: Cumulative totals across all rounds

---

### **Frontend**

#### **5. BriefingScreen Component (NEW)**
- ✅ Displays scenario name, description, objectives
- ✅ Game structure info: rounds, duration, forecast horizon
- ✅ Scoring system explanation with weight breakdown
- ✅ Mode-specific hints (Solo vs Shared)
- ✅ "Start Scenario" button → calls `/start-briefing`
- ✅ Material-UI design with icons (Info, Timer, Trophy, Goal)

#### **6. WaitingScreen Component (UPDATED)**
- ✅ Solo mode: "Calculating Your Results..." with spinner (no polling)
- ✅ Shared mode: 
  - Polls `/submit-status` every 3 seconds
  - LinearProgress bar (X/Y submitted)
  - Table showing per-type breakdown (Type, Submitted, Total, Status)
  - "Waiting for Other Players..." message

#### **7. RoundResultsScreen Component (UPDATED)**
- ✅ Individual KPI cards: Profit (€), Imbalance (MWh), Curtailment (MWh), Total Score
- ✅ Solo mode: Ranking table hidden (or shows "Position 1/1")
- ✅ Shared mode: Full leaderboard with medals (🏆🥈🥉) and "You" chip
- ✅ Active events displayed as MUI Alerts
- ✅ Advance button:
  - Solo: "Continue to Next Round" → immediate advance
  - Shared: "I'm Ready for Next Round" → shows "Waiting for X/Y" when clicked
- ✅ Calls `/advance-round` on button click

#### **8. ScenarioResultsScreen Component (NEW)**
- ✅ Trophy icon (80px) with final ranking display
- ✅ Winner badges: 🏆 Winner, 🥈 Second, 🥉 Third
- ✅ Cumulative KPI cards (Total Profit, Imbalance, Curtailment, Final Score)
- ✅ Final leaderboard (hidden in Solo mode)
- ✅ Round history accordion with per-round breakdown
- ✅ Navigation buttons: "Back to Home" + "View Detailed Analysis"
- ✅ Confetti animation on completion (respects prefers-reduced-motion)

#### **9. Player.jsx Integration**
- ✅ Scenario data loading from `/catalog/scenarios/{id}`
- ✅ Socket handlers for all new phases:
  - `briefing` → load scenario + set status
  - `round_closing` → show WaitingScreen
  - `calculating` → continue WaitingScreen
  - `round_results_ready` → show RoundResultsScreen
  - `scenario_complete` → show ScenarioResultsScreen + confetti
- ✅ Conditional rendering based on session status:
  ```jsx
  {status === 'briefing' && <BriefingScreen />}
  {(status === 'round_closing' || status === 'calculating') && <WaitingScreen />}
  {status === 'round_results' && <RoundResultsScreen />}
  {status === 'scenario_complete' && <ScenarioResultsScreen />}
  {status === 'running' && <MainGameInterface />}
  ```

---

## **Technical Implementation**

### **State Machine (Backend)**

```python
# scheduler.py phases
1. briefing: Wait for manual start (player/trainer)
2. round_active: Timer countdown (300s default)
3. round_closing: 2s grace period + auto-submit
4. calculating: Engine run (DA snapshot, IDM delta, clearing, KPIs)
5. round_results: Display + wait for all players ready
6. [Loop to next round OR] scenario_complete: Final results
```

### **Socket Events Flow**

```
Server → Client:
- briefing → BriefingScreen
- round_start → Reset timer, clear submitted flag
- tick → Update countdown
- round_closing → WaitingScreen (submit status)
- calculating → Continue waiting
- round_results_ready → RoundResultsScreen
- scenario_complete → ScenarioResultsScreen
```

### **Player Advancement Logic**

```python
# sessions.py /advance-round
if mode == 'isolated_per_player':
    required_ready = 1  # Solo: immediate
else:
    required_ready = len(member_ids)  # Shared: all players

if ready_count >= required_ready:
    if current_round < total_rounds:
        # Advance to next round
        session.current_round += 1
        session.status = SessionStatus.round_active
        socketio.start_background_task(run_rounds, sid)
    else:
        # Complete scenario
        session.status = SessionStatus.scenario_complete
        # Mark PlayerProgress as completed
```

---

## **Event System Enhancement**

### **ATC Reduction Events (Grid Links)**

- ✅ Events can now target grid links between zones
- ✅ Target format: `{"grid_link": {"from_zone": 1, "to_zone": 2}}`
- ✅ Reduction applied as percentage (e.g., 30% reduces 5000 MW ATC to 3500 MW)
- ✅ Applied symmetrically to both directions
- ✅ Processing order: Grid events → Systemic → Player-specific
- ✅ Example event: "Transmission Maintenance" reduces Z1↔Z2 capacity for 2 rounds

---

## **Build & Deployment**

- ✅ Backend build successful (Docker)
- ✅ Frontend build successful (Docker)
- ✅ No TypeScript/ESLint errors
- ✅ All components Material-UI compliant

---

## **Testing Notes**

**Manual Testing Required:**
1. Solo session end-to-end:
   - Start from catalog
   - Briefing → "Start Scenario"
   - Play round → Submit
   - WaitingScreen (calculating)
   - RoundResultsScreen → "Continue"
   - Repeat for 4 rounds
   - ScenarioResultsScreen → verify cumulative KPIs
   
2. Shared session end-to-end:
   - Trainer starts with player types
   - All players see briefing
   - Trainer starts Round 1
   - Players submit → WaitingScreen shows X/Y
   - RoundResultsScreen → all click "Ready"
   - Verify advancement waits for all
   - Complete scenario → verify final ranking

3. Edge cases:
   - Auto-submit for missing players
   - Freeze functionality (trainer)
   - Socket reconnection during phases
   - Status persistence on refresh

---

## **Documentation Updates**

- ✅ `concept.md` updated to Version 11.0
- ✅ Added section 1.3: "Unified Session Flow – Phase-Based State Management"
- ✅ Event system expanded to include ATC reduction events
- ✅ Sprint 23 Summary created

---

## **Known Issues / Future Work**

- ⚠️ Trainer UI not yet updated for new flow (still uses old session controls)
- ⚠️ No visual feedback for freeze state in Player UI
- ⚠️ Round-specific briefings not yet implemented
- ⚠️ Event previews in KSE don't show grid link effects yet

---

## **Metrics**

- **Files Modified:** 8
  - Backend: `scheduler.py`, `sessions.py`, `models.py`
  - Frontend: `Player.jsx`, `BriefingScreen.jsx` (new), `WaitingScreen.jsx`, `RoundResultsScreen.jsx`, `ScenarioResultsScreen.jsx` (new)
- **Lines Added:** ~850
- **API Endpoints Added:** 5
- **React Components Added:** 2
- **Socket Events Added:** 4

---

## **Next Sprint Priorities**

1. **Trainer UI Update** – Adapt session controls for new flow
2. **Round-Specific Briefings** – Show event warnings/tips before each round
3. **Event Preview Enhancement** – Visualize grid link events in KSE
4. **E2E Testing** – Automated tests for complete session flows
5. **Performance Testing** – Verify advance-round scaling with 80 players

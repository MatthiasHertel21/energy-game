# Player Input, Clearing Engine & Round Results Review

**Date:** 2026-02-16  
**Scope:** End-to-end review of player input processing, clearing/calculation engine behavior, and round-result display based on current codebase state.

## 1) Reviewed Code Areas

### Backend
- `backend/app/player.py` (forecast submission, gate checks, DA baseline APIs)
- `backend/app/scheduler.py` (round lifecycle orchestration, engine invocation, result persistence)
- `backend/app/engine.py` (market clearing, settlement, DAM/IDM logic, KPI calculation)
- `backend/app/sessions.py` (round results API and final results API)
- `backend/app/models.py` (Forecast/Result schema)
- `backend/app/kse.py` + `frontend/src/pages/KSE.jsx` (scenario/KSE config paths)

### Frontend
- `frontend/src/pages/Player.jsx` (input UI, submission payloads, websocket updates)
- `frontend/src/components/RoundResultsScreenSimple.jsx` (round KPI presentation)
- `frontend/src/components/DeviceDeepDiveTabs.jsx` (DAM/IDM deep-dive view)
- `frontend/src/components/ScenarioResultsScreen.jsx` (final cumulative view)

### Market-Code Reference
- `docs/market-code.md`
- `docs/market-code-compliance.md`
- `docs/market-code-compliance-summary.md`

---

## 2) End-to-End Processing (Actual Code Flow)

## 2.1 Player Inputs (Frontend -> Backend)

1. Player edits quantities and optional bid lots in `Player.jsx`.
2. Submission endpoint is `POST /api/player/forecast` with:
   - `session_id`
   - `round_num`
   - `hours` (slice for current round)
   - optional `devices` (per-device slice)
   - optional `bids` (currently sent as full-horizon lot arrays)
3. Backend `ForecastAPI.post` in `player.py`:
   - validates gates via `_get_tradeable_hours()`
   - checks locked-hour modifications vs previous forecast
   - validates bid structure and monotonicity
   - validates device forecast constraints
   - saves `Forecast(session_id, player_id, round_num, data.hours, bids, is_da_baseline)`
4. Optional full-horizon write is `POST /api/player/forecast/full` (stored as `round_num=0`).

## 2.2 Gate/Tradeability Logic (Backend)

`_get_tradeable_hours()` in `player.py` decides editable hours per round:
- reads `markets.dam/idm` trading state + gate parameters
- supports `on/off/market_code`
- Round 1 currently returns all hours tradeable
- Round 2+ uses next ID gate (`id_gate_interval_hours`, `id_gate_base_hour`)

## 2.3 Round Lifecycle & Engine Invocation

`run_rounds()` in `scheduler.py`:
1. transitions session state (`round_active` -> `round_closing` -> `calculating` -> `round_results`)
2. auto-submits missing players with zero slice
3. builds forecast bundle per player
4. calls `run_round(...)` in `engine.py`
5. persists one `Result` per player
6. emits websocket events (`market_cleared`, `round_results_ready`, etc.)

## 2.4 Clearing and KPI Calculation (Engine)

`run_round()` in `engine.py` currently includes:
- Day-1 baseline modes (`day_1_baseline` / fallback `day_one_baseline_mode`)
  - `Edit Round 1`
  - `Zero`
  - `Preset`
- DAM/IDM status read from `markets.*.clearing`
- early exit when both markets `off`
- DA baseline loading (from forecasts + round 1 result)
- IDM delta generation (`current_forecast - DA baseline`)
- synthetic curve generation + market clearing per hour
- KPI aggregation and round result payload

Also implemented recently:
- configurable synthetic capacity split and pricing adjustment in market config:
  - `dam_synthetic_capacity_pct` (default 90)
  - `idm_synthetic_capacity_pct` (default 10)
  - `idm_price_discount_producer_pct` (default 10)
  - `idm_price_markup_consumer_pct` (default 10)

## 2.5 Result Persistence and APIs

- `scheduler.py` persists `Result.data` with selected fields (`kpis`, `smp`, `volume`, `hourly_results`, `device_hourly_details`, ...)
- `Result.bid_dispatch` DB column is populated from `res.get("bid_dispatch")`
- round results API (`sessions.py`) builds `my_result` from `Result`
- frontend screens consume:
  - KPI cards (`RoundResultsScreenSimple.jsx`)
  - DAM/IDM deep dive tables (`DeviceDeepDiveTabs.jsx`)

---

## 3) Market Code Comparison (Soll/Ist)

| Topic | Market Code Expectation | Current Implementation | Assessment |
|---|---|---|---|
| Bid curves | Producer/consumer price-quantity bids | Implemented (A/B/C lots, validation) | Good |
| Monotonicity | Non-decreasing supply prices | Implemented in backend validation | Good |
| Gate closure | Hard gate logic, locked periods | Implemented, configurable, backend-enforced | Good (game-specific simplification) |
| Clearing method | Merit order + pro-rata | Implemented in `clear_market()` | Good |
| SMP | Marginal flexible unit | Implemented with inflexible filter logic | Good |
| IDP | VWAP with ±5% cap | Implemented (`calculate_idp`) | Good |
| DA vs ID separation | Distinct market commitments | Partially implemented, but persistence/API mapping inconsistent | Needs correction |
| Baseline handling | DA commitment as basis for ID updates | Implemented conceptually (baseline + delta), but mixed with round/result data assumptions | Needs hardening |
| Gate-close commitment | Hour-specific commitment at gate close | Partially represented; commitment is still heavily round-driven in persistence flow | Gap |
| No-clearing rounds | Possible by market settings | Implemented early exit when both clearings are `off` | Good |

---

## 4) Critical Findings (Codebase Reality)

## 4.1 DAM/IDM Storage Contract Is Inconsistent Across Layers

Engine returns DAM-specific keys in `result.data` for round 1 (`dam_bid_dispatch`, `dam_hourly_results`, ...), but scheduler persistence currently stores:
- `Result.bid_dispatch` from `res.get("bid_dispatch")` only
- `Result.data` from a fixed subset, not all engine output keys

Consequence:
- DAM payload created by engine can be dropped before reaching API/frontend.
- `sessions.py` round-results still fetches DAM from round-1 `Result.bid_dispatch`, not from `Result.data.dam_bid_dispatch`.

## 4.2 Display-Hours vs Clearing-Hours Logic Is Mixed

Current engine introduced `display_base_idx/display_span` and `clearing_base_idx/clearing_span`, but the main loop still clears over display hours (`for hour_offset in range(display_span)`), then conditionally changes synthetic curves by `is_clearing_hour`.

Consequence:
- Round result display requirement (round span hours) is addressed, but market-clearing semantics can drift because non-clearing display hours still go through `clear_market()`.

## 4.3 "Preset" Day-1 Baseline Uses Placeholder Pricing

For `day_1_baseline = Preset`:
- baseline volumes are generated from device capacities
- `da_smp` is set to hardcoded `400.0` (TODO in code)

Consequence:
- DA baseline economics are not market-cleared; settlement comparability is weakened.

## 4.4 Per-Hour Commitment Timeline Not Persisted as First-Class Data

Requested model: three timelines per device/hour
- forecast
- DAM committed offer
- IDM committed offer

Current state:
- forecast is stored (`Forecast` rows)
- committed DAM/IDM is inferable from selected result artifacts, but no canonical per-hour committed store exists
- no explicit immutable gate-close snapshot table keyed by hour+market

Consequence:
- auditability and exact replay of gate events is difficult.

## 4.5 Round-Results API Uses Mixed Data Sources

`sessions.py` composes DA/ID breakdown using:
- `Forecast` baseline rows
- current round forecast
- `Result` KPIs and `Result.bid_dispatch`

Consequence:
- UI can show coherent totals, but source-of-truth is split across forecast snapshots and partial result artifacts.

---

## 5) Round Result Display (What UI Shows Today)

## 5.1 Player Screen (`Player.jsx`)
- subscribes to websocket `market_cleared`
- appends `hourly_results` into hourly series charts
- uses `/api/player/da-baseline/:sessionId` for locking/timeline hints

## 5.2 Round Results (`RoundResultsScreenSimple.jsx`)
- fetches `/api/sessions/{sid}/round-results/{round}`
- displays KPI cards and optional cumulative toggle
- deep dive component receives `my_result`

## 5.3 Device Deep Dive (`DeviceDeepDiveTabs.jsx`)
- expects DAM + IDM separation in payload
- if DAM keys absent, falls back to single-market interpretation
- computes per-hour tables by lot and balancing details

Assessment:
- UI side is flexible and mostly ready for split-market payloads.
- backend persistence/API contract is currently the main bottleneck.

---

## 6) Compliance Verdict vs Market Code

**Strongly aligned**
- merit-order clearing and pro-rata principles
- bid validation fundamentals
- SMP and IDP mechanics (for game scope)
- backend gate enforcement concept

**Partially aligned / currently unstable**
- strict DAM/IDM commitment separation through to persisted round results
- hour-level gate-close commitment traceability
- baseline mode economics (`Preset` placeholder SMP)
- strict separation between "hours displayed in round" vs "hours newly cleared at gate"

---

## 7) Recommended Fix Plan (Priority Order)

1. **Unify result persistence contract**
   - Persist full engine payload keys used by UI (`dam_*`, `bid_dispatch`, `device_hourly_details`, `hourly_results`, metadata).
   - Stop relying on mixed `Result.bid_dispatch` + partial `Result.data` logic.

2. **Separate clearing computation from display projection**
   - Compute clearing only on gate window hours.
   - Build round display from canonical committed timeline for round span hours.

3. **Implement canonical commitment snapshots**
   - Store immutable per-hour market commitments at each gate close:
     - DAM committed offer
     - IDM committed offer (delta)
   - Keep forecast independently mutable until gate close.

4. **Complete `Preset` mode economics**
   - run real DAM clearing for preset baseline and derive DA price from clearing, not placeholder.

5. **Adjust round-results API to canonical timeline store**
   - Build `my_result` entirely from committed snapshots + settlement outputs.

---

## 8) Bottom Line

The codebase already contains many SAWEM-aligned mechanics, but the current DAM/IDM refactor is mid-transition: engine logic, persistence, and result APIs are not yet fully synchronized.  
For robust market-code conformity in player-visible results, the core next step is to establish one canonical hour-level commitment model and make all round-result APIs read from that model.

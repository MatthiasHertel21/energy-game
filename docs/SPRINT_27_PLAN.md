# Sprint 27 Plan – Zonal Pricing V1

Date: 2026-06-01
Owner: TBD

Goals
- Introduce a simplified zonal pricing V1 for new sessions only.
- Ensure each player is assigned to exactly one zone via `player_types[].zone`.
- Preserve exact current behavior for `zones = 1` and for multi-zone no-split cases.
- Replace Phase 1 post-processing price semantics with deterministic zonal market coupling and separate shortfall costs.

Scope
- [TKT-380](tickets/TKT-380.md) — KSE Validation And Zone Assignment For Zonal Pricing V1
- [TKT-381](tickets/TKT-381.md) — Deterministic Zonal Clearing And No-Split Canonicalization For V1
- [TKT-382](tickets/TKT-382.md) — Settlement And Dispatch Price Semantics For Zonal Pricing V1
- [TKT-383](tickets/TKT-383.md) — Result Payloads, Aggregation, And Market Structure For Zonal Pricing V1
- [TKT-384](tickets/TKT-384.md) — Player UI And Detail Views For Zonal Pricing V1
- [TKT-385](tickets/TKT-385.md) — Regression Coverage And Rollout Gate For Zonal Pricing V1

Product Cut
- Only new V1 sessions are in scope.
- `general.player_zone` is not used in V1.
- `player_types[].zone` is required for `zones > 1`.
- V1 does not use LP optimization or add a SciPy dependency.
- Losses are modeled as quantity reduction and may be reported separately on additive zonal/link outputs; they do not trigger a split on their own and must not alter canonical no-split market or KPI values.
- Shortfall remains a separate cost component and does not replace the normal market price.
- `shared_market` is allowed only when one player type maps to one zone.
- ATC remains symmetric; no ATC event types are added in V1.
- Existing global behavior remains canonical for `zones = 1` and no-split cases.
- `general.zonal_pricing_v1_enabled` gates the V1 path and defaults to `false`.

Out of Scope
- Compatibility or migration for old sessions.
- LP, nodal, AC, or welfare-maximization based market models.
- Mixed-zone `shared_market` player types.
- Per-link loss matrices or asymmetric ATC.
- ATC events such as `line_outage` or `atc_reduction`.
- Broader UI redesign beyond required zonal states.

Target Modules
- `backend/app/kse.py`
- `backend/app/engine.py`
- `backend/app/sessions.py`
- `backend/app/player.py`
- `frontend/src/pages/KSE.jsx`
- `frontend/src/pages/Player.jsx`
- `frontend/src/components/ScenarioResultsScreen.jsx`
- `frontend/src/components/MarketStructureChartPanel.jsx`
- `frontend/src/components/RoundResultsScreenSimple.jsx`
- `frontend/src/components/DeviceDeepDiveTabs.jsx`
- `frontend/src/utils/marketOverview.js`
- `backend/tests/test_interzonal_phase1.py`
- `backend/tests/test_round_results_interzonal_api.py`

Execution Order
1. Freeze validation and zone assignment rules.
2. Implement deterministic zonal clearing and no-split canonicalization.
3. Move settlement and dispatch detail rows to the `system_price` / `zone_price` model.
4. Extend payloads, aggregation, and player-facing visibility.
5. Harden with golden cases and a rollout gate.

Definition of Done
- Multi-zone scenarios reject missing, mixed, or ambiguous player-zone assignments.
- `zones = 1` output remains identical to the current global path.
- Multi-zone no-split output remains identical for all visible values.
- Split cases settle on local `zone_price` and expose separate congestion and loss data.
- Shortfall remains a separate cost line and does not overwrite market prices.
- API and UI surfaces use one consistent price semantic.
- Automated tests cover one-zone, no-split, split, losses, shortfall, and at least one complex multi-zone topology case.

Sprint Breakdown

## Phase 1 — Scenario Model And Validation
Tickets
- TKT-380

Goal: remove ambiguous zone assignment before touching pricing logic.

Work
- Require `player_types[].zone` for `zones > 1`.
- Reject `general.player_zone` in the V1 path.
- Reject mixed zone assignments inside the same player type when `shared_market` is active.
- Update KSE copy, validation messages, and defaults to reflect the new V1 model.

Exit Criteria
- A scenario either has a complete and valid zone model or fails early.
- No downstream engine code still depends on `general.player_zone` for V1 scenarios.

## Phase 2 — Clearing And Settlement
Tickets
- TKT-381
- TKT-382

Goal: implement the simplified zonal pricing core while protecting one-zone and no-split behavior.

Work
- Add `zone_id` to bid-building and dispatch-tracking structures.
- Implement `clear_market_coupled_atc(...)` as a deterministic zonal merit-order algorithm.
- Keep the existing global path unchanged for `zones <= 1`.
- Run a global reference clearing for `zones > 1` and use it to canonize all visible values when `zonal_pricing_active = false`.
- Settle split cases with local `zone_price`.
- Keep shortfall as a separate residual path after zonal clearing.
- Stop using `congestion_revenue_zar` as a price-driving term in the zonal path.

Exit Criteria
- One-zone and no-split golden cases are green.
- Split cases produce stable zone prices, flows, and separate congestion/loss values.

## Phase 3 — Results, Aggregation, And UI
Tickets
- TKT-383
- TKT-384

Goal: expose zonal states cleanly without regressing default screens.

Work
- Extend `hourly_results`, `zone_results`, `link_results`, `player_zone_info_by_player`, and `market_summary` for zonal prices and link metrics.
- Update session aggregation for split counts, zone prices, and price spreads.
- Extend market-structure responses for zonal previews.
- Keep default round result and player screens unchanged when `zonal_pricing_active = false`.
- Show local zone prices, link information, and separate shortfall signaling when `zonal_pricing_active = true`.
- Align debug/detail tables with the same price semantics.

Exit Criteria
- API payloads are internally consistent for no-split and split cases.
- UI shows no regression in default cases and clear zonal context in split cases.

## Phase 4 — Hardening And Rollout Gate
Tickets
- TKT-385

Goal: prove the model is stable enough to ship behind a controlled switch.

Work
- Add or update golden-case tests for `zones = 1`, no-split, split, losses, and shortfall.
- Add API assertions for zonal payloads and no-split canonicalization.
- Compare reference scenarios before and after the change, including at least one complex 3-5-zone topology (partial coupling, islanding, or multiple binding links).
- Wire the zonal path behind the scenario-level flag `general.zonal_pricing_v1_enabled` for rollout safety. The zonal path activates only when this flag is `true` and `grid.zones > 1`.

Exit Criteria
- No rollout if any `zones = 1` or no-split golden case drifts.
- No rollout if split cases mix `smp` and `zone_price` for the same business value.
- Feature toggle name and activation logic are documented consistently in backend, KSE, and release notes.
- Restore path to commit `7948f1c4a` remains documented.

Risks
- Validation gaps around player-zone assignment will leak ambiguity into settlement and UI.
- No-split drift is easy to miss if only top-level prices are checked instead of full visible outputs.
- Detail tables and debug views currently assume one `smp` per row and can silently diverge from top-level KPIs.
- `shared_market` can become inconsistent unless invalid mixed-zone setups are rejected before clearing.

Recommended Delivery Strategy
- Land validation changes first and fail invalid scenarios early.
- Treat one-zone and no-split compatibility as release blockers, not polish items.
- Keep the pricing algorithm deterministic and easy to explain.
- Delay UI expansion until backend price semantics are stable.
- Use `general.zonal_pricing_v1_enabled` only as rollout protection, not as a substitute for regression coverage.

Reference
- `ATC_ZONAL_PRICING_IMPLEMENTATION_CONCEPT.md`

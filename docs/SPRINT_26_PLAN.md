# Sprint 26 Plan – Interzonal Model Phase 1

Date: 2026-03-13
Owner: TBD

Goals
- Introduce a Phase 1 interzonal grid model with a global SMP and post-clearing physical feasibility checks.
- Add explicit zonal distribution of synthetic producers and consumers in the KSE.
- Implement deterministic interzonal routing with ATC constraints and per-link losses.
- Allocate shortage-driven grid constraint costs only to consumers in affected zones.
- Make zone status, extra costs, and link utilization visible in player round results.

Scope
- [TKT-375](tickets/TKT-375.md) — KSE Schema And Validation For Interzonal Model Phase 1
- [TKT-376](tickets/TKT-376.md) — KSE UI For Interzonal Synthetic Distribution And Grid Settlement
- [TKT-377](tickets/TKT-377.md) — Engine Interzonal Routing And Grid Constraint Settlement
- [TKT-378](tickets/TKT-378.md) — Round Result Payload And Player UI For Zone Status
- [TKT-379](tickets/TKT-379.md) — Regression Coverage For Interzonal Model Phase 1

Product Cut
- Commercial market clearing remains global with one SMP.
- Physical feasibility is evaluated per hour across 2 to 5 zones.
- Synthetic producers and consumers can be distributed explicitly across zones within existing `environment.groups` and `market.consumer_mix` structures.
- Existing player-type zone assignments are used for physical aggregation; `general.player_zone` is legacy fallback only.
- Deficit zones create separate grid constraint costs, not imbalance costs.
- Grid constraint costs are allocated only to consumers in the affected zone.
- Players see their zone, zone status, extra cost exposure, and local link utilization in round results.

Out of Scope
- Zonal SMP or separate market clearing per zone
- Full nodal or AC/DC power-flow simulation
- Redispatch compensation for constrained-off generation
- Topology-first visualization beyond cards and tables
- Broader market redesign outside the interzonal Phase 1 scope

Execution Order
1. Extend scenario schema and validation for zonal synthetic distributions and grid settlement settings.
2. Add KSE UI for zone distribution and advanced grid settlement configuration.
3. Implement engine-side zonal aggregation, routing, constrained-off generation, and shortage cost allocation.
4. Extend result payloads and player round results with zone and link visibility.
5. Add regression coverage across schema, engine, and UI.

Definition of Done
- Designers can configure zonal synthetic distributions and grid settlement rules in the KSE.
- Engine computes deterministic min-cost-flow interzonal routing for 2 to 5 zones.
- Generator export-constrained energy is tracked as constrained-off generation, not imbalance.
- Deficit zones create separate grid constraint cost allocated only to consumers.
- Player round results display zone, zone status, and link utilization.
- Automated tests cover one-zone fallback, multi-zone routing, shortages, and result payload extensions.

Sprint Breakdown

## Phase 1 — Scenario Model And KSE
- TKT-375
- TKT-376
- Ziel: Szenariomodell und Designer-Workflow für interzonale Konfiguration bereitstellen

## Phase 2 — Engine And Settlement
- TKT-377
- Ziel: deterministische Flüsse, constrained-off generation und shortage settlement korrekt implementieren

## Phase 3 — Player Visibility And Hardening
- TKT-378
- TKT-379
- Ziel: neue Netzlogik für Spieler verständlich machen und Regressionsfläche absichern

Risks
- Bestehende Logik verwendet Zonen bisher nur vereinfacht; echter Zonenbezug greift in mehrere Backend-Pfade ein.
- One-zone legacy scenarios and legacy `general.player_zone` fallback must remain stable while multi-zone logic expands significantly.
- Result payload growth can create frontend assumptions and backward compatibility risks.
- Deterministic min-cost-flow routing must stay transparent and reproducible across 2 to 5 zones.

Recommended Delivery Strategy
- Start with schema defaults and one-zone backward compatibility.
- Keep routing deterministic and test-first before exposing all UI states.
- Expose advanced settlement and curtailment rules in KSE, but ship with conservative defaults.
- Land payload extensions before polishing player-side explanation text.

Reference
- [docs/INTERZONAL_MODEL_PHASE1_SPEC.md](INTERZONAL_MODEL_PHASE1_SPEC.md)
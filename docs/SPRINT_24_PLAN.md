# Sprint 24 Plan – Scoped Round Inputs

Date: 2026-03-10
Owner: MatthiasHertel21

Goals
- Reduce hourly input complexity for players in training scenarios.
- Prevent invisible default bids from affecting round outcomes.
- Keep player input and round results visually consistent.

Scope
- [TKT-366](tickets/TKT-366.md) — KSE Player Hour Scope Configuration
- [TKT-367](tickets/TKT-367.md) — Player Input Scope Enforcement And Hidden-Hour Zeroing
- [TKT-368](tickets/TKT-368.md) — Round Results Respect Hidden Hour Scope
- [TKT-369](tickets/TKT-369.md) — Regression Coverage For Scoped Round Inputs

Product Cut
- V1 supports:
  - All hours playable
  - First hour per round
  - First two hours per round
  - First three hours per round
  - Custom round offsets
- Hidden non-editable hours are submitted as 0.
- Results hide inactive hours where the scenario requests hidden mode.

Out of Scope
- Time-of-day windows such as 08:00-12:00
- Player-type-specific hour scopes
- Lot-specific hour scope per bid tier
- Advanced reporting filters beyond hidden-hour consistency

Execution Order
1. KSE config and validation
2. Player input enforcement and submit normalization
3. Result filtering for hidden hours
4. Regression coverage and PV-style smoke case

Definition of Done
- Scenario config supports scoped round inputs.
- Player UI enforces the scope in chart and field editors.
- Hidden hours are zeroed on submit in frontend and backend.
- Round results no longer expose hidden inactive hours in the device detail view.
- Existing scenarios without the feature remain backward compatible.
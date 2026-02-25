# Designer Guide

Last updated: 2026-02-25  
Audience: Scenario/Campaign Designers

## 1) Design objective

Create scenarios where decisions are meaningful, outcomes are explainable, and learning goals are measurable.

## 2) Design scope

You own:
- scenario structure and pacing,
- market mechanics and timing,
- role/device composition,
- events, challenges, and scoring calibration.

## 3) Configuration layers

Treat the scenario as layers:
- `general` (time model),
- `market/markets` (economic mechanics),
- `devices/player_types` (capabilities),
- `events` (dynamic pressure),
- `challenges/scoring` (behavior incentives).

## 4) Event design quality

Events should:
- activate at teachable moments,
- target intended role/device scope,
- create adaptation pressure without making recovery impossible.

Use outage/demand/boost events intentionally and verify effect visibility in detail reports.

## 5) Validation before rollout

- static ID/reference checks,
- one-role dry run,
- multi-round run with event checkpoints,
- shared-mode trainer flow check,
- KPI-to-detail reconciliation review.

## 6) Common pitfalls

- target ID mismatches,
- unrealistic timing/gate combinations,
- challenge targets disconnected from controllable actions,
- event intensity that overwhelms strategy.

## 7) Governance and versioning

For each revision document:
- changed fields,
- intended effect,
- validation evidence,
- rollback reference export.

# Player Guide

Last updated: 2026-02-25  
Audience: Players

## 1) Purpose of this guide

This guide helps you make better decisions during a session, not just click through screens.  
You will learn:
- what to do before each round,
- how to read market timing correctly,
- how to avoid expensive imbalance outcomes,
- how to interpret your round report and adjust strategy.

## 2) Round lifecycle (what happens in practice)

Each round follows the same basic loop:
1. **Preparation**: read active task/events and check tradable hours.
2. **Planning**: decide quantities and prices per device/lot.
3. **Submission**: submit before timer ends.
4. **Settlement**: backend clears markets and computes KPIs.
5. **Review**: analyze round results and prepare your next move.

### Quick decision checklist before submit

- Did you check current round window and gate state (DA/ID)?
- Are quantities realistic versus effective capacity/demand?
- Are your lot prices intentional (not accidental leftovers)?
- Do your key hours match expected market conditions?

## 3) Main pages and statuses

- `Briefing`: scenario context, your role, devices, objectives, and starting assumptions.
- `Running / Round Active`: primary workspace for bids, charts, and market view.
- `Round Closing / Calculating`: no edits, engine is processing outcomes.
- `Round Results`: KPI cards, detail tables, and interpretation hints.
- `Scenario Complete`: final summary and debrief screens.

## 4) Shared-market behavior after submit

In trainer-led shared sessions, once you submit:
- you see participant submit status,
- you cannot advance the round yourself,
- trainer controls progression.

Expected message: “Please wait: The trainer will advance to the next phase.”

## 5) Working with devices and bids

### Single-series mode

- You edit one hourly quantity profile per device.
- Best for quick baseline strategies.

### Multi-bid mode (lots A/B/C)

- You set **price + quantity** per lot.
- Typical intent:
  - **Lot A (Base)**: high probability / conservative price.
  - **Lot B (Mid)**: conditional volume.
  - **Lot C (Peak)**: opportunistic, price-sensitive part.

### Three practical patterns

1. **Stability pattern**: large base lot, limited peak lot.  
2. **Price-seeking pattern**: moderate base, bigger mid/peak spread.  
3. **Risk-control pattern**: reduced offered quantity in uncertain/event rounds.

## 6) Market timing, gate logic, and editable hours

Not every hour is tradable in every round. The timeline and hour status indicators are your source of truth.

Important implications:
- locked hours cannot be changed anymore,
- freeze logic may restrict late edits,
- DA and ID availability differ by round and scenario rules.

If something is disabled, assume timing rule first (not a bug).

## 7) Events: how they should influence your decisions

Events can modify capacity/demand with multiplier/additive logic before clearing.  
Example: outage event with multiplier `0.2` means available capacity is heavily reduced.

Player rule:
- if capacity is event-reduced, lower offered quantities immediately,
- avoid selling/buying volumes you likely cannot physically deliver/consume,
- verify effective capacity row in detail report after the round.

## 8) Reading round results correctly

### KPI cards (top level)

- **Revenue / Costs**: settled market value.
- **Profit / Net result**: revenue minus cost components.
- **Dispatched/Consumed MWh**: physically settled quantity.
- **Imbalance Cost**: penalty/cost from mismatch between planned and actual.

### Why high imbalance happens

Common causes:
- event-driven capacity drop,
- aggressive quantities despite lower effective capacity,
- large plan vs actual mismatch across key hours.

### How to use the detail table

Check these rows in order:
1. `Base Capacity/Demand` vs `Effective Capacity/Demand`
2. `Offered/Demanded` vs `Dispatched/Consumed`
3. `Imbalance (MWh)` and `Imbalance Cost`
4. `Net Revenue/Cost`

If effective capacity is much lower than base and imbalance is high, your next round should reduce risk exposure.

## 9) Fast strategy adaptation after a bad round

If profit drops due to imbalance:
- cut risky volume in affected hours,
- keep core volume in safer lot/price range,
- re-check event scope (your role/device or all players),
- prioritize deliverability over upside in outage rounds.

If dispatch is too low:
- compare your lot prices with SMP/IDP in the report,
- adjust price levels where bids were priced out,
- separate “must clear” and “opportunistic” quantities across lots.

## 10) Common mistakes and how to avoid them

- **Mistake**: leaving old quantities active after an event starts.  
  **Fix**: always re-open key devices at round start and check event banner.

- **Mistake**: treating base capacity as guaranteed.  
  **Fix**: use effective capacity as operational limit.

- **Mistake**: focusing only on revenue and ignoring imbalance.  
  **Fix**: track imbalance cost per hour in every result review.

- **Mistake**: submitting too late without sanity check.  
  **Fix**: reserve last 60–90 seconds for a cross-device review.

## 11) Troubleshooting

- Inputs disabled: verify round status, gate/freeze state, and timer.
- Waiting screen after submit: expected in shared mode; trainer advances.
- Values look stale: reload once and re-open session.
- Unexpected KPI numbers: inspect hourly imbalance and event impact first.

## 12) Personal improvement routine (recommended)

After each round, capture three notes:
1. one thing that worked,
2. one source of avoidable cost,
3. one concrete adjustment for next round.

This creates a repeatable learning loop and usually improves results after 2–3 rounds.

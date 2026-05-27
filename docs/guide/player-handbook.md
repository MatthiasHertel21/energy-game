# Player Guide

Last updated: 2026-05-27
Audience: Players

## 1) What this guide helps you do

This guide is for players who want to understand both the screen flow and the market logic behind it.
You should finish it knowing:
- where to enter and resume sessions,
- how to work with the active-round screen,
- how bidding, timing, and editable-hour restrictions affect you,
- how to read round and scenario results well enough to improve in the next round.

## 2) Your normal player journey

### Home

`/home` is your landing page after login. It shows:
- active or resumable sessions,
- live trainer-led shared sessions you can join,
- quick session statistics,
- an `Ask AI` helper for page-specific guidance.

Use Home if you want to resume the most important open session quickly.

### Campaign Catalog and Campaign Detail

`/catalog` and `/catalog/:id` are your main entry points for starting work:
- browse published campaigns,
- open a campaign to see the scenario sequence,
- start a fresh solo session,
- join a currently running trainer-led shared session if one exists for that scenario,
- re-open one of your recent completed runs for review.

Important: the catalog starts a new solo run. It does not continue an old solo session in place.

### Briefing

Before the first live round, the `Briefing` screen shows:
- scenario description,
- Solo Mode or Shared Market mode,
- number of rounds and round duration,
- required and optional challenges,
- your selected player type and assigned devices,
- an `Ask Briefing AI` helper.

In solo sessions you start the scenario yourself. In shared sessions the trainer may control the start.

### Profile and Replay

Outside the live round you also have:
- `Profile` for name, bio, career statistics, and recent session history,
- `Replay` for SMP and volume over rounds, plus per-round player KPI tables and PNG/SVG exports.

## 3) Session lifecycle and control model

The most important statuses are:
1. `Briefing`
2. `Running` or `Round Active`
3. `Round Closing` or `Calculating`
4. `Round Results`
5. `Scenario Complete`

Shared-mode rule:
- after you submit, you wait,
- the trainer advances the session,
- you do not control the transition into the next round yourself.

If you see a waiting message after submit, that is usually expected behavior in shared mode.

## 4) Active round workspace

The player screen is organized into three working areas:

- **Left column**: active events, tasks, challenges, and round context.
- **Middle column**: bid entry in chart view or field view.
- **Right column**: market insight tabs and the `My Devices` card.

Useful helpers on this screen:
- `Ask About This Round` explains the current situation with the live round context.
- `Briefing` access lets you revisit the scenario setup.
- trainer broadcasts appear as in-app notifications during live shared sessions.

### Hour editing behavior

The hour chips and timeline indicators are the source of truth for editability:
- editable hours can be changed,
- locked hours are blocked by timing, freeze rules, or scenario input scope,
- some scenarios enable smooth dragging, where neighboring editable hours move with falloff,
- other scenarios restrict dragging to the selected hour only.

If a field is disabled, assume scenario timing or hour-scope rules first.

## 5) Working with devices and bids

### My Devices card

The device card on the right summarizes what you control:
- device name and type,
- generator capacity or load baseline/peak,
- battery power, energy, efficiency, and auto-bid capability where configured,
- variable cost tiers for coal and gas,
- fixed cost per hour when configured.

Important: charts and max-power reference lines use the **effective** capacity for the current round, not just the static nameplate value. Effective capacity can change because of hourly profiles, seasonal effects, events, and round context.

### Implicit mode

If a device has no explicit bid layers configured, you edit one hourly profile for that device.
This is the simplest way to play and is common for baseline strategies.

### Explicit multi-bid mode

Some devices support explicit bidding with up to five lots:
- `A` - Baseload
- `B` - Mid-Merit
- `C` - Peak
- `D` - Reserve
- `E` - Flex

In this mode you set both **price** and **quantity** per lot. The default split used by the UI is `50 / 20 / 15 / 10 / 5` unless the scenario defines custom defaults.

How clearing works in practice:
- lower-priced lots are considered first,
- clearing proceeds from cheapest to most expensive bids until demand is met,
- all cleared lots settle at the System Marginal Price (SMP), not at their own bid price.

Practical use:
- keep essential volume in cheaper, high-probability lots,
- place riskier or opportunity volume in higher lots,
- reduce total volume when events or low effective capacity increase delivery risk.

### Battery auto-bid mode

If a battery allows auto-bidding, you can switch from manual hourly control to thresholds:
- `Charge below price`: the battery charges when SMP is at or below this value.
- `Discharge above price`: the battery discharges when SMP is at or above this value.

While auto-bid is active:
- manual battery curves are disabled,
- battery actions are capped by power, state of charge, and efficiency,
- a discharge threshold above the charge threshold is usually the sensible setup.

## 6) Market timing and editable-hour scope

The app can restrict what you may edit in a round. Common patterns are:
- all hours editable,
- only the first hour editable,
- only the first two or three hours editable,
- custom hour offsets inside the round.

Additional scenario settings may also apply:
- hidden non-editable hours are not shown and are submitted as `0`,
- future or past rounds may be locked if `allow_other_rounds_editing` is disabled,
- DAM and Intraday participation can differ by round.

The market insight tabs help you understand what is open:
- `Day-Ahead` shows supply, demand, SMP, and volume for the round view.
- `Intraday` shows ID-related price and volume information when intraday trading is active.

## 7) Events and what they mean for you

Events can change capacity or demand before clearing. The most important player consequence is simple:
- if events lower effective capacity, reduce risky volume immediately,
- if events increase demand or opportunity, check whether your available volume still fits your technical limits,
- confirm the event impact in the result tables afterward.

The engine applies event effects before settlement. That is why old bids can become dangerous when a new event starts.

## 8) Reading round results correctly

### KPI cards

Round Results can show both current-round and cumulative values. Common KPI categories are:
- revenue,
- profit,
- variable cost,
- fixed cost,
- imbalance cost,
- curtailment cost,
- ATC or grid-constraint cost,
- CO2 emissions,
- planned, actual, and dispatched MWh.

### Best order for diagnosis

Read the result in this order:
1. Base vs effective capacity or demand
2. Planned or offered vs dispatched or consumed volume
3. Imbalance MWh and imbalance cost
4. Curtailment and grid-related costs
5. Final profit or net result

### Extra result tools you should use

The results screen includes more than the KPI cards:
- a `Market Overview` dialog for round-wide price, volume, participant, and zone context,
- device deep-dive tabs with device-level hourly breakdowns,
- hour-by-hour matrix tables that show where the mismatch started.

If a result looks surprising, open those detail layers before changing strategy.

## 9) Scenario complete screen

At the end of a scenario you get a final summary with:
- cumulative KPIs,
- final ranking,
- round history,
- challenge completion,
- market summary cards.

Use this screen together with `Replay` and `Profile` if you want to compare what happened over several rounds or several sessions.

## 10) Fast adjustment rules after a bad round

If imbalance cost is too high:
- lower volume in the affected hours,
- move critical volume into safer lots,
- re-check event scope and effective capacity,
- prioritize deliverability over upside.

If dispatch is too low:
- compare your bid prices against SMP or intraday prices,
- lower the price of the volume that must clear,
- separate must-clear and optional volume more clearly across lots.

If the screen feels too restrictive:
- check whether you are looking at hidden or non-editable hours,
- check gate timing and freeze state,
- check whether the round has already moved into closing or results.

## 11) Common mistakes

- Leaving old bids unchanged after an event starts.
- Treating static capacity as guaranteed instead of using effective capacity.
- Looking only at revenue while ignoring imbalance and curtailment.
- Using too many aggressive lots without reserving a safe base volume.
- Waiting until the final seconds instead of leaving time for a cross-device sanity check.

## 12) Troubleshooting

- Inputs disabled: verify round status, gate timing, and hour-scope restrictions.
- Waiting after submit: expected in shared mode until the trainer advances.
- No active session found: return to Home or Campaign Catalog and start or join again.
- Numbers look wrong: inspect market overview, device deep-dive tabs, and hourly imbalance before escalating.
- Stale UI state: reload once and re-open the session.

## 13) Personal improvement routine

After each round, write down:
1. one thing that worked,
2. one avoidable source of cost,
3. one concrete change for the next round.

That small loop is usually enough to improve within two or three rounds.

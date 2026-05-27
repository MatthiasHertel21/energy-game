# Designer Guide

Last updated: 2026-05-27
Audience: Scenario and Campaign Designers

## 1) What the designer role owns

Designers define the market mechanics that players and trainers experience. Good design in EMSG means:
- players can see the consequence of their choices,
- events create explainable shifts instead of random-feeling punishment,
- trainers can debrief outcomes from the data that the UI actually exposes.

You are responsible for:
- scenario structure,
- time and gate logic,
- device and player-type composition,
- event and challenge design,
- grid realism and playability,
- maintaining scenario JSON quality over time.

## 2) Main design surfaces

### `/designer`

This is the scenario overview page. It gives you:
- the current scenario list,
- `Add Scenario` to open the editor,
- `AI Assistant` to open the design assistant.

### `/kse`

This is the main scenario editor. It combines:
- eight configuration tabs,
- validation output,
- sticky save actions,
- import and export,
- preview tools embedded into the editor.

### `/ksechat`

The KSE assistant can:
- explain scenario logic,
- propose new or changed scenario JSON,
- open generated JSON directly in the editor,
- overwrite a selected scenario after review.

Use it as a drafting or review assistant, not as a substitute for validation.

## 3) Recommended mental model of a scenario

Think of a scenario as six layers that should reinforce each other:
- `general`: rounds, timing, freeze, balancing behavior,
- `market` and `markets`: price bounds and per-round trading availability,
- `devices` and `player_types`: technical possibilities and role identity,
- `events`: controlled disruption and opportunity,
- `grid`: zone realism and congestion consequences,
- `challenges` and `player_input`: what players are pushed to optimize and what they are actually allowed to edit.

If one layer teaches a different lesson than the others, the scenario will feel inconsistent.

## 4) What the KSE editor currently covers

### Description tab

Use this for scenario naming and descriptive framing. Keep the text debrief-friendly because players see it again in Briefing.

### General tab

This is where you shape the session rhythm:
- number of rounds,
- round span and round duration,
- balancing settings,
- player hour scope,
- smooth dragging behavior,
- whether ramp-rate validation is active,
- preview seed, date, and time used for profile-aware previews.

### Supply and Demand tab

This tab covers:
- device setup,
- synthetic supply and demand context,
- profile editing for hourly and seasonal behavior,
- the visual preview that helps you inspect how configuration choices affect curves.

### Markets tab

This is where you define:
- market price envelope,
- DAM and IDM trading availability by round,
- whether each round is gated, always enabled, or disabled.

Important: trading availability controls whether players can submit bids. Clearing is still executed by the engine.

### Grid tab

This tab controls the zonal model:
- number of zones,
- ATC matrix,
- transmission losses per link,
- network-settlement settings,
- generator curtailment rule,
- legacy player-zone fallback,
- synthetic transfer-requirement preview.

### Events tab

This tab is for event creation, duplication, editing, and deletion.

### Player Types tab

This tab defines the playable roles:
- name and description,
- zone assignment,
- device assignment,
- explicit bidding behavior per device.

### Challenges tab

This tab defines formal objectives and scoring logic, including required and per-round challenges.

### Validation and import/export

Outside the content tabs, the editor also provides:
- a `ValidationPanel` with direct navigation to issues,
- `Import/Export` with `Save/Export` and `Import` tabs,
- schema-version aware import behavior,
- JSON download for peer review and rollback.

## 5) Device design and presets

The current preset library includes:
- `coal`
- `gas`
- `hydro`
- `nuclear`
- `solar`
- `wind`
- `battery`
- `industrial_load`
- `commercial_load`
- `residential_load`

### Cost structure

Coal and gas support `variable_cost_tiers`, for example:

```json
"variable_cost_tiers": [
  { "from_pct": 0, "to_pct": 60, "cost_zar_per_mwh": 380 },
  { "from_pct": 60, "to_pct": 90, "cost_zar_per_mwh": 440 },
  { "from_pct": 90, "to_pct": 100, "cost_zar_per_mwh": 520 }
]
```

These tiers matter because:
- players see them in `My Devices`,
- default bid hints are derived from them,
- marginal cost can rise materially at high utilization.

### Battery and automation

Battery devices can expose `auto_bid_allowed` so players may switch to threshold-based charging and discharging instead of manual curves.

### Emissions and technical defaults

The editor also carries default CO2 values and technical defaults for several preset types. Use those as a starting point, not as a reason to skip scenario-specific realism checks.

## 6) Explicit bidding and player-type design

### Bid layers

Devices can stay in implicit mode or use explicit bid layers:
- `bid_count = 0` keeps the device in implicit offer mode,
- higher bid counts create explicit price layers,
- the player UI supports up to five lots `A` through `E`.

The default lot-share pattern is `50 / 20 / 15 / 10 / 5`, but you can override default shares and default prices per device.

### Player types

Each `player_type` should have a coherent identity:
- a clear strategic purpose,
- a realistic device bundle,
- role-specific learning pressure,
- explicit zone location in multi-zone setups.

Important: in the current grid model, `player_types[].zone` is the authoritative physical location. `general.player_zone` is only a legacy fallback for older scenarios.

## 7) Player input scope and usability controls

You can shape what the player may edit with `player_input`:
- `mode`: `all_hours`, `first_hour`, `first_two_hours`, `first_three_hours`, or `custom_offsets`,
- `editable_offsets`: zero-based offsets inside the round,
- `hide_non_editable_hours`,
- `allow_other_rounds_editing`,
- `enable_smooth_drag`.

Important implementation detail:
- hidden non-editable hours are submitted as `0`,
- if editing in other rounds is disabled, off-round hours stay locked until their round becomes active.

Use these restrictions intentionally. They are a major driver of perceived difficulty.

## 8) Event design in the current editor

The event editor lets you define:
- trigger by round or probability per round,
- duration in rounds,
- event type such as systemic, player-specific, or device-related,
- target scope such as all, zone, player, or device,
- impact via multiplier and additive values.

The engine applies **multiplier first, additive second**.

Good event design rules:
- use multiplier-based reductions for technical availability shocks,
- use additive shifts when you want a more direct, flat demand or capacity move,
- make sure the target and narrative line up,
- leave enough time for players to react.

## 9) Challenge design and scoring

Challenges currently support:
- metric,
- operator,
- target,
- points,
- required flag,
- per-round flag,
- applicable player type.

Use required challenges only when failing them should really count as scenario failure. Per-round challenges are strong difficulty multipliers because they must hold repeatedly, not just once.

A good challenge:
- rewards something the player can influence,
- aligns with the visible KPIs,
- does not conflict with the scenario narrative.

## 10) Grid and congestion design

The current zonal model supports:
- `grid.zones` from 1 to 5,
- symmetric `grid.atc` matrices with diagonal 0,
- `grid.losses_pct_per_link`,
- `grid.network_settlement` settings,
- `grid.generator_curtailment_mode` values such as `pro_rata`, `reverse_merit_order`, `renewables_first`, and `renewables_last`.

The synthetic transfer preview is a planning aid. It helps you see whether your configured zonal supply and demand would obviously exceed the available transfer capacity before players ever submit bids.

Practical warning:
- if ATC is too low, grid effects dominate strategy,
- if ATC is too high, the grid becomes decorative instead of educational.

## 11) Validation workflow before release

Use a fixed release routine:
1. **Static validation**
	- no broken IDs,
	- no impossible offsets,
	- no invalid zone configuration.
2. **Solo dry run**
	- play one role through multiple rounds,
	- confirm the result tables stay interpretable.
3. **Shared-mode rehearsal**
	- test trainer progression,
	- test waiting-state behavior,
	- test debrief with actual outputs.
4. **Grid sanity check**
	- inspect zone preview,
	- confirm shortfall and curtailment behavior are not overwhelming.

## 12) Versioning and collaboration

For every meaningful revision, capture:
- what changed,
- why it changed,
- the expected player impact,
- what you validated.

Use JSON export snapshots for peer review, rollback, and comparison against AI-generated proposals from KSEChat.

## 13) Common design mistakes

- Assigning the wrong event target or wrong player type.
- Using bid-layer complexity without adjusting round time or input scope.
- Building challenges that reward metrics players cannot influence.
- Creating grid constraints so tight that all rounds collapse into the same congestion lesson.
- Forgetting that trainers need explainable outcomes, not only technically valid ones.

## 14) Pre-launch checklist

- The scenario description is clear enough for Briefing.
- Player types have distinct strategic identities.
- Hour-scope restrictions match the intended difficulty.
- Events are visible in the result outputs.
- Grid setup is educational, not accidental.
- Challenge wording matches the KPI names players and trainers will see.
- The trainer can explain the top failure modes after one full rehearsal.

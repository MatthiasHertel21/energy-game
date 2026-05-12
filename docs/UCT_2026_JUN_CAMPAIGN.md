# Power Markets and Trading in Africa (UCT 2026-Jun)

This document describes the campaign seeded by `backend/scripts/seed_uct_2026_jun_campaign.py`.

## Campaign

- Name: `Power Markets and Trading in Africa (UCT 2026-Jun)`
- Owner: `admin@fastbreak.one`
- Source inputs:
  - `docs/input/Simulation Game Plan_revised.xlsx`
  - Course schedule image provided in chat context

## Scenario sequence

The scenario names intentionally match the Excel column names exactly.

1. `Level 1 - Market mechanics`
2. `Level 2a - Price formation bidding strategy`
3. `Level 2b - Grid constraints and market power`
4. `Level 3a - Forecating and information`
5. `Level 3b - RES dominated system`

## Design mapping

### Level 1 - Market mechanics

- Focus: Market Foundations
- Learning objective: understand who does what, when, and how in the DAM
- App design: generator-only DAM setup with three producer portfolios sized at 400 MW, 500 MW, and 600 MW
- Market simplification: single zone, fixed synthetic demand, no forecast uncertainty, no IDM
- Didactic intent: isolate merit order, SMP formation, dispatch logic, and infra-marginal rent without strategic or forecast complexity
- Player guidance: one task in every round and required revenue targets for each generator portfolio

### Level 2a - Price formation bidding strategy

- Focus: Price formation and clearing
- Learning objective: understand bidding and market clearing
- App design: two generator portfolios plus a `Retailers/Load` participant, with strategic pricing and up to three offer blocks
- Market simplification: single zone, deterministic DAM, no IDM
- Didactic intent: move from mechanical clearing to strategic bidding, margin versus volume, and basic procurement behavior
- Player guidance: one task in every round plus required cost and coverage goals for `Retailers/Load`

### Level 2b - Grid constraints and market power

- Focus: Price formation and clearing
- Learning objective: understand bidding and market clearing with grid constraints
- App design: two generator portfolios plus a `Retailers/Load` participant, distributed across two zones with a constrained interconnector
- Market simplification: deterministic DAM, no IDM, congestion-driven market power
- Didactic intent: show that location and transfer constraints matter, not only plant cost or total demand
- Player guidance: one task in every round plus goals that distinguish profitable bidding from secure procurement under congestion

### Level 3a - Forecating and information

- Focus: Forecast and information
- Learning objective: trading under uncertainty and managing imbalance risk
- App design: two participant roles matching the Excel, `Generators` and `Retailers/Load`, with renewable and battery assets embedded in the generator portfolio
- Market behavior: forecast revisions trigger IDM corrections and balancing exposure
- Didactic intent: introduce the sequence DAM -> updated forecast -> IDM correction -> balancing outcome
- Player guidance: one task in every round, two systemic information shocks, and required goals on revenue or cost plus coverage/imbalance control

### Level 3b - RES dominated system

- Focus: Forecast and information
- Learning objective: trading under uncertainty in a RES dominated system
- App design: two participant roles matching the Excel, `Generators` and `Retailers/Load`, with the generator portfolio dominated by RES plus battery and a smaller thermal backup unit
- Market behavior: renewable volatility and evening ramps make flexibility central
- Didactic intent: shift the core insight from price formation to flexibility, storage timing, and scarcity during the evening ramp
- Player guidance: one task in every round, two systemic shocks, and required plus optional goals tied to balancing discipline and security of supply

## Language and naming

- All scenario descriptions, player-type descriptions, task cards, and goals are in English.
- The scenario title `Level 3a - Forecating and information` intentionally keeps the Excel spelling, even though `Forecasting` would be the corrected spelling.
- Device names were adjusted to be clearer from a teaching perspective, for example `Coal Unit A (Low Cost)` or `Flexible Thermal Unit`.

## Guidance model

- Every scenario now contains explicit round-by-round `task` events.
- `Level 1`, `Level 2a`, and `Level 2b` each contain 6 task events for 6 rounds.
- `Level 3a` and `Level 3b` each contain 4 task events for 4 rounds, plus 2 systemic events that create the forecast or system shocks to react to.
- Every player role now has mandatory and optional `challenges`, so the distinction between core learning objective and stretch goal is visible in the UI.

## Remaining tradeoff

- `Level 2a` and `Level 2b` now use two generator portfolios instead of three separate producer teams. This is the compromise point between Excel faithfulness and still having visible strategic interaction in class.

## Trainer Notes

### Level 1 - Market mechanics

- Trainer emphasis: keep the discussion mechanical. Do not jump too early into strategy or game theory.
- Best debrief question: which unit set the SMP, and why were all dispatched units paid that same price?

### Level 2a - Price formation bidding strategy

- Trainer emphasis: force teams to state a written bidding logic before they enter values.
- Best debrief question: which team chose margin, which chose volume, and what did that do to dispatch?

### Level 2b - Grid constraints and market power

- Trainer emphasis: always debrief by zone, not only by system total.
- Best debrief question: who became pivotal because of location rather than cost?

### Level 3a - Forecating and information

- Trainer emphasis: walk the class through the sequence `DAM -> updated forecast -> IDM -> balancing` every round.
- Best debrief question: who was long, who was short, and which IDM correction actually reduced balancing cost?

### Level 3b - RES dominated system

- Trainer emphasis: point out the shift from static price formation toward flexibility and timing.
- Best debrief question: what was the highest-value use of flexibility before and during the evening ramp?

## Round Moderator Cards

### Level 1 - Market mechanics

- Round 1: ask every team to predict the SMP before results are shown; debrief only whether they identified the likely marginal unit correctly.
- Round 2: ask teams to explain dispatch in merit-order language, not in profit language.
- Round 3: ask what small demand increase would pull the high-cost unit into dispatch and why that matters for everyone.
- Round 4: ask whether changing offered volume changed the market outcome or only the team's own dispatched volume.
- Round 5: ask low-cost teams to quantify infra-marginal rent and high-cost teams to explain what they are waiting for.
- Round 6: close with a board-level profit bridge: dispatched MWh, SMP, variable cost, profit.

### Level 2a - Price formation bidding strategy

- Round 1: force each team to write its bidding logic before entry: defend dispatch, chase margin, or split the difference.
- Round 2: ask the retailer/load team what share of demand it wanted to secure and what share it exposed to price risk.
- Round 3: compare which generator portfolio chose volume and which chose margin; ask what the trade-off cost them.
- Round 4: isolate the price-setting block and ask why that exact offer cleared where it did.
- Round 5: require every team to name one rule it is changing in its bidding logic before resubmitting.
- Round 6: debrief whether multi-block bidding improved strategy or only hid weak assumptions.

### Level 2b - Grid constraints and market power

- Round 1: start the debrief by drawing the two zones and the import direction before discussing any prices.
- Round 2: ask the retailer/load team in Zone 2 whether the procurement problem was energy scarcity, congestion, or both.
- Round 3: ask each generator team whether it is price-setting because of cost or because of location.
- Round 4: identify the pivotal unit under binding ATC and ask how the same unit would behave without the grid constraint.
- Round 5: make teams state their next action in zonal terms, not system-average terms.
- Round 6: close with the policy question: which market-power mitigation rule would change this result most?

### Level 3a - Forecating and information

- Round 1: ask both teams to state their initial DAM position and what forecast assumption is carrying the most risk.
- Round 2: after the PV revision, ask which IDM trade removes the largest balancing exposure first.
- Round 3: after the load revision, ask who is now long, who is short, and which side can still correct in time.
- Round 4: debrief the full chain in order: DAM decision, forecast update, IDM correction, balancing outcome.

### Level 3b - RES dominated system

- Round 1: ask how much flexibility should be preserved for the evening ramp instead of spent during midday abundance.
- Round 2: after cloud cover, ask whether the battery should serve balancing protection, arbitrage, or both.
- Round 3: make both teams explain their evening-ramp plan before the final scarcity period arrives.
- Round 4: close by identifying what created value in the last round: timing, storage, thermal backup, or disciplined procurement.

## Likely Participant Misconceptions

### Level 1 - Market mechanics

- Teams may think the highest bid is always paid to the highest-cost unit only; the correction is that all dispatched generators receive the same uniform clearing price.
- Teams may think profit depends only on offered quantity; the correction is that profit depends on dispatched MWh at the SMP minus variable cost.
- Teams may explain dispatch with strategy language too early; the correction is that this level is about merit order, not about strategic markups.

### Level 2a - Price formation bidding strategy

- Generator teams may assume higher bid prices always improve profit; the correction is that higher prices can also remove dispatch volume and reduce total profit.
- The retailer/load team may treat willingness-to-pay as a passive input; the correction is that procurement strategy changes coverage risk and price exposure.
- Teams may use multi-block bidding without a clear logic; the correction is that each block should represent a deliberate trade-off between margin and dispatch probability.

### Level 2b - Grid constraints and market power

- Teams may look only at total system balance; the correction is that scarcity can exist in one zone even when the system looks adequate overall.
- Generator teams may explain pivotal status only through cost; the correction is that location can create market power under binding ATC.
- The retailer/load team may read high prices as generic scarcity; the correction is that congestion can be the main driver even if aggregate supply is sufficient.

### Level 3a - Forecating and information

- Teams may treat DAM bids as final commitments; the correction is that IDM exists precisely to repair positions after forecast changes.
- Teams may confuse being long or short with being profitable or unprofitable; the correction is that long and short describe physical position versus realised need, not margin quality.
- Teams may blame balancing cost only on bad luck; the correction is that balancing cost usually reflects forecast error plus the speed and quality of IDM reaction.

### Level 3b - RES dominated system

- Teams may spend battery flexibility too early on visible arbitrage; the correction is that the highest-value use may be preserving flexibility for the evening ramp.
- Teams may treat thermal backup as a default answer; the correction is that thermal support is limited and must be weighed against storage timing and procurement discipline.
- Teams may view renewable volatility as unavoidable noise only; the correction is that better timing and state-of-charge planning can materially reduce exposure.

## Model Debrief Answers

### Level 1 - Market mechanics

- Round 1: The likely SMP is set by the highest-cost dispatched unit, not by the largest unit or the last team to enter data.
- Round 2: Dispatch follows the merit order from lowest to highest variable cost until demand is covered.
- Round 3: A small demand increase matters only if it pulls the next more expensive unit into dispatch and resets the SMP for all dispatched units.
- Round 4: Changing offered volume affects the market only if it changes which unit becomes marginal; otherwise it mostly changes the team's own dispatched quantity.
- Round 5: Infra-marginal rent is the spread between the SMP and a generator's own variable cost on dispatched volume.
- Round 6: Profit should be explained as dispatched MWh times SMP minus dispatched MWh times variable cost.

### Level 2a - Price formation bidding strategy

- Round 1: A strong opening plan states which volume will be protected for dispatch and which volume will test markup.
- Round 2: The retailer/load team should explain what share of demand it secured for reliability and what share it exposed to price to chase lower cost.
- Round 3: The key trade-off is whether higher margin per MWh compensated for lower cleared volume.
- Round 4: The price-setting block is the offer that cleared at the margin and therefore shaped the SMP for everyone dispatched.
- Round 5: A good adjustment changes an explicit bidding rule, for example lowering markup on core volume or raising willingness-to-pay on essential demand.
- Round 6: Multi-block bidding is useful only when teams can explain why each block had a different risk and price role.

### Level 2b - Grid constraints and market power

- Round 1: The first correct read is zonal: where is demand located, where is supply located, and in which direction must imports flow.
- Round 2: For the retailer/load team in Zone 2, the procurement problem is often congestion first and energy shortage second.
- Round 3: A generator can be pivotal because its location sits behind a binding transfer limit, even if its cost is not the lowest.
- Round 4: The pivotal unit under congestion is the unit that cannot be replaced across zones once the ATC binds.
- Round 5: The next action should refer to zonal scarcity, not to average system conditions.
- Round 6: The clean policy takeaway is that congestion can create temporary market power that mitigation rules aim to constrain.

### Level 3a - Forecating and information

- Round 1: The riskiest DAM assumption is the one most likely to move before delivery, especially load or renewable output.
- Round 2: The best IDM trade is the one that removes the largest forecast-driven imbalance first, not necessarily the one that looks most profitable in isolation.
- Round 3: Long means the portfolio has more energy than needed; short means it has less than needed after the update.
- Round 4: The correct debrief order is DAM position, forecast revision, IDM correction, then realised balancing cost.

### Level 3b - RES dominated system

- Round 1: The right opening logic often keeps some flexibility in reserve instead of using all battery capability immediately.
- Round 2: After cloud cover, the battery may need to protect physical balance first and capture price second.
- Round 3: A credible evening-ramp plan explains remaining state of charge, thermal backup limits, and procurement exposure.
- Round 4: Value in the final round usually comes from timing flexibility correctly, not simply from owning more renewable capacity.

## Seed command

If the backend container already includes the script:

```bash
python /app/scripts/seed_uct_2026_jun_campaign.py
```

If the container is already running and has not been rebuilt after this file was added:

```bash
docker compose cp backend/scripts/seed_uct_2026_jun_campaign.py backend:/app/scripts/seed_uct_2026_jun_campaign.py
docker compose exec backend python /app/scripts/seed_uct_2026_jun_campaign.py
```

## Expected result

- One published campaign owned by `admin@fastbreak.one`
- Five scenarios linked in the correct order
- Automatic cohort assignment for every cohort where `admin@fastbreak.one` is a member
- Cohort mappings created or updated with `visible=true` and `active=true`
- Scenario names visible in the app exactly as listed in the Excel workbook
# Trainer Guide

Last updated: 2026-02-25  
Audience: Trainers / Facilitators

## 1) Goal of trainer facilitation

Your job is to keep the simulation both **didactic** and **operationally stable**:
- participants should understand why outcomes happen,
- rounds should progress with minimal idle time,
- interventions should be transparent and documented.

## 2) End-to-end trainer workflow

1. **Pre-session setup**
	- choose cohort/campaign/scenario,
	- verify role/type configuration,
	- communicate learning objectives.
2. **Session launch**
	- start briefing,
	- confirm all participants selected types.
3. **Round operations**
	- monitor submit status,
	- announce timing milestones,
	- advance or intervene as needed.
4. **Result debrief per round**
	- explain major KPI drivers,
	- connect events/gates to outcomes.
5. **Final debrief**
	- compare strategies,
	- extract transferable lessons.

## 3) Core trainer pages and their use

- `/trainer`: session creation, monitoring entry point, high-level controls.
- `/session-control`: live operation panel during active rounds.
- `/leaderboard`: ranking and performance overview.
- `/comparison`: cross-player KPI comparison.
- `/replay`: timeline-like recap of outcomes.
- `/evaluation`: discussion-ready KPI summaries.

## 4) Session start checklist (must-do)

Before pressing start:
- scenario version is correct,
- allowed player types are intentional,
- capacity limits per type (if used) are valid,
- participants know round duration and trainer control model.

Recommended opening message:
“After submit, you will wait for trainer progression. Please use waiting time to note one risk and one next-round adjustment.”

## 5) Live controls: when to use what

- **Pause**: use for clarification, technical issue, or late join alignment.
- **Resume**: continue after issue is resolved.
- **Force round end**: emergency only (time overrun, severe blockage).
- **Advance round**: normal progression once enough submissions are in.
- **Rewind round**: controlled correction in special facilitation cases.
- **Extend timer**: if many participants are close to submit.
- **End session**: only after explicit debrief closure.

Rule of thumb: prefer `Extend timer` over `Force end` if learning value would be lost.

## 6) Submit-phase behavior (shared mode)

After participants submit, they see waiting status and cannot self-advance.  
Trainer implication:
- monitor pending users,
- avoid dead air,
- announce expected advance timing.

Suggested pacing:
- if >80% submitted and no blockers, prepare advance,
- if repeated blockers, pause and clarify one concrete action.

## 7) Communication protocol during rounds

Use short, structured broadcasts:
- **Timing**: “5 minutes left / 2 minutes left.”
- **Focus**: “Check effective capacity before submit.”
- **Events**: “Outage active this round for Classic Provider.”
- **Transition**: “Submitting now; advancing in ~30s.”

Avoid long tactical coaching in live rounds; keep guidance neutral across participants.

## 8) Debrief framework per round

Use a fixed 4-step structure:
1. **Outcome snapshot**: top KPI movement (profit/cost/imbalance).
2. **Causal driver**: event, pricing, gate timing, or bidding behavior.
3. **Decision quality**: what was controllable vs external.
4. **Next-round adjustment**: one actionable change per role.

Example trainer prompt:
“Which hours drove imbalance cost, and was that due to event-driven capacity or your bid sizing?”

## 9) Interpreting event-driven anomalies

If one role suddenly shows large negative profit/imbalance:
- confirm active event scope (`all`, `player`, `device`),
- check effective capacity/demand changes in detail tables,
- compare offered vs deliverable volumes,
- show how imbalance cost mathematically dominated net result.

This turns “unexpected loss” into a clear learning moment.

## 10) Facilitation quality checklist

During operation:
- no unexplained long waits,
- transitions announced,
- interventions minimal but timely,
- every forced action documented.

After session:
- summarize top 3 learnings,
- capture recurring confusion points,
- feed improvements back into scenario design.

## 11) Incident handling playbook

### A) Players stuck in waiting

- check session status,
- verify round not already advancing,
- trigger proper trainer action (`advance`/`resume`).

### B) Missing submissions

- verify player type was selected,
- confirm user is in current session,
- ask player to refresh and re-check active round.

### C) Suspicious results

- re-open same session/round,
- check event list + KPI breakdown,
- validate with detail rows before escalating.

## 12) Post-session documentation (recommended)

Capture in a short note:
- scenario ID and date,
- number of participants,
- major outcome pattern,
- technical issues,
- suggested scenario or UX improvements.

This builds a reusable facilitation knowledge base over time.

# Trainer Guide

Last updated: 2026-05-27
Audience: Trainers / Facilitators

## 1) What the trainer role owns

Your job is to keep the session educational, fair, and operationally smooth. In practice that means:
- setting up the right cohort and scenario,
- starting and pacing the shared session,
- keeping participants informed without coaching one side unfairly,
- reading the live KPIs well enough to debrief what happened.

## 2) Main trainer surfaces

### `/trainer` - Cohorts

This is the normal setup page before a live session. Use it to:
- manage cohorts,
- pick the campaign and scenario to run,
- check membership,
- launch the live session workflow.

### `/session-control` - Live session panel

This is the core trainer workspace during an active session. It combines:
- session transport controls,
- timer and round status,
- broadcast messaging,
- cohort-member monitoring,
- player-type comparison,
- overall market overview,
- event log and live KPI context.

### `/comparison` and `/leaderboard`

These routes expose the same comparison-style dashboard for a selected session. They are useful when you want a separate KPI comparison view with:
- metric selection,
- sorting and filtering,
- bar-chart exports as PNG or SVG.

Important: the current trainer navigation is centered on Cohorts and Session Control. Trainer-specific `Replay` or `Evaluation` pages are not part of the active route set.

## 3) End-to-end trainer workflow

1. **Prepare the cohort**
	- confirm the right cohort,
	- verify campaign and scenario,
	- make sure participants understand the learning goal.
2. **Configure the shared run**
	- check allowed player types,
	- set max players per type if needed,
	- communicate that the trainer controls progression.
3. **Run the live round loop**
	- monitor statuses,
	- send short broadcasts,
	- pause, extend, advance, or rewind only when justified.
4. **Debrief each result phase**
	- identify the KPI shift,
	- connect it to events, timing, pricing, or grid effects,
	- state one adjustment for the next round.
5. **Close the session cleanly**
	- finish the scenario,
	- summarize the main lessons,
	- record any recurring confusion or technical issues.

## 4) Session start checklist

Before you start briefing or the first round, confirm:
- the correct cohort is active,
- the intended campaign and scenario are selected,
- allowed player types and max-player limits are intentional,
- participants know the round duration,
- participants know that shared sessions wait for trainer progression after submit.

Recommended announcement:
"After you submit, stay on the waiting screen. I will advance the session once we are ready to debrief or continue."

## 5) Session-control actions and when to use them

### Transport controls

The live control panel supports these actions:
- `Start` from briefing,
- `Pause` during running or round-active states,
- `Continue` from paused,
- `+1min` to extend timing,
- `Next` or `Finish` from round results,
- `Back` to rewind one round from results,
- `Stop` to end the session.

Practical guidance:
- use `+1min` before forcing an early close if the class is still working productively,
- use `Pause` for explanation or technical issues,
- use `Back` only when a controlled correction is worth the confusion it creates,
- use `Stop` only when you are deliberately ending the run.

## 6) What to monitor during live play

### Cohort Members panel

This table is your main operational view of the class. It shows:
- email and name,
- role and current player type,
- status,
- current round,
- last activity timestamp.

Statuses like `briefing`, `playing`, `paused`, `online`, `recent`, or `inactive` help you distinguish normal delay from real issues.

### Player-type counts

The chips above the member table show how many participants are active in each player type. Use this to check balance and missing assignments quickly.

### Events log

Keep the event log visible during disruptive rounds. It helps you connect outcome shifts to actual scenario triggers instead of participant myths about what happened.

## 7) Communication tools

### Broadcast messages

The broadcast bar is always visible in Session Control. Use it for short, neutral messages such as:
- timing reminders,
- clarification on gate timing,
- confirmation that an outage or event is active,
- notice that you will advance shortly.

The current button sends to all players. If the global route is unavailable, the UI falls back to the active session broadcast.

Good examples:
- "2 minutes left. Check effective capacity before submitting."
- "Round results in 30 seconds. Note your highest imbalance hour."
- "Outage event is active for the affected role this round."

Avoid live tactical coaching that favors one strategy or one participant group.

## 8) Market overview and comparison tools

### Overall Market Overview

After at least one round is completed, Session Control offers an `Overall Market Overview` button. Use it to read the round at system level:
- market composition,
- participant mix,
- price card,
- volume card,
- zone-related summary when a grid is active.

This is the best screen for explaining why an individual result made sense in the wider market.

### Player Type Comparison

Inside Session Control you can open a comparison modal that compares only peers within the same player type. This is often the fairest debrief view because it avoids comparing fundamentally different roles as if they had the same objective.

### Comparison dashboard

The dedicated comparison route is useful when you want:
- filterable player IDs,
- metric switching between profit, revenue, imbalance, and curtailment,
- chart export as PNG or SVG.

## 9) How to debrief a round

Use a repeatable four-step structure:
1. **Outcome**: what moved most strongly in profit, revenue, imbalance, curtailment, or grid cost.
2. **Cause**: event, pricing, gate timing, volume sizing, or network constraint.
3. **Control**: what players could have changed versus what was purely scenario-driven.
4. **Adjustment**: one concrete next-round action per role or player type.

Useful trainer prompts:
- "Which hour created the highest imbalance cost?"
- "Was the loss caused by pricing out of the market or by overcommitting volume?"
- "Did the grid or zone setup matter, or was this mainly a bidding issue?"

## 10) Result interpretation shortcuts

When one participant or role looks unexpectedly weak:
- compare profit with imbalance and curtailment first,
- open the market overview for system context,
- inspect the player-type comparison if fairness across roles is an issue,
- connect the result back to event scope and effective capacity.

If the class debates a single "wrong" price, remind them that poor quantity positioning or technical infeasibility often hurts more than a modest price miss.

## 11) Shared-mode behavior you should make explicit

Participants in shared mode:
- submit their round,
- remain on a waiting state,
- do not self-advance,
- depend on the trainer for the next transition.

If you do not state this clearly at the start, participants often misread normal waiting behavior as a bug.

## 12) Incident playbook

### A) Someone is stuck on a waiting screen

- confirm the session is still on the expected state,
- check whether the session is paused or already in results,
- advance or resume only when the current class state is understood.

### B) Missing or delayed submissions

- check whether the participant has the right player type,
- check their status and last activity in the member table,
- extend time if the class still benefits,
- ask the participant to refresh only after checking trainer-side state.

### C) Suspicious results

- open the overall market overview,
- compare event timing with the reported KPI shift,
- inspect imbalance and curtailment before assuming a calculation bug,
- only escalate after the round data and system context have been reconciled.

## 13) Post-session note template

Capture at least:
- scenario and date,
- participant count,
- the main outcome pattern,
- notable technical issues,
- scenario or UX improvements to feed back to designers.

That note becomes the fastest way to improve the next workshop.

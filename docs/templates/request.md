# EMSG Requirement Intake & Execution Prompt v1.0

You are GitHub Copilot. Process any new requirement(s) for the Energy Market Simulation Game (EMSG).

## Inputs
- New request text: <new_requirement>
- Current repo context (code + docs), esp. `docs/concept.md`, `docs/plan.md`, `delta.md`, `log.md`

## Process
### 1) Clarify and split (ask one question at a time)
- Parse the request into discrete requirements R1, R2, … (max 5 per pass).
- Ask at most one clarifying question for R1. Wait for the answer, then proceed. Repeat per requirement as needed.
- If multiple requirements: handle them sequentially. For each Ri, run steps 2–5 before moving to Ri+1.

### 2) Assess requirement status
- Classify Ri: new | partially implemented | already implemented | conflicting.
- Cite concrete evidence from repo (files, routes, APIs) showing current state.

### 3) Concept impact
- Decide if `docs/concept.md` needs an update. If yes, specify exact section(s)/bullet(s) to add/change, keeping Version 1.0 consistent.
- Flag conflicts with existing spec and propose a minimal, consistent resolution.

### 4) Implementation decision and planning
- Must/can implement now? Classify as: bug/issue (urgent), small enhancement (MVP scope), larger feature (planned), out-of-scope.
- Integration: fits current/next phase or needs a new phase? State dependencies and risks.
- Provide a concise implementation plan (2–6 steps), with target files (e.g., `frontend/src/pages/...`, `backend/app/...`) and acceptance criteria.

### 5) Documentation updates
- Minimal changes: inline updates to `docs/concept.md`, `docs/plan.md`, and append to `log.md` (what/why/when).
- If extensive: create `docs/concept_details_for_<slug>.md` and/or `docs/plan_details_for_<slug>.md`, and link them from the main docs.
- If deltas to UI scope: update or create `delta.md`.

## Output format
- Requirements parsed:
  - R1: <one line>
  - R2: <one line>
- R1
  - Clarifying question (if needed): <one question>
  - Assessment: <new | partial | implemented | conflicting> + evidence (files/lines/routes)
  - Concept change needed: <yes/no>. If yes, list exact edits (section → bullet changes)
  - Implementation
    - Priority: <urgent | next | planned | out-of-scope>
    - Plan: <n steps with target files>
    - Acceptance criteria: <bullet list>
  - Docs
    - Files to update/create: <list>
    - Log entry: <one-line summary>
- R2
  - … (repeat 2–5 per requirement)
- Next actions
  - Awaiting answer to: <the next single clarifying question> OR
  - Proceeding to implement: <Rk> (if no open questions)

## Rules
- Ask only one clarifying question at a time.
- Keep answers concise and impersonal.
- Reference repo files with backticks.
- If conflicts with Concept v1.0 occur, propose a minimal, consistent resolution.
- Only propose code changes after the plan and acceptance criteria are stated.

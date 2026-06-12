---
applyTo: "backend/app/**/*.py"
---

# Backend DB-Safety (HARD GATE)

These rules exist because un-batched queries and transactions held across sleeps
caused live HTTP 500 cascades for a single ~100-player session. Apply them to
EVERY change in `backend/app/**`. A change that violates them is not done.

## Before you write or edit a query, run this checklist
1. **Is this code inside a loop over players/rows?** If yes, the query MUST be
   hoisted out and batched with `.in_(...)` into a `{id: obj}` dict. No `.query`,
   `.get()`, or `.first()` per iteration. Ever.
2. **Is there a `time.sleep` / `eventlet.sleep` / `socketio.sleep` or a long CPU
   block after this query in the same flow?** If yes, call `db.session.remove()`
   (or commit) BEFORE the sleep/compute.
3. **Is this an endpoint a client polls?** If yes, it must use O(1) queries
   regardless of player count, and hold a connection for well under 100ms.

## Hot polling endpoints — keep these O(1) in query count
Polled by all ~100 players every 2–6s; a single extra per-player query here
multiplies by 100–200 req/s and exhausts the 100-connection pool:
- `backend/app/sessions.py`: `GET /api/sessions/<id>`, `submit-status`,
  `round-results`, `final-results`, `progress`
- `backend/app/player.py`: `active-session` and any player-facing GET

When touching these, prefer: one `X.query.filter(X.<fk>.in_(ids)).all()` per
table + Redis `mget`, then dict lookups. Never reintroduce a per-player query.

## Scheduler / engine (background greenlets)
- `backend/app/scheduler.py`: the countdown loop calls `db.session.remove()` each
  iteration — keep it. After every `engine.run_round(...)` call, `db.session.remove()`
  before persisting. Before the grace-period `time.sleep`, `db.session.remove()`.
- `backend/app/engine.py`: `run_round` does all DB reads UP FRONT (e.g. the
  `player_type_by_player` map) and then computes. Do NOT add a `.query` inside the
  per-player / per-hour compute loops — use the pre-loaded maps. A query there is
  both an N+1 and an idle-in-transaction risk during the long compute.

## Pool / timeout constants are off-limits as a "fix"
`pool_size=30 + max_overflow=70` (=100), `pool_timeout=10`,
`idle_in_transaction_session_timeout=15000`, gunicorn `-w 1`. Do not tune these to
mask an N+1 or a long-held transaction. Raising `-w` would double-run the
process-local scheduler (`_running`) — requires Redis locking first; flag it.

## Reference
See `/memories/repo/db-safety-idle-in-transaction-n1.md` for the full incident
analysis and the exact locations that were fixed.

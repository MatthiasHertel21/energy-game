# EMSG – Copilot Instructions

This is a live market-simulation game (Flask + gunicorn **eventlet, 1 worker** +
Postgres 16 + Redis + React) that serves **up to ~100 concurrent players in a
single session**. Two classes of database failure have caused live HTTP 500
cascades. The rules below are MANDATORY for any backend change. Treat a violation
as a blocking bug, even if the code "works" in a small test.

## Runtime facts that make these rules non-negotiable
- **One eventlet worker.** CPU-bound work (e.g. `engine.run_round`) blocks ALL
  greenlets while it runs. Greenlets only yield on I/O.
- **DB pool:** `pool_size=30, max_overflow=70` → hard ceiling **100 connections**;
  `pool_timeout=10` → a request waiting >10s for a connection returns **500**.
- **Postgres `idle_in_transaction_session_timeout=15000` (15s).** Any open
  transaction left idle >15s is **terminated** by Postgres; the next commit then
  fails with `psycopg2.OperationalError: terminating connection due to
  idle-in-transaction timeout`.
- **Clients poll constantly.** ~85–100 players poll `GET /api/sessions/{id}`,
  `/api/player/active-session` and `submit-status` every 2–6s. That is
  **100–200 requests/second sustained**, spiking at every round transition when
  all players hit `round-results` / `final-results` at once.

## RULE 1 — Never put a per-item DB query inside a loop over players/rows (no N+1)
A `.query.` inside a loop over N players becomes N sequential round-trips. At
~100 players × 100–200 req/s this exhausts the pool and 500s **every** endpoint.

- ❌ `for pid in players: SessionPlayerType.query.filter_by(user_id=pid).first()`
- ✅ Batch once: `rows = X.query.filter(X.user_id.in_(players)).all()` then build a
  `{id: row}` dict and look up inside the loop. Use Redis `mget` for cached values.
- This applies especially to the hot endpoints in `backend/app/sessions.py`:
  `submit-status`, `round-results`, `final-results`, `progress`, and anything
  under `backend/app/player.py`. These are polled by all players simultaneously.
- If you add a new endpoint that any client polls, it MUST be O(1) queries
  regardless of player count.

## RULE 2 — Never hold an open transaction across `time.sleep()` or heavy compute
`.query.X` auto-begins a transaction. If `time.sleep()` or a long CPU computation
follows without a commit/close, the connection is killed at 15s.

- Before any `time.sleep()` / `eventlet.sleep()` / `socketio.sleep()` that follows
  a query, call `db.session.remove()` (or commit first).
- After calling `engine.run_round(...)` (long CPU compute that reads up-front and
  computes with the read transaction open), call `db.session.remove()` **before**
  persisting results. See `backend/app/scheduler.py`.
- In long-running loops (e.g. the scheduler countdown), call `db.session.remove()`
  at the start of each iteration so no connection stays idle-in-transaction.

## RULE 3 — Background tasks must manage their own DB session lifecycle
- HTTP requests are covered by `@app.after_request: db.session.remove()` in
  `backend/app/__init__.py` — do not remove that hook.
- Greenlets/background tasks (scheduler, engine, recovery hooks) are NOT covered
  by `after_request`. They must `db.session.remove()` / commit explicitly and run
  inside an app context.

## RULE 4 — Do not change capacity/timeout knobs to "fix" load problems
Fix the query pattern, not the symptom. Do NOT raise `pool_size`, lower
`pool_timeout`, raise gunicorn workers (`-w`), or change
`idle_in_transaction_session_timeout` to paper over an N+1 or a long-held
transaction. Increasing workers in particular would run the process-local
scheduler (`scheduler._running`) more than once and double-execute rounds —
that needs Redis-based locking first, so flag it, don't just do it.

## RULE 5 — Validate any backend change against the 100-player load shape
Before considering a change done, ask: "If 100 players hit this at the same second
while a round is being computed, how many DB connections does it hold and for how
long?" If the answer is more than O(1) connections or >100ms hold under contention,
batch it or release the connection.

## Deploy
`cd /home/fb1/emsg && docker-compose up -d --no-deps --build backend`
(Use `docker-compose`, not `docker compose`.)

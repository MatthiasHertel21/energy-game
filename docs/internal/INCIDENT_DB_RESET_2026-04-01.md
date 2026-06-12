# Incident Report: DB Reset on 2026-04-01

## Status

Open incident. Data loss is very likely. Exact destructive command is not yet proven, but the database was already empty at approximately 20:22 UTC before the Monday seed run attempted inserts.

## Confirmed facts

1. The active Postgres Docker volume was not recreated on 2026-04-01.
   - Volume: `energy-game_pgdata`
   - CreatedAt: `2025-12-16T23:26:42Z`
   - This makes `docker compose down -v` on 2026-04-01 very unlikely as the direct cause.

2. The Postgres container itself was not restarted during the incident window.
   - Container: `energy-game-postgres-1`
   - StartedAt: `2026-03-19T03:04:39Z`
   - RestartCount: `0`
   - This rules out a Postgres container restart as the trigger on 2026-04-01.

3. The currently present data set starts on 2026-04-01 around 20:22.
   - `users.oldest_user = 2026-04-01 20:22:42`
   - `campaigns.oldest_campaign = 2026-04-01 20:22:42`
   - `scenarios.oldest_scenario = 2026-04-01 20:22:42`

4. At 20:22 the database was already missing core tables.
   Postgres logs show:
   - `relation "sessions" does not exist`
   - `relation "users" does not exist`
   - These errors occurred while application code and the Monday seed flow were running.

5. The Monday seed run attempted to insert test data immediately after the empty-database condition.
   - Failed insert seen in logs for user:
     - `monday-ui-designer-a257bc9d@test.com`
   - This links the validation run directly to the incident window.

6. There is no evidence of point-in-time recovery being available.
   - `archive_mode = off`
   - `archive_command = (disabled)`

7. No alternate application database exists in the same Postgres cluster.
   Existing DBs:
   - `emsg`
   - `postgres`
   - `template0`
   - `template1`

8. The current database does not contain `alembic_version`.
   - This strongly suggests the current schema was not restored via normal Alembic migration state.

9. The physical relation files of the current application tables were recreated or rewritten in multiple waves after the incident.
   Examples from `base/16384/*` for the `emsg` database:
   - around `20:22:38`:
     - `static_pages`
     - `reference_runs`
   - around `20:25:45`:
     - `campaign_scenarios`
   - around `21:55:32` to `21:55:35`:
     - `campaigns`
     - `scenarios`
     - `session_allowed_types`
     - `session_player_types`
   - around `22:10:33`:
     - `sessions`
     - `player_progress`
     - `forecasts`
   - around `22:30:33` to `22:30:34`:
     - `users`
     - `results`
     - `activity_log`

   This is strong evidence for schema/object recreation in place, not for a simple surviving old database with only a few deleted rows.

10. Docker daemon and system logs show manual container stop/recreate activity exactly in the incident window.
   Around `20:22:19` and `20:22:20`:
   - two containers were manually stopped
   - Docker reported `hasBeenManuallyStopped=true`
   - restart was explicitly canceled

   Around `20:22:23` and `20:22:40`:
   - two short-lived containers were started
   - both exited again after about 2 seconds

   Important interpretation:
   - this is consistent with manual or scripted container recreation activity
   - it is not consistent with a Postgres container restart
   - the exact container names could not be recovered because those containers were already removed

## Most likely sequence

1. Before approximately 20:22, the `emsg` database lost its application schema or its core tables.
2. Around 20:22, the Monday validation flow started and tried to seed test users/campaign/scenario.
3. Those first writes hit an already-empty database and failed because `users` and `sessions` did not exist.
4. After that, the application ended up with a recreated schema and the Monday test data became the oldest surviving records.

## What is ruled out or unlikely

### Very unlikely

- `docker compose down -v` during the incident window
  - because the active Docker volume was not recreated

- Postgres container restart during the incident window
   - because the Postgres container has been continuously running since 2026-03-19

### Not supported by available evidence

- Postgres cluster re-init on 2026-04-01
  - no matching volume recreation evidence
  - no log evidence of a fresh cluster init in the inspected window

- A simple shell-history-traceable `docker compose down -v`
   - no such command was found in `~/.bash_history`
   - the only visible recent `docker compose` command in raw history belongs to another project (`aiboard`)

## Dangerous code paths found

### Backend startup fallback schema creation

File: `backend/app/__init__.py`

The app factory contains fallback logic that creates missing tables directly if inspection says they do not exist. This can mask an empty or partially broken database instead of failing fast.

Important limitation:

- This fallback only explains recreation of some tables.
- It does not, by itself, explain who removed the pre-existing schema before 20:22.

### Static pages startup `create_all`

File: `backend/app/static_pages.py`

`init_static_pages_table()` calls `db.create_all()`. Even if not the root cause, this is dangerous in a production-like environment because it silently mutates schema state.

## Recovery assessment

### Recovery options that do not currently exist

- No WAL-based PITR available
- No confirmed local SQL dump found for this project
- No alternate database in the same cluster with older app data

### Recovery options still worth checking outside the repo

1. Hypervisor or VM snapshot from before 20:22
2. Host-level filesystem snapshot of `/var/lib/docker/volumes/energy-game_pgdata/_data`
3. External backup targets not visible from the repository or current shell session

## Immediate safeguards recommended

1. Remove or disable schema auto-creation fallbacks from application startup.
2. Forbid `db.create_all()` and similar schema mutation in runtime code paths.
3. Add a production-safe backup job for Postgres dumps.
4. Enable WAL archiving if point-in-time recovery is required.
5. Make test seeding fail fast if core application tables are unexpectedly missing.

## Current confidence levels

- High confidence:
  - data before about 20:22 is not present in the active `emsg` database
  - the Monday validation run operated during the incident window
  - the database was already missing core tables when that run started seeding
   - neither the Docker volume nor the Postgres container was recreated on 2026-04-01
   - the current schema objects were recreated in place after the incident began
   - manual container stop/recreate activity happened exactly during the incident window

- Medium confidence:
  - the validation run was directly involved in the visible aftermath
   - the triggering action likely came from container-level application recreation rather than storage-level destruction

- Low confidence:
  - the exact destructive command or exact actor that removed the schema before the seed started

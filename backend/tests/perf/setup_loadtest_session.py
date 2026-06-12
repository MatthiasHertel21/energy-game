#!/usr/bin/env python3
"""
Load test setup script for EMSG – Session 646 replica.

Creates 85 test accounts (82 players + 3 trainers), a test cohort,
a modified copy of scenario 15 (90-second rounds) and a fresh running session.

Usage
-----
    docker cp backend/tests/perf/setup_loadtest_session.py emsg-backend-1:/tmp/
    docker exec emsg-backend-1 python3 /tmp/setup_loadtest_session.py

Optional env vars
-----------------
    EMSG_LT_ROUND_SEC   Round duration in seconds (default 90)
    EMSG_LT_API_BASE    Backend base URL (default http://localhost:15000)
    EMSG_LT_CSV_OUT     Output CSV path (default /tmp/loadtest_users.csv)
    EMSG_LT_CLEAN       Set to '1' to end any existing load-test session first

Output
------
    /tmp/loadtest_users.csv  (email,password,role,user_id)
    Prints SESSION_ID and COHORT_ID to stdout for use by locust env vars.
"""

import json
import os
import sys

import requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
N_PLAYERS   = int(os.getenv("EMSG_LT_PLAYERS", "82"))
N_TRAINERS  = 3
PASSWORD    = "LoadTest123!"
DOMAIN      = "loadtest.emsg"
COHORT_NAME = "Load Test PMTA"
SCENARIO_SRC_ID = 15          # Level 1 - Market mechanics (session 646 basis)
SCENARIO_NAME   = "Load Test – Level 1 (short rounds)"
ROUND_SEC   = int(os.getenv("EMSG_LT_ROUND_SEC", "90"))
# Port 5000 = gunicorn inside the container; 15000 = host-mapped port.
# The setup script runs inside the container via docker exec, so use 5000.
API_BASE    = os.getenv("EMSG_LT_API_BASE", "http://localhost:5000")
CSV_OUT     = os.getenv("EMSG_LT_CSV_OUT", "/tmp/loadtest_users.csv")
CLEAN       = os.getenv("EMSG_LT_CLEAN", "0").strip() == "1"

# Slot distribution mirroring session 646 (30 : 23 : 21 → 74 total)
PLAYER_TYPES = [
    {"type_id": "ptype_gen_a", "device_id": "dev_gen_a", "slots": 30},
    {"type_id": "ptype_gen_b", "device_id": "dev_gen_b", "slots": 23},
    {"type_id": "ptype_gen_c", "device_id": "dev_gen_c", "slots": 21},
]

# ---------------------------------------------------------------------------
# Bootstrap Flask app context (runs inside the Docker container)
# ---------------------------------------------------------------------------
sys.path.insert(0, "/app")
from app import create_app
app = create_app()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _api(method, path, token=None, **kw):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    resp = getattr(requests, method)(f"{API_BASE}{path}", headers=headers, timeout=15, **kw)
    return resp


def _login(email, password):
    r = _api("post", "/api/auth/login", json={"email": email, "password": password})
    if r.status_code == 200:
        return r.json().get("access_token")
    print(f"  [WARN] login failed for {email}: {r.status_code} {r.text[:80]}", flush=True)
    return None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

with app.app_context():
    from app.extensions import db
    from app.models import (
        User, Role, Cohort, CohortMember, Scenario,
        Session, SessionStatus, SessionAllowedType,
    )
    from sqlalchemy import text
    from datetime import datetime

    print("=== EMSG Load Test Setup ===", flush=True)

    # ------------------------------------------------------------------
    # 1. Create test users
    # ------------------------------------------------------------------
    print(f"\n[1] Creating {N_PLAYERS} players + {N_TRAINERS} trainers ...", flush=True)

    all_users = []  # list of (email, password, role, user_id)

    # Players
    for i in range(1, N_PLAYERS + 1):
        email = f"lt-player-{i:03d}@{DOMAIN}"
        u = User.query.filter_by(email=email).first()
        if not u:
            u = User(email=email, role=Role.player, name=f"LT Player {i:03d}")
            u.set_password(PASSWORD)
            db.session.add(u)
            db.session.flush()
            print(f"  created player {email} id={u.id}", flush=True)
        all_users.append((email, PASSWORD, "player", u.id))

    # Trainers
    trainers = []
    for i in range(1, N_TRAINERS + 1):
        email = f"lt-trainer-{i:03d}@{DOMAIN}"
        u = User.query.filter_by(email=email).first()
        if not u:
            u = User(email=email, role=Role.trainer, name=f"LT Trainer {i:03d}")
            u.set_password(PASSWORD)
            db.session.add(u)
            db.session.flush()
            print(f"  created trainer {email} id={u.id}", flush=True)
        else:
            # Ensure trainer role
            if u.role != Role.trainer:
                u.role = Role.trainer
        trainers.append(u)
        all_users.append((email, PASSWORD, "trainer", u.id))

    db.session.commit()

    # ------------------------------------------------------------------
    # 2. Create / find test cohort (owned by first trainer)
    # ------------------------------------------------------------------
    print(f"\n[2] Cohort '{COHORT_NAME}' ...", flush=True)
    cohort = Cohort.query.filter_by(name=COHORT_NAME).first()
    if not cohort:
        cohort = Cohort(name=COHORT_NAME, trainer_id=trainers[0].id)
        db.session.add(cohort)
        db.session.flush()
        print(f"  created cohort id={cohort.id}", flush=True)
    else:
        print(f"  reusing existing cohort id={cohort.id}", flush=True)

    # Add everyone to the cohort (idempotent)
    for (email, _pw, _role, uid) in all_users:
        existing = CohortMember.query.filter_by(cohort_id=cohort.id, user_id=uid).first()
        if not existing:
            db.session.add(CohortMember(cohort_id=cohort.id, user_id=uid))
    db.session.commit()
    print(f"  {len(all_users)} members in cohort", flush=True)

    # ------------------------------------------------------------------
    # 3. Create modified scenario (copy of source with short rounds)
    # ------------------------------------------------------------------
    print(f"\n[3] Scenario '{SCENARIO_NAME}' (source={SCENARIO_SRC_ID}) ...", flush=True)
    lt_scenario = Scenario.query.filter_by(name=SCENARIO_NAME).first()
    if not lt_scenario:
        src = Scenario.query.get(SCENARIO_SRC_ID)
        if not src:
            sys.exit(f"ERROR: Source scenario id={SCENARIO_SRC_ID} not found in DB")
        import copy
        cfg = copy.deepcopy(src.config or {})
        cfg.setdefault("general", {})["round_duration_seconds"] = ROUND_SEC
        # Find the campaign_id from the source scenario (preserve link for visibility)
        lt_scenario = Scenario(
            name=SCENARIO_NAME,
            campaign_id=src.campaign_id,
            config=cfg,
        )
        db.session.add(lt_scenario)
        db.session.commit()
        print(f"  created scenario id={lt_scenario.id} round_sec={ROUND_SEC}", flush=True)
    else:
        # Update round duration in case it changed
        cfg = lt_scenario.config or {}
        cfg.setdefault("general", {})["round_duration_seconds"] = ROUND_SEC
        lt_scenario.config = cfg
        db.session.commit()
        print(f"  reusing scenario id={lt_scenario.id} (updated round_sec={ROUND_SEC})", flush=True)

    # ------------------------------------------------------------------
    # 4. Clean up existing load-test sessions for this cohort (if CLEAN=1)
    # ------------------------------------------------------------------
    if CLEAN:
        print(f"\n[4] Ending existing active sessions for cohort {cohort.id} ...", flush=True)
        active = (
            Session.query
            .filter(
                Session.cohort_id == cohort.id,
                Session.status.in_([SessionStatus.running, SessionStatus.created, SessionStatus.paused]),
            )
            .all()
        )
        for s in active:
            s.status = SessionStatus.scenario_complete
            print(f"  ended session {s.id}", flush=True)
        db.session.commit()
    else:
        print("\n[4] Skipping cleanup (EMSG_LT_CLEAN not set)", flush=True)

    # ------------------------------------------------------------------
    # 5. Create session via API (triggers run_rounds background task)
    # ------------------------------------------------------------------
    print(f"\n[5] Creating session via API ...", flush=True)

    # Check if there's already a running load-test session we can reuse
    existing_running = (
        Session.query
        .filter(
            Session.cohort_id == cohort.id,
            Session.scenario_id == lt_scenario.id,
            Session.status.in_([SessionStatus.running, SessionStatus.created]),
        )
        .order_by(Session.id.desc())
        .first()
    )
    if existing_running and not CLEAN:
        session_id = existing_running.id
        print(f"  reusing running session id={session_id} round={existing_running.current_round}", flush=True)
    else:
        trainer_token = _login(trainers[0].email, PASSWORD)
        if not trainer_token:
            sys.exit("ERROR: Could not log in as load-test trainer. Check that the backend is running at " + API_BASE)

        r = _api("post", "/api/sessions", token=trainer_token, json={
            "cohort_id": cohort.id,
            "scenario_id": lt_scenario.id,
            "mode": "shared_market",
        })
        if r.status_code not in (200, 201):
            sys.exit(f"ERROR: Session creation failed: {r.status_code} {r.text[:200]}")
        session_id = r.json()["id"]
        print(f"  created session id={session_id}", flush=True)

        # ------------------------------------------------------------------
        # 6. Set up allowed player types (no caps – all players can join any type)
        # ------------------------------------------------------------------
        print(f"\n[6] Setting allowed types for session {session_id} ...", flush=True)
        r = _api("patch", f"/api/sessions/{session_id}/allowed-types", token=trainer_token, json={
            "allowed": [{"type_id": pt["type_id"]} for pt in PLAYER_TYPES]
        })
        if r.status_code not in (200, 201, 204):
            print(f"  [WARN] allowed-types patch returned {r.status_code}: {r.text[:100]}", flush=True)
        else:
            print(f"  types set: {[pt['type_id'] for pt in PLAYER_TYPES]}", flush=True)

    # ------------------------------------------------------------------
    # 7. Write credentials CSV
    # ------------------------------------------------------------------
    print(f"\n[7] Writing CSV to {CSV_OUT} ...", flush=True)
    with open(CSV_OUT, "w") as fh:
        fh.write("email,password,role,user_id\n")
        for (email, pw, role, uid) in all_users:
            fh.write(f"{email},{pw},{role},{uid}\n")
    print(f"  {len(all_users)} accounts written", flush=True)

    # ------------------------------------------------------------------
    # Summary
    # ------------------------------------------------------------------
    print("\n" + "=" * 50, flush=True)
    print(f"SESSION_ID={session_id}", flush=True)
    print(f"COHORT_ID={cohort.id}", flush=True)
    print(f"SCENARIO_ID={lt_scenario.id}", flush=True)
    print(f"ROUND_DURATION={ROUND_SEC}s  ROUNDS=3  TOTAL≈{3*ROUND_SEC//60+1}min", flush=True)
    print(f"CSV={CSV_OUT}", flush=True)
    print("=" * 50, flush=True)
    print("\nRun the load test:", flush=True)
    print(
        f"  EMSG_SESSION_ID={session_id} EMSG_COHORT_ID={cohort.id} EMSG_USERS_CSV={CSV_OUT} \\\n"
        f"  docker run --rm \\\n"
        f"    -v \"$PWD/backend/tests/perf/locustfile.py:/locustfile.py:ro\" \\\n"
        f"    -v \"{CSV_OUT}:{CSV_OUT}:ro\" \\\n"
        f"    --network host \\\n"
        f"    -e EMSG_SESSION_ID={session_id} \\\n"
        f"    -e EMSG_COHORT_ID={cohort.id} \\\n"
        f"    -e EMSG_USERS_CSV={CSV_OUT} \\\n"
        f"    -e EMSG_ALLOW_WRITES=1 \\\n"
        f"    locustio/locust:latest \\\n"
        f"    -f /locustfile.py --host=http://localhost:15000 \\\n"
        f"    -u 85 -r 8 --run-time={3*ROUND_SEC+120}s --headless",
        flush=True,
    )

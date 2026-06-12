#!/bin/sh
# Container entrypoint: wait for Postgres, optionally run demo seed, start gunicorn.
set -e

echo "[entrypoint] Waiting for Postgres to be ready..."
until python - << 'PYEOF'
import os, sys
from sqlalchemy import create_engine, text
url = os.environ.get("DATABASE_URL", "")
if not url:
    print("  DATABASE_URL not set – skipping readiness check")
    sys.exit(0)
try:
    engine = create_engine(url, pool_pre_ping=True)
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    print("  ✓ Postgres ready")
    sys.exit(0)
except Exception as exc:
    print(f"  … waiting ({exc})")
    sys.exit(1)
PYEOF
do
    sleep 2
done

# AUTO_SEED=0 disables seeding (set this in production .env if not needed).
# Default is 1 (seed runs, but the script is fully idempotent).
AUTO_SEED="${AUTO_SEED:-1}"
if [ "$AUTO_SEED" != "0" ]; then
    echo "[entrypoint] Running demo seed (AUTO_SEED=${AUTO_SEED})..."
    python /app/scripts/seed_demo.py || echo "[entrypoint] WARNING: seed_demo.py failed – continuing startup"
fi

echo "[entrypoint] Starting gunicorn..."
exec gunicorn -k eventlet -w 1 -b 0.0.0.0:5000 run:app --timeout 90

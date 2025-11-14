"""
One-off migration to add 'seed' column to campaigns table if it doesn't exist.
Usage:
  python -m backend.scripts.migrate_campaign_seed
Env:
  DATABASE_URL must be set (e.g., postgresql://user:pass@host:5432/db)
"""
import os
from sqlalchemy import create_engine, text

db_url = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("POSTGRES_URI")
if not db_url:
    raise SystemExit("DATABASE_URL not set")

engine = create_engine(db_url)

with engine.connect() as conn:
    # Detect column existence in a portable way
    dialect = conn.dialect.name
    exists = False
    if dialect == "postgresql":
        q = text("""
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='campaigns' AND column_name='seed'
        """)
        exists = conn.execute(q).fetchone() is not None
    else:
        # Attempt generic pragma/selects for sqlite and others
        try:
            res = conn.execute(text("PRAGMA table_info(campaigns)")).fetchall()
            exists = any(r[1] == 'seed' for r in res)
        except Exception:
            exists = False
    if not exists:
        print("Adding column campaigns.seed ...")
        if dialect == "postgresql":
            conn.execute(text("ALTER TABLE campaigns ADD COLUMN seed VARCHAR(128) NULL"))
        else:
            # Best-effort for sqlite; requires table rebuild for older versions, skip if not supported
            try:
                conn.execute(text("ALTER TABLE campaigns ADD COLUMN seed TEXT NULL"))
            except Exception as e:
                print(f"Warning: could not add column automatically: {e}")
        print("Done.")
    else:
        print("Column campaigns.seed already exists. No action.")

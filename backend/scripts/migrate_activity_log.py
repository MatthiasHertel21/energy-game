#!/usr/bin/env python3
"""Migration script to create activity_log table"""
import os
from sqlalchemy import create_engine, text

# Get database connection from environment
db_url = os.getenv('DATABASE_URL', 'postgresql+psycopg2://emsg:emsgpass@postgres:5432/emsg')

engine = create_engine(db_url)

print("Starting activity_log migration...")

with engine.connect() as conn:
    # Create table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS activity_log (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
            cohort_id INTEGER REFERENCES cohorts(id) ON DELETE SET NULL,
            action_type VARCHAR(50) NOT NULL,
            timestamp TIMESTAMP DEFAULT NOW(),
            details JSONB
        )
    """))
    
    # Create indexes
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, timestamp DESC)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_log(session_id, timestamp DESC)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_cohort ON activity_log(cohort_id, timestamp DESC)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(action_type, timestamp DESC)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC)"))
    
    conn.commit()

print("✓ activity_log table created successfully")
print("✓ Indexes created: user, session, cohort, type, timestamp")

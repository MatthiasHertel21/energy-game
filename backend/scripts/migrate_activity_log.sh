#!/bin/bash
# Migration script to create activity_log table
# Run from container: docker-compose exec backend bash scripts/migrate_activity_log.sh

set -e

echo "Starting activity_log migration..."

# Use psql via environment variables
psql postgresql://$DB_USER:$DB_PASS@$DB_HOST:$DB_PORT/$DB_NAME <<EOF

-- Create activity_log table
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES sessions(id) ON DELETE CASCADE,
    cohort_id INTEGER REFERENCES cohorts(id) ON DELETE SET NULL,
    action_type VARCHAR(50) NOT NULL,
    timestamp TIMESTAMP DEFAULT NOW(),
    details JSONB
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_session ON activity_log(session_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_cohort ON activity_log(cohort_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity_log(action_type, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_activity_timestamp ON activity_log(timestamp DESC);

EOF

echo "✓ activity_log table created successfully"
echo "✓ Indexes created: user, session, cohort, type, timestamp"

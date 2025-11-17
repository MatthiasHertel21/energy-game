"""
Add cascade delete behavior for core FKs

Revision ID: 20251114_cascade_deletes
Revises: 
Create Date: 2025-11-14
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20251114_cascade_deletes'
down_revision = None
branch_labels = None
depends_on = None

def upgrade():
    # Execute raw SQL to adjust FK constraints (PostgreSQL)
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == 'postgresql':
        op.execute("ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_scenario_id_fkey;")
        op.execute("ALTER TABLE sessions ADD CONSTRAINT sessions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES scenarios (id) ON DELETE SET NULL;")

        op.execute("ALTER TABLE campaign_scenarios DROP CONSTRAINT IF EXISTS campaign_scenarios_campaign_id_fkey;")
        op.execute("ALTER TABLE campaign_scenarios ADD CONSTRAINT campaign_scenarios_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE;")

        op.execute("ALTER TABLE cohort_campaigns DROP CONSTRAINT IF EXISTS cohort_campaigns_campaign_id_fkey;")
        op.execute("ALTER TABLE cohort_campaigns ADD CONSTRAINT cohort_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE;")

        op.execute("ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_campaign_id_fkey;")
        op.execute("ALTER TABLE scenarios ADD CONSTRAINT scenarios_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id) ON DELETE CASCADE;")
    else:
        # Best-effort for SQLite/MySQL or others: no-op or compatible SQL
        try:
            op.execute("PRAGMA foreign_keys=off;")
        except Exception:
            pass


def downgrade():
    conn = op.get_bind()
    dialect = conn.dialect.name
    if dialect == 'postgresql':
        # Recreate constraints without ON DELETE actions
        op.execute("ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_scenario_id_fkey;")
        op.execute("ALTER TABLE sessions ADD CONSTRAINT sessions_scenario_id_fkey FOREIGN KEY (scenario_id) REFERENCES scenarios (id);")

        op.execute("ALTER TABLE campaign_scenarios DROP CONSTRAINT IF EXISTS campaign_scenarios_campaign_id_fkey;")
        op.execute("ALTER TABLE campaign_scenarios ADD CONSTRAINT campaign_scenarios_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id);")

        op.execute("ALTER TABLE cohort_campaigns DROP CONSTRAINT IF EXISTS cohort_campaigns_campaign_id_fkey;")
        op.execute("ALTER TABLE cohort_campaigns ADD CONSTRAINT cohort_campaigns_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id);")

        op.execute("ALTER TABLE scenarios DROP CONSTRAINT IF EXISTS scenarios_campaign_id_fkey;")
        op.execute("ALTER TABLE scenarios ADD CONSTRAINT scenarios_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaigns (id);")
    else:
        try:
            op.execute("PRAGMA foreign_keys=on;")
        except Exception:
            pass

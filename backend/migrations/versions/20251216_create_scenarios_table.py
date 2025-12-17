"""
Create scenarios table when missing

Revision ID: 20251216_create_scenarios_table
Revises: 20251114_cascade_deletes
Create Date: 2025-12-16
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20251216_create_scenarios_table"
down_revision = "20251114_cascade_deletes"
branch_labels = None
depends_on = None


def _has_table(bind, table_name: str) -> bool:
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade():
    bind = op.get_bind()
    if not _has_table(bind, "scenarios"):
        op.create_table(
            "scenarios",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("campaign_id", sa.Integer(), sa.ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=True),
            sa.Column("name", sa.String(length=200), nullable=False),
            sa.Column("config", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        )
        op.create_index("ix_scenarios_campaign_id", "scenarios", ["campaign_id"])


def downgrade():
    bind = op.get_bind()
    if _has_table(bind, "scenarios"):
        # Drop dependent FK constraints before dropping the table
        inspector = sa.inspect(bind)
        if "sessions" in inspector.get_table_names():
            try:
                op.drop_constraint("sessions_scenario_id_fkey", "sessions", type_="foreignkey")
            except Exception:
                pass
        if "campaign_scenarios" in inspector.get_table_names():
            try:
                op.drop_constraint("campaign_scenarios_scenario_id_fkey", "campaign_scenarios", type_="foreignkey")
            except Exception:
                pass
        op.drop_index("ix_scenarios_campaign_id", table_name="scenarios")
        op.drop_table("scenarios")

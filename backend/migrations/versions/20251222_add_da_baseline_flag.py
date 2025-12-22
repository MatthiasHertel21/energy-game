"""Add is_da_baseline flag to forecasts table

Revision ID: 20251222_add_da_baseline_flag
Revises: 20251216_create_scenarios_table
Create Date: 2025-12-22 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20251222_add_da_baseline_flag'
down_revision = '20251216_create_scenarios_table'
branch_labels = None
depends_on = None


def upgrade():
    # Add is_da_baseline column to forecasts table
    op.add_column('forecasts', sa.Column('is_da_baseline', sa.Boolean(), nullable=False, server_default='false'))
    
    # Create index for faster lookups of DA baselines
    op.create_index('ix_forecasts_da_baseline', 'forecasts', ['session_id', 'player_id', 'is_da_baseline'])


def downgrade():
    # Remove index
    op.drop_index('ix_forecasts_da_baseline', table_name='forecasts')
    
    # Remove column
    op.drop_column('forecasts', 'is_da_baseline')

"""add_bids_and_bid_dispatch_columns

Revision ID: 20251215_001
Revises: 
Create Date: 2025-12-15 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20251215_001'
down_revision = None  # Update this if you have previous migrations
branch_labels = None
depends_on = None


def upgrade():
    # Add bids column to forecasts table
    op.add_column('forecasts', sa.Column('bids', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    
    # Add bid_dispatch column to results table
    op.add_column('results', sa.Column('bid_dispatch', postgresql.JSON(astext_type=sa.Text()), nullable=True))


def downgrade():
    # Remove bid_dispatch column from results table
    op.drop_column('results', 'bid_dispatch')
    
    # Remove bids column from forecasts table
    op.drop_column('forecasts', 'bids')

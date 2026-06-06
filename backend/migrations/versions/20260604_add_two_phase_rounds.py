"""Add two-phase round schema (sessions.market_phase/phase_index, forecasts.market_phase, phase_results table)

Revision ID: 20260604_add_two_phase_rounds
Revises: 20260528_add_password_reset_tokens
Create Date: 2026-06-04 00:00:00.000000

Purely additive schema for the two-phase round feature. All new columns are
nullable / carry legacy defaults so existing scenarios run unchanged. No data
migration of existing scenarios is performed.
"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '20260604_add_two_phase_rounds'
down_revision = '20260528_add_password_reset_tokens'
branch_labels = None
depends_on = None


def upgrade():
    # sessions: active market phase + phase index within the round
    op.add_column('sessions', sa.Column('market_phase', sa.String(length=16), nullable=True))
    op.add_column('sessions', sa.Column('phase_index', sa.Integer(), nullable=False, server_default='0'))

    # forecasts: which phase a submission belongs to (legacy default 'single')
    op.add_column('forecasts', sa.Column('market_phase', sa.String(length=16), nullable=False, server_default='single'))

    # phase_results: provisional per-phase results (DAM phase) for two-phase rounds
    op.create_table(
        'phase_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('session_id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('round_num', sa.Integer(), nullable=False),
        sa.Column('market_phase', sa.String(length=16), nullable=False, server_default='dam'),
        sa.Column('data', sa.JSON(), nullable=False),
        sa.Column('bid_dispatch', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['session_id'], ['sessions.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'session_id', 'player_id', 'round_num', 'market_phase',
            name='uq_phase_result_session_player_round_phase',
        ),
    )
    op.create_index('ix_phase_results_session_id', 'phase_results', ['session_id'])
    op.create_index('ix_phase_results_player_id', 'phase_results', ['player_id'])
    op.create_index('ix_phase_results_round_num', 'phase_results', ['round_num'])


def downgrade():
    op.drop_index('ix_phase_results_round_num', table_name='phase_results')
    op.drop_index('ix_phase_results_player_id', table_name='phase_results')
    op.drop_index('ix_phase_results_session_id', table_name='phase_results')
    op.drop_table('phase_results')

    op.drop_column('forecasts', 'market_phase')
    op.drop_column('sessions', 'phase_index')
    op.drop_column('sessions', 'market_phase')

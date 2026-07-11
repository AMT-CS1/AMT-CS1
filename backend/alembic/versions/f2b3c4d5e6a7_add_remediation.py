"""add remedial problem columns and remediation_sessions table

Revision ID: f2b3c4d5e6a7
Revises: f1a2b3c4d5e6
Create Date: 2026-07-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'f2b3c4d5e6a7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Mark remedial problems and the misconception tag they remediate.
    op.add_column('problems', sa.Column('is_remedial', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('problems', sa.Column('misconception_tag', sa.String(8), nullable=True))
    op.create_index('ix_problems_misconception_tag', 'problems', ['misconception_tag'])

    # Sequential misconception-remediation progress, one row per (student, homework).
    op.create_table(
        'remediation_sessions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('problem_key', sa.String(100), nullable=False),
        sa.Column('tags', JSONB(), nullable=False, server_default='[]'),
        sa.Column('current_index', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('solved', JSONB(), nullable=False, server_default='[]'),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'problem_key', name='uq_user_problem_remediation'),
    )
    op.create_index('ix_remediation_sessions_user_id', 'remediation_sessions', ['user_id'])
    op.create_index('ix_remediation_sessions_problem_key', 'remediation_sessions', ['problem_key'])


def downgrade() -> None:
    op.drop_index('ix_remediation_sessions_problem_key', table_name='remediation_sessions')
    op.drop_index('ix_remediation_sessions_user_id', table_name='remediation_sessions')
    op.drop_table('remediation_sessions')
    op.drop_index('ix_problems_misconception_tag', table_name='problems')
    op.drop_column('problems', 'misconception_tag')
    op.drop_column('problems', 'is_remedial')

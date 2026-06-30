"""create_quiz_progress_table

Revision ID: c7d3e4f5a6b1
Revises: b5aeab3f9418
Create Date: 2026-06-27 13:16:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c7d3e4f5a6b1'
down_revision: Union[str, None] = 'b5aeab3f9418'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'quiz_progress',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('user_id', sa.Uuid(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('problem_key', sa.String(100), nullable=False),
        sa.Column('questions_answered', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('completed_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_quiz_progress_user_id', 'quiz_progress', ['user_id'])
    op.create_index('ix_quiz_progress_problem_key', 'quiz_progress', ['problem_key'])


def downgrade() -> None:
    op.drop_index('ix_quiz_progress_problem_key', table_name='quiz_progress')
    op.drop_index('ix_quiz_progress_user_id', table_name='quiz_progress')
    op.drop_table('quiz_progress')

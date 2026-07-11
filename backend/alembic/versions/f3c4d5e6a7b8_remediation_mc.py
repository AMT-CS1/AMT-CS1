"""switch remediation to multiple-choice questions

Creates misconception_questions, drops the remedial-problem columns (and rows),
and reshapes remediation_sessions for the MC flow.

Revision ID: f3c4d5e6a7b8
Revises: f2b3c4d5e6a7
Create Date: 2026-07-11 01:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'f3c4d5e6a7b8'
down_revision: Union[str, None] = 'f2b3c4d5e6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Multiple-choice remediation questions, keyed by misconception tag.
    op.create_table(
        'misconception_questions',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('misconception_tag', sa.String(8), nullable=False),
        sa.Column('text_en', sa.Text(), nullable=False),
        sa.Column('text_id', sa.Text(), nullable=False),
        sa.Column('code', sa.Text(), nullable=True),
        sa.Column('options_en', JSONB(), nullable=False),
        sa.Column('options_id', JSONB(), nullable=False),
        sa.Column('answer_index', sa.Integer(), nullable=False),
        sa.Column('explanation_en', sa.Text(), nullable=True),
        sa.Column('explanation_id', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_misconception_questions_tag', 'misconception_questions', ['misconception_tag'])

    # Reshape remediation_sessions: MC flow tracks the current question, not solved keys.
    op.add_column('remediation_sessions', sa.Column('current_question_id', sa.Uuid(), nullable=True))
    op.drop_column('remediation_sessions', 'solved')

    # Remove the DAP-coding remedial problems and their marker columns.
    op.execute("DELETE FROM problems WHERE is_remedial = true")
    op.drop_index('ix_problems_misconception_tag', table_name='problems')
    op.drop_column('problems', 'misconception_tag')
    op.drop_column('problems', 'is_remedial')


def downgrade() -> None:
    op.add_column('problems', sa.Column('is_remedial', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('problems', sa.Column('misconception_tag', sa.String(8), nullable=True))
    op.create_index('ix_problems_misconception_tag', 'problems', ['misconception_tag'])

    op.add_column('remediation_sessions', sa.Column('solved', JSONB(), nullable=False, server_default='[]'))
    op.drop_column('remediation_sessions', 'current_question_id')

    op.drop_index('ix_misconception_questions_tag', table_name='misconception_questions')
    op.drop_table('misconception_questions')

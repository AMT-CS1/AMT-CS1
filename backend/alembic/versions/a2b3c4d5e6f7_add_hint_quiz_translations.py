"""add_hint_quiz_translations

Revision ID: a2b3c4d5e6f7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-30 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Make existing text and explanation nullable
    op.alter_column('hint_quiz_questions', 'text', nullable=True)
    op.alter_column('hint_quiz_questions', 'explanation', nullable=True)
    
    # Add bilingual columns
    op.add_column('hint_quiz_questions', sa.Column('text_en', sa.Text(), nullable=True))
    op.add_column('hint_quiz_questions', sa.Column('text_id', sa.Text(), nullable=True))
    op.add_column('hint_quiz_questions', sa.Column('options_en', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('hint_quiz_questions', sa.Column('options_id', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    op.add_column('hint_quiz_questions', sa.Column('explanation_en', sa.Text(), nullable=True))
    op.add_column('hint_quiz_questions', sa.Column('explanation_id', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('hint_quiz_questions', 'explanation_id')
    op.drop_column('hint_quiz_questions', 'explanation_en')
    op.drop_column('hint_quiz_questions', 'options_id')
    op.drop_column('hint_quiz_questions', 'options_en')
    op.drop_column('hint_quiz_questions', 'text_id')
    op.drop_column('hint_quiz_questions', 'text_en')
    
    op.alter_column('hint_quiz_questions', 'explanation', nullable=False)
    op.alter_column('hint_quiz_questions', 'text', nullable=False)

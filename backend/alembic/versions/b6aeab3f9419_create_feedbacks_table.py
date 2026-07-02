"""create feedbacks table

Revision ID: b6aeab3f9419
Revises: d7b4c5d6e7f9
Create Date: 2026-07-02 10:59:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b6aeab3f9419'
down_revision: Union[str, None] = 'd7b4c5d6e7f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'feedbacks',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('problem_key', sa.String(length=100), nullable=False),
        sa.Column('question_text', sa.Text(), nullable=False),
        sa.Column('student_answer', sa.Text(), nullable=False),
        sa.Column('feedback_text', sa.Text(), nullable=False),
        sa.Column('rating', sa.Integer(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_feedbacks_user_id', 'feedbacks', ['user_id'], unique=False)
    op.create_index('ix_feedbacks_problem_key', 'feedbacks', ['problem_key'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_feedbacks_problem_key', table_name='feedbacks')
    op.drop_index('ix_feedbacks_user_id', table_name='feedbacks')
    op.drop_table('feedbacks')

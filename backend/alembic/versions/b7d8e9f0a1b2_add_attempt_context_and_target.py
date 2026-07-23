"""add attempt context and target link

Adds an origin marker to `attempts` so the summary reports can split
Practice Workspace (homework) from Practicum Session (lab) activity, and
link an attempt back to the WeeklyTarget it belonged to for drill-down.

Both columns are nullable; legacy rows stay NULL ("Uncategorized"). No backfill.

Revision ID: b7d8e9f0a1b2
Revises: a4c5d6e7f8a9
Create Date: 2026-07-22 16:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b7d8e9f0a1b2'
down_revision: Union[str, None] = 'a4c5d6e7f8a9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('attempts', sa.Column('context', sa.String(20), nullable=True))
    op.add_column('attempts', sa.Column('target_id', sa.Uuid(), nullable=True))
    op.create_foreign_key(
        'fk_attempts_target_id', 'attempts', 'weekly_targets',
        ['target_id'], ['id'], ondelete='SET NULL',
    )
    op.create_index('ix_attempts_user_context', 'attempts', ['user_id', 'context'])


def downgrade() -> None:
    op.drop_index('ix_attempts_user_context', table_name='attempts')
    op.drop_constraint('fk_attempts_target_id', 'attempts', type_='foreignkey')
    op.drop_column('attempts', 'target_id')
    op.drop_column('attempts', 'context')

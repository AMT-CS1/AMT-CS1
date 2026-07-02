"""add event_type index to interaction_logs

Revision ID: d7b4c5d6e7f9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-02 01:43:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd7b4c5d6e7f9'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index('ix_interaction_logs_event_type', 'interaction_logs', ['event_type'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_interaction_logs_event_type', table_name='interaction_logs')

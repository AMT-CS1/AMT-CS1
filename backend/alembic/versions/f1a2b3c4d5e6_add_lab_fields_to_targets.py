"""add_lab_fields_to_targets

Revision ID: f1a2b3c4d5e6
Revises: e8f0a1b2c3d4
Create Date: 2026-07-03 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'e8f0a1b2c3d4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('weekly_targets', sa.Column('kind', sa.String(length=20), nullable=False, server_default='homework'))
    op.add_column('weekly_targets', sa.Column('starts_at', sa.DateTime(), nullable=True))
    op.add_column('weekly_targets', sa.Column('access_password', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('weekly_targets', 'access_password')
    op.drop_column('weekly_targets', 'starts_at')
    op.drop_column('weekly_targets', 'kind')

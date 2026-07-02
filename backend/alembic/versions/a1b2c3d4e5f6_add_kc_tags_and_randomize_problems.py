"""add_kc_tags_and_randomize_problems

Revision ID: a1b2c3d4e5f6
Revises: 37bb69e7de12
Create Date: 2026-06-30 14:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '65f424c7c093'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add kc_tags column to problems table
    op.add_column('problems', sa.Column('kc_tags', sa.String(255), nullable=False, server_default=''))
    
    # Add randomize_problems column to weekly_targets table
    op.add_column('weekly_targets', sa.Column('randomize_problems', sa.Boolean(), nullable=False, server_default=sa.text('false')))


def downgrade() -> None:
    op.drop_column('weekly_targets', 'randomize_problems')
    op.drop_column('problems', 'kc_tags')

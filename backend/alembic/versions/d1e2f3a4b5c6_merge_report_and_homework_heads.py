"""merge report and homework workflow heads

The migration history forks at f3c4d5e6a7b8 into two branches that were never
merged:
  - b7d8e9f0a1b2  (attempt context + target link — LMS reporting branch)
  - 3214af34e843  (homework workflow tables)

Both branches' tables are imported by app.models, so a fully-migrated DB must
apply both. This is a pure merge revision (no schema ops) so `alembic upgrade
head` resolves to a single head again. The P3 feature migration chains from here.

Revision ID: d1e2f3a4b5c6
Revises: b7d8e9f0a1b2, 3214af34e843
Create Date: 2026-07-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd1e2f3a4b5c6'
down_revision: Union[str, Sequence[str], None] = ('b7d8e9f0a1b2', '3214af34e843')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

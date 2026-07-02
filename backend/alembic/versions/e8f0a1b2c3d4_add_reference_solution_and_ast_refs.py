"""add_reference_solution_and_ast_refs

Revision ID: e8f0a1b2c3d4
Revises: b6aeab3f9419
Create Date: 2026-07-02 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'e8f0a1b2c3d4'
down_revision: Union[str, None] = 'b6aeab3f9419'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('problems', sa.Column('reference_solution', sa.Text(), nullable=True))
    op.add_column('problems', sa.Column('reference_ast', JSONB(), nullable=True))
    op.add_column('attempts', sa.Column('ast_ref', sa.String(length=255), nullable=True))
    op.add_column('attempts', sa.Column('misconceptions', JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column('attempts', 'misconceptions')
    op.drop_column('attempts', 'ast_ref')
    op.drop_column('problems', 'reference_ast')
    op.drop_column('problems', 'reference_solution')

"""p3 homework workflow enhancements

Additive, reversible schema for the P3 plan:
  - weekly_targets: selection_mode, problem_count, is_published
      (existing lab/checkpoint rows start unpublished — "closed now")
  - target_problems: explicit target -> problem set (manual/random modes)
  - attempts.pseudocode_explanation: PS "Jelasin Pseudocode" text
  - student_homework_progress.submitted_at: explicit-submit marker (read-only after)

Cheat/tab-switch events reuse interaction_logs — no table added here.

Revision ID: e2f3a4b5c6d7
Revises: d1e2f3a4b5c6
Create Date: 2026-07-28 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- weekly_targets: selection mode / count / publish flag ---
    op.add_column(
        'weekly_targets',
        sa.Column('selection_mode', sa.String(length=10), nullable=False, server_default='kc'),
    )
    op.add_column('weekly_targets', sa.Column('problem_count', sa.Integer(), nullable=True))
    op.add_column(
        'weekly_targets',
        sa.Column('is_published', sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    # Close existing checkpoints/labs now — teacher opens them explicitly.
    op.execute("UPDATE weekly_targets SET is_published = false WHERE kind = 'lab'")

    # --- target_problems join ---
    op.create_table(
        'target_problems',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('weekly_target_id', sa.Uuid(), nullable=False),
        sa.Column('problem_id', sa.Uuid(), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['problem_id'], ['problems.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['weekly_target_id'], ['weekly_targets.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('weekly_target_id', 'problem_id', name='uq_target_problem'),
    )
    op.create_index(op.f('ix_target_problems_problem_id'), 'target_problems', ['problem_id'], unique=False)
    op.create_index(op.f('ix_target_problems_weekly_target_id'), 'target_problems', ['weekly_target_id'], unique=False)

    # --- attempts: PS pseudocode explanation ---
    op.add_column('attempts', sa.Column('pseudocode_explanation', sa.Text(), nullable=True))

    # --- student_homework_progress: explicit-submit marker ---
    op.add_column(
        'student_homework_progress',
        sa.Column('submitted_at', sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('student_homework_progress', 'submitted_at')
    op.drop_column('attempts', 'pseudocode_explanation')
    op.drop_index(op.f('ix_target_problems_weekly_target_id'), table_name='target_problems')
    op.drop_index(op.f('ix_target_problems_problem_id'), table_name='target_problems')
    op.drop_table('target_problems')
    op.drop_column('weekly_targets', 'is_published')
    op.drop_column('weekly_targets', 'problem_count')
    op.drop_column('weekly_targets', 'selection_mode')

"""p5 option-level misconception triggers

Additive, reversible schema for the P5 plan (R1):
  - misconception_questions.option_misconceptions: JSONB list parallel to
    options_en — entry i is the list of misconception tags that picking
    option i reveals (correct option: []). NULL = not authored (pre-P5
    behavior: the question's single misconception_tag is the fallback).
  - misconception_questions.misconception_tag: String(8) -> String(10) so the
    bank can hold specific codes ("VA-01") like problem_misconceptions does.
  - student_mp_attempts.triggered_tags: JSONB — the tags credited to this
    attempt at submit time (the honest evidence trail for the R3 profile;
    a later edit to the question must not rewrite history).

No backfill, per the standing no-backfill rule.

Revision ID: f4a5b6c7d8e9
Revises: e2f3a4b5c6d7
Create Date: 2026-07-30 00:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'f4a5b6c7d8e9'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'misconception_questions',
        sa.Column('option_misconceptions', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )
    # Widening a VARCHAR is metadata-only in Postgres.
    op.alter_column(
        'misconception_questions',
        'misconception_tag',
        existing_type=sa.String(length=8),
        type_=sa.String(length=10),
        existing_nullable=False,
    )
    op.add_column(
        'student_mp_attempts',
        sa.Column('triggered_tags', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('student_mp_attempts', 'triggered_tags')
    op.alter_column(
        'misconception_questions',
        'misconception_tag',
        existing_type=sa.String(length=10),
        type_=sa.String(length=8),
        existing_nullable=False,
    )
    op.drop_column('misconception_questions', 'option_misconceptions')

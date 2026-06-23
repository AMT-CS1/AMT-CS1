"""initial migration

Revision ID: 0001_initial_migration
Revises: 
Create Date: 2026-06-23 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision: str = '0001_initial_migration'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Enable pgvector extension
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # 2. Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('hashed_password', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=30), nullable=False),
        sa.Column('consent_status', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # 3. Create weekly_targets table
    op.create_table(
        'weekly_targets',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('course_ref', sa.String(length=100), nullable=False),
        sa.Column('week', sa.Integer(), nullable=False),
        sa.Column('topic_kc_focus', sa.String(length=255), nullable=False),
        sa.Column('target_task', sa.Text(), nullable=False),
        sa.Column('source', sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 4. Create attempts table
    op.create_table(
        'attempts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('task_ref', sa.String(length=100), nullable=False),
        sa.Column('modality', sa.String(length=50), nullable=False),
        sa.Column('content_ref', sa.String(length=255), nullable=False),
        sa.Column('source', sa.String(length=100), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.Column('confidence_level', sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 5. Create student_model_states table
    op.create_table(
        'student_model_states',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('kc_mastery', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('misconception_risk', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('evidence_confidence', sa.Float(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 6. Create tutoring_episodes table
    op.create_table(
        'tutoring_episodes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('learner_state_ref', sa.UUID(), nullable=True),
        sa.Column('action_type', sa.String(length=100), nullable=False),
        sa.Column('generated_output_ref', sa.String(length=255), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['learner_state_ref'], ['student_model_states.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 7. Create critic_records table
    op.create_table(
        'critic_records',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('episode_id', sa.UUID(), nullable=False),
        sa.Column('checks', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('verdict', sa.String(length=100), nullable=False),
        sa.Column('revision_count', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['episode_id'], ['tutoring_episodes.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 8. Create curated_cases table
    op.create_table(
        'curated_cases',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('embedding', Vector(1536), nullable=False),
        sa.Column('target_kc', sa.String(length=100), nullable=False),
        sa.Column('misconception_pattern', sa.String(length=255), nullable=False),
        sa.Column('learner_profile', sa.Text(), nullable=False),
        sa.Column('difficulty', sa.String(length=50), nullable=False),
        sa.Column('outcome_evidence', sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 9. Create ratings table
    op.create_table(
        'ratings',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('rater_id', sa.UUID(), nullable=False),
        sa.Column('item_ref', sa.String(length=100), nullable=False),
        sa.Column('rubric_scores', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['rater_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )

    # 10. Create evidence_blobs table
    op.create_table(
        'evidence_blobs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('uri', sa.String(length=255), nullable=False),
        sa.Column('type', sa.String(length=50), nullable=False),
        sa.Column('hash', sa.String(length=64), nullable=False),
        sa.Column('provenance', sa.String(length=255), nullable=False),
        sa.Column('confidence_level', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )

    # 11. Create interaction_logs table
    op.create_table(
        'interaction_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('actor', sa.String(length=100), nullable=False),
        sa.Column('event_type', sa.String(length=100), nullable=False),
        sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )


def downgrade() -> None:
    op.drop_table('interaction_logs')
    op.drop_table('evidence_blobs')
    op.drop_table('ratings')
    op.drop_table('curated_cases')
    op.drop_table('critic_records')
    op.drop_table('tutoring_episodes')
    op.drop_table('student_model_states')
    op.drop_table('attempts')
    op.drop_table('weekly_targets')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_table('users')
    op.execute("DROP EXTENSION IF EXISTS vector")

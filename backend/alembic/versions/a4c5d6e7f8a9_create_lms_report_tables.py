"""create_lms_report_tables

Revision ID: a4c5d6e7f8a9
Revises: f3c4d5e6a7b8
Create Date: 2026-07-19 02:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB


# revision identifiers, used by Alembic.
revision: str = 'a4c5d6e7f8a9'
down_revision: Union[str, None] = 'f3c4d5e6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'lms_imports',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('uploaded_by', sa.Uuid(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('filename', sa.String(255), nullable=False),
        sa.Column('storage_ref', sa.String(255), nullable=True),
        sa.Column('status', sa.String(20), nullable=False, server_default='completed'),
        sa.Column('row_counts', JSONB(), nullable=True),
        sa.Column('unmatched_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_lms_imports_uploaded_by', 'lms_imports', ['uploaded_by'])

    op.create_table(
        'lms_courses',
        sa.Column('course_id', sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column('shortname', sa.String(255), nullable=True),
        sa.Column('fullname', sa.Text(), nullable=True),
        sa.Column('fakultas', sa.String(255), nullable=True),
        sa.Column('prodi', sa.String(255), nullable=True),
        sa.Column('tahun_ajar', sa.String(50), nullable=True),
        sa.PrimaryKeyConstraint('course_id'),
    )

    op.create_table(
        'lms_participants',
        sa.Column('course_id', sa.BigInteger(), nullable=False),
        sa.Column('lms_user_id', sa.BigInteger(), nullable=False),
        sa.Column('role_shortname', sa.String(50), nullable=False),
        sa.Column('username', sa.String(255), nullable=True),
        sa.Column('firstname', sa.String(255), nullable=True),
        sa.Column('lastname', sa.String(255), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('role_name', sa.String(100), nullable=True),
        sa.Column('matched_user_id', sa.Uuid(), nullable=True),
        sa.PrimaryKeyConstraint('course_id', 'lms_user_id', 'role_shortname'),
        sa.ForeignKeyConstraint(['course_id'], ['lms_courses.course_id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['matched_user_id'], ['users.id'], ondelete='SET NULL'),
    )
    op.create_index('ix_lms_participants_username', 'lms_participants', ['username'])
    op.create_index('ix_lms_participants_email', 'lms_participants', ['email'])
    op.create_index('ix_lms_participants_matched_user_id', 'lms_participants', ['matched_user_id'])

    op.create_table(
        'lms_quizzes',
        sa.Column('quiz_id', sa.BigInteger(), autoincrement=False, nullable=False),
        sa.Column('course_id', sa.BigInteger(), nullable=False),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('open_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('close_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('time_limit_seconds', sa.Integer(), nullable=True),
        sa.Column('max_grade', sa.Float(), nullable=True),
        sa.Column('total_questions', sa.Integer(), nullable=True),
        sa.PrimaryKeyConstraint('quiz_id'),
        sa.ForeignKeyConstraint(['course_id'], ['lms_courses.course_id'], ondelete='CASCADE'),
    )
    op.create_index('ix_lms_quizzes_course_id', 'lms_quizzes', ['course_id'])

    op.create_table(
        'lms_questions',
        sa.Column('quiz_id', sa.BigInteger(), nullable=False),
        sa.Column('slot_number', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.BigInteger(), nullable=True),
        sa.Column('name', sa.Text(), nullable=True),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('misconception_tags', JSONB(), nullable=True),
        sa.PrimaryKeyConstraint('quiz_id', 'slot_number'),
        sa.ForeignKeyConstraint(['quiz_id'], ['lms_quizzes.quiz_id'], ondelete='CASCADE'),
    )

    op.create_table(
        'lms_attempts',
        sa.Column('quiz_id', sa.BigInteger(), nullable=False),
        sa.Column('lms_user_id', sa.BigInteger(), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('finish_time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_grade', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('quiz_id', 'lms_user_id', 'attempt_number'),
        sa.ForeignKeyConstraint(['quiz_id'], ['lms_quizzes.quiz_id'], ondelete='CASCADE'),
    )
    op.create_index('ix_lms_attempts_lms_user_id', 'lms_attempts', ['lms_user_id'])

    op.create_table(
        'lms_attempt_answers',
        sa.Column('quiz_id', sa.BigInteger(), nullable=False),
        sa.Column('lms_user_id', sa.BigInteger(), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('slot_number', sa.Integer(), nullable=False),
        sa.Column('question_summary', sa.Text(), nullable=True),
        sa.Column('right_answer', sa.Text(), nullable=True),
        sa.Column('student_answer', sa.Text(), nullable=True),
        sa.Column('question_state', sa.String(50), nullable=True),
        sa.Column('question_grade', sa.Float(), nullable=True),
        sa.PrimaryKeyConstraint('quiz_id', 'lms_user_id', 'attempt_number', 'slot_number'),
        sa.ForeignKeyConstraint(
            ['quiz_id', 'lms_user_id', 'attempt_number'],
            ['lms_attempts.quiz_id', 'lms_attempts.lms_user_id', 'lms_attempts.attempt_number'],
            ondelete='CASCADE',
        ),
    )
    op.create_index('ix_lms_attempt_answers_user', 'lms_attempt_answers', ['lms_user_id'])
    op.create_index('ix_lms_attempt_answers_state', 'lms_attempt_answers', ['question_state'])

    op.create_table(
        'lms_response_steps',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('quiz_id', sa.BigInteger(), nullable=False),
        sa.Column('lms_user_id', sa.BigInteger(), nullable=False),
        sa.Column('attempt_number', sa.Integer(), nullable=False),
        sa.Column('slot_number', sa.Integer(), nullable=False),
        sa.Column('question_id', sa.BigInteger(), nullable=True),
        sa.Column('step', sa.Integer(), nullable=False),
        sa.Column('time', sa.DateTime(timezone=True), nullable=True),
        sa.Column('action', sa.Text(), nullable=True),
        sa.Column('state', sa.String(50), nullable=True),
        sa.Column('marks', sa.Float(), nullable=True),
        sa.Column('coderunner_output', sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(
            ['quiz_id', 'lms_user_id', 'attempt_number'],
            ['lms_attempts.quiz_id', 'lms_attempts.lms_user_id', 'lms_attempts.attempt_number'],
            ondelete='CASCADE',
        ),
        sa.UniqueConstraint(
            'quiz_id', 'lms_user_id', 'attempt_number', 'slot_number', 'step',
            name='uq_lms_response_steps_natural_key',
        ),
    )
    op.create_index(
        'ix_lms_response_steps_attempt', 'lms_response_steps',
        ['quiz_id', 'lms_user_id', 'attempt_number'],
    )


def downgrade() -> None:
    op.drop_table('lms_response_steps')
    op.drop_table('lms_attempt_answers')
    op.drop_table('lms_attempts')
    op.drop_table('lms_questions')
    op.drop_table('lms_quizzes')
    op.drop_table('lms_participants')
    op.drop_table('lms_courses')
    op.drop_table('lms_imports')

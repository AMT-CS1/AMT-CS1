import uuid
from datetime import datetime
from sqlalchemy import (
    String,
    Text,
    Integer,
    BigInteger,
    Float,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    Index,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class LmsImport(Base):
    """Provenance record for one uploaded LMS (Moodle) XLSX export."""

    __tablename__ = "lms_imports"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    storage_ref: Mapped[str | None] = mapped_column(String(255), nullable=True)  # MinIO key of the raw file
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")  # completed, failed
    row_counts: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # rows upserted per sheet
    unmatched_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())


class LmsCourse(Base):
    """A Moodle course (COURSES sheet). Keyed by the LMS's own integer ID."""

    __tablename__ = "lms_courses"

    course_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    shortname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    fullname: Mapped[str | None] = mapped_column(Text, nullable=True)
    fakultas: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prodi: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tahun_ajar: Mapped[str | None] = mapped_column(String(50), nullable=True)


class LmsParticipant(Base):
    """A user-role enrollment in a course (PARTICIPANTS sheet).

    `matched_user_id` links the LMS identity to a local account (matched on
    username, falling back to email, at import time). Null means the student
    has no local account yet — teacher views still work, the student view doesn't.
    """

    __tablename__ = "lms_participants"

    course_id: Mapped[int] = mapped_column(
        ForeignKey("lms_courses.course_id", ondelete="CASCADE"), primary_key=True
    )
    lms_user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    role_shortname: Mapped[str] = mapped_column(String(50), primary_key=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    firstname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    lastname: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    role_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    matched_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )


class LmsQuiz(Base):
    """A quiz within a course (QUIZ_LIST sheet)."""

    __tablename__ = "lms_quizzes"

    quiz_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("lms_courses.course_id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    open_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    close_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_grade: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_questions: Mapped[int | None] = mapped_column(Integer, nullable=True)


class LmsQuestion(Base):
    """A slot in a quiz (QUESTION_BANK sheet).

    Random slots carry a `[Random Question / Soal Acak]` placeholder here; the
    question actually served lives on the attempt rows (see plan open item).

    `misconception_tags` is the placeholder for the upcoming Tag column
    (e.g. ["VA-01"]); null until the export includes it.
    """

    __tablename__ = "lms_questions"

    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("lms_quizzes.quiz_id", ondelete="CASCADE"), primary_key=True
    )
    slot_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    misconception_tags: Mapped[list | None] = mapped_column(JSONB, nullable=True)


class LmsAttempt(Base):
    """Attempt header, normalized out of PARTICIPANT_ATTEMPTS (the sheet repeats
    it on every slot row)."""

    __tablename__ = "lms_attempts"

    quiz_id: Mapped[int] = mapped_column(
        ForeignKey("lms_quizzes.quiz_id", ondelete="CASCADE"), primary_key=True
    )
    lms_user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    attempt_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finish_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    total_grade: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        Index("ix_lms_attempts_lms_user_id", "lms_user_id"),
    )


class LmsAttemptAnswer(Base):
    """Final state of one slot within one attempt (PARTICIPANT_ATTEMPTS grain)."""

    __tablename__ = "lms_attempt_answers"

    quiz_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lms_user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    attempt_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    slot_number: Mapped[int] = mapped_column(Integer, primary_key=True)
    question_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    right_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    student_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    question_state: Mapped[str | None] = mapped_column(String(50), nullable=True)  # gradedright, gradedwrong, ...
    question_grade: Mapped[float | None] = mapped_column(Float, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["quiz_id", "lms_user_id", "attempt_number"],
            ["lms_attempts.quiz_id", "lms_attempts.lms_user_id", "lms_attempts.attempt_number"],
            ondelete="CASCADE",
        ),
        Index("ix_lms_attempt_answers_user", "lms_user_id"),
        Index("ix_lms_attempt_answers_state", "question_state"),
    )


class LmsResponseStep(Base):
    """One interaction step of one slot of one attempt (RESPONSE_HISTORY sheet).

    Largest table; only read lazily for the teacher per-student drill-down.
    The unique constraint is the natural key used for idempotent re-imports.
    """

    __tablename__ = "lms_response_steps"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    quiz_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    lms_user_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    attempt_number: Mapped[int] = mapped_column(Integer, nullable=False)
    slot_number: Mapped[int] = mapped_column(Integer, nullable=False)
    question_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    step: Mapped[int] = mapped_column(Integer, nullable=False)
    time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Moodle embeds the submitted answer in the action ("Submit: program ..."), so unbounded Text
    action: Mapped[str | None] = mapped_column(Text, nullable=True)
    state: Mapped[str | None] = mapped_column(String(50), nullable=True)
    marks: Mapped[float | None] = mapped_column(Float, nullable=True)
    coderunner_output: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["quiz_id", "lms_user_id", "attempt_number"],
            ["lms_attempts.quiz_id", "lms_attempts.lms_user_id", "lms_attempts.attempt_number"],
            ondelete="CASCADE",
        ),
        UniqueConstraint(
            "quiz_id", "lms_user_id", "attempt_number", "slot_number", "step",
            name="uq_lms_response_steps_natural_key",
        ),
        Index("ix_lms_response_steps_attempt", "quiz_id", "lms_user_id", "attempt_number"),
    )

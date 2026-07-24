import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint, Text, Numeric, func, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.models.base import Base

class ProblemMisconception(Base):
    """Maps a problem (PS) to misconception tags that target it."""
    __tablename__ = "problem_misconceptions"
    __table_args__ = (
        UniqueConstraint("problem_id", "misconception_tag", name="uq_problem_misconception"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    problem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    misconception_tag: Mapped[str] = mapped_column(String(10), nullable=False, index=True)  # e.g., "VA-01"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    # relationship
    problem = relationship("Problem", backref="misconceptions_mapped")


class StudentHomeworkProgress(Base):
    """Tracks a student's overall progress for a homework packet (weekly target)."""
    __tablename__ = "student_homework_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "weekly_target_id", name="uq_user_weekly_target_progress"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    weekly_target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("weekly_targets.id", ondelete="CASCADE"), nullable=False, index=True)

    # Statuses: "locked", "not_started", "in_progress", "completed"
    mp_status: Mapped[str] = mapped_column(String(20), default="not_started", nullable=False)
    ps_status: Mapped[str] = mapped_column(String(20), default="locked", nullable=False)

    mp_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    mp_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ps_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ps_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # relationships
    user = relationship("User")
    weekly_target = relationship("WeeklyTarget")


class StudentMPSession(Base):
    """Tracks the student's active misconception quiz session for a weekly homework packet."""
    __tablename__ = "student_mp_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "weekly_target_id", name="uq_user_weekly_target_mp_session"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    weekly_target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("weekly_targets.id", ondelete="CASCADE"), nullable=False, index=True)

    # tag_queue: ordered list of tags/MP questions to show (contains duplicates if required)
    tag_queue: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    current_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_question_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("misconception_questions.id", ondelete="SET NULL"), nullable=True)

    # Attempt limit tracking per session
    max_attempts: Mapped[int] = mapped_column(Integer, default=3, nullable=False)  # e.g., 3 attempts allowed per MP question
    attempts_on_current: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # relationships
    user = relationship("User")
    weekly_target = relationship("WeeklyTarget")
    current_question = relationship("MisconceptionQuestion")


class StudentMPAttempt(Base):
    """Logs individual student attempts on Misconception Problems (MP)."""
    __tablename__ = "student_mp_attempts"
    __table_args__ = (
        Index("idx_mp_attempts_user_weekly", "user_id", "weekly_target_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    weekly_target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("weekly_targets.id", ondelete="CASCADE"), nullable=False, index=True)
    misconception_question_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("misconception_questions.id", ondelete="CASCADE"), nullable=False)
    misconception_tag: Mapped[str] = mapped_column(String(10), nullable=False)

    selected_option: Mapped[str] = mapped_column(String(1), nullable=False)  # 'A', 'B', 'C', 'D' (Tidak Tahu)
    text_input: Mapped[str | None] = mapped_column(Text, nullable=True)      # custom reasoning text

    # status: "correct", "incorrect"
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    # relationships
    user = relationship("User")
    weekly_target = relationship("WeeklyTarget")
    misconception_question = relationship("MisconceptionQuestion")


class StudentMisconceptionRecord(Base):
    """Binary log of misconceptions triggered during PS coding problem attempts."""
    __tablename__ = "student_misconception_records"
    __table_args__ = (
        Index("idx_student_misc_rec_lookup", "user_id", "problem_id", "misconception_tag"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    problem_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True)
    attempt_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), nullable=False, index=True)
    misconception_tag: Mapped[str] = mapped_column(String(10), nullable=False)

    triggered: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 1 if triggered, 0 if not
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    # relationships
    user = relationship("User")
    problem = relationship("Problem")
    attempt = relationship("Attempt")


class XlsxUpload(Base):
    """Tracks uploaded spreadsheet files."""
    __tablename__ = "xlsx_uploads"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="processing", nullable=False)  # "processing", "completed", "failed"
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

    # relationships
    uploader = relationship("User")


class WeeklyClassSummaryReport(Base):
    """Pre-aggregated reporting metrics for a student per week for class summaries/heatmaps."""
    __tablename__ = "weekly_class_summary_reports"
    __table_args__ = (
        UniqueConstraint("weekly_target_id", "user_id", name="uq_weekly_class_summary"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    weekly_target_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("weekly_targets.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    mp_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    ps_score: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    total_attempts_made: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    misconceptions_triggered_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    last_active_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

    # relationships
    user = relationship("User")
    weekly_target = relationship("WeeklyTarget")

import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class WeeklyTarget(Base):
    __tablename__ = "weekly_targets"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    course_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    week: Mapped[int] = mapped_column(Integer, nullable=False)
    topic_kc_focus: Mapped[str] = mapped_column(String(255), nullable=False)
    target_task: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    deadline: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    randomize_problems: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    kind: Mapped[str] = mapped_column(String(20), nullable=False, default="homework") # homework | lab
    starts_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True) # labs: locked until this time
    access_password: Mapped[str | None] = mapped_column(String(100), nullable=True) # labs: in-class password

    # Problem-set selection mode:
    #   "kc"     — derive problems dynamically by kc_tags ∩ topic_kc_focus (legacy behaviour)
    #   "manual" — explicit teacher-picked set stored in target_problems
    #   "random" — a random set drawn from the pool once at save time, frozen in target_problems
    selection_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="kc")
    # How many problems to assign; NULL falls back to MAX_ASSIGNED_PROBLEMS (3).
    problem_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Checkpoints/labs start unpublished so a teacher opens them explicitly; homework defaults visible.
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


class TargetProblem(Base):
    """Explicit membership of a Problem in a WeeklyTarget's set.

    Populated for the "manual" and "random" selection modes; the "kc" mode
    derives its set dynamically and leaves this table empty for the target.
    """
    __tablename__ = "target_problems"
    __table_args__ = (
        UniqueConstraint("weekly_target_id", "problem_id", name="uq_target_problem"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    weekly_target_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("weekly_targets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    problem_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("problems.id", ondelete="CASCADE"), nullable=False, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

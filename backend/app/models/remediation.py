import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class RemediationSession(Base):
    """Tracks a student's sequential misconception-remediation for one homework.

    When a submission carries misconception tags, the student is walked through
    multiple-choice questions one tag at a time, in detected order. `tags` is the
    ordered, de-duplicated list of tags to clear (e.g. ["LO", "CD"]);
    `current_index` points at the tag being remediated; `current_question_id` is
    the MC question currently being shown. A correct answer advances to the next
    tag; a wrong answer swaps in a different question for the same tag. The session
    completes once every tag has been cleared.
    """

    __tablename__ = "remediation_sessions"
    __table_args__ = (
        UniqueConstraint("user_id", "problem_key", name="uq_user_problem_remediation"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    problem_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    current_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    current_question_id: Mapped[uuid.UUID | None] = mapped_column(nullable=True)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

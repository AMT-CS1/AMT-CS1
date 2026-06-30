import uuid
from datetime import datetime
from sqlalchemy import String, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class QuizProgress(Base):
    __tablename__ = "quiz_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "problem_key", name="uq_user_problem_quiz_progress"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    problem_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    questions_answered: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

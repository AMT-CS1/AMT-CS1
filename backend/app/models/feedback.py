import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Text, Integer, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Feedback(Base):
    __tablename__ = "feedbacks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    problem_key: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    student_answer: Mapped[str] = mapped_column(Text, nullable=False)
    feedback_text: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True) # 1 for thumbs up, -1 for thumbs down
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())

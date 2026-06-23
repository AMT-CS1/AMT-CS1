import uuid
from sqlalchemy import String, Integer, Text
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

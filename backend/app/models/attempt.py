import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Float, func
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Attempt(Base):
    __tablename__ = "attempts"
    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    task_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    modality: Mapped[str] = mapped_column(String(50), nullable=False) # pseudocode, speech
    content_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    confidence_level: Mapped[float | None] = mapped_column(Float, nullable=True)

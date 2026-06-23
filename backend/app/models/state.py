import uuid
from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, Float, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class StudentModelState(Base):
    __tablename__ = "student_model_states"
    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    kc_mastery: Mapped[dict] = mapped_column(JSONB, nullable=False)
    misconception_risk: Mapped[dict] = mapped_column(JSONB, nullable=False)
    evidence_confidence: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now(), onupdate=func.now())

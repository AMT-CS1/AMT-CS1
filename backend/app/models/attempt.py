import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime, Float, func, Boolean, Index
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    task_ref: Mapped[str] = mapped_column(String(100), nullable=False)
    modality: Mapped[str] = mapped_column(String(50), nullable=False) # pseudocode, speech
    content_ref: Mapped[str] = mapped_column(String(255), nullable=False)
    source: Mapped[str] = mapped_column(String(100), nullable=False)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=func.now())
    confidence_level: Mapped[float | None] = mapped_column(Float, nullable=True)
    passed: Mapped[bool] = mapped_column(Boolean, nullable=True, default=False)
    ast_ref: Mapped[str | None] = mapped_column(String(255), nullable=True) # MinIO key of the compiled AST JSON
    misconceptions: Mapped[list | None] = mapped_column(JSONB, nullable=True) # AST-diff detection results
    # Origin of the attempt, denormalized from the WeeklyTarget it belonged to so
    # reports can split Homework vs Checkpoint without re-joining
    # (and so the split survives a later edit to the target). Null on legacy rows
    # and on attempts made with no target → shown as "Uncategorized".
    context: Mapped[str | None] = mapped_column(String(20), nullable=True) # practice (Homework), practicum (Checkpoint)
    target_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("weekly_targets.id", ondelete="SET NULL"), nullable=True
    )

    __table_args__ = (
        Index("ix_attempts_user_context", "user_id", "context"),
    )


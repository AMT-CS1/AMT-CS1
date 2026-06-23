import uuid
from sqlalchemy import String, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class CriticRecord(Base):
    __tablename__ = "critic_records"
    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    episode_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tutoring_episodes.id", ondelete="CASCADE"), nullable=False)
    checks: Mapped[dict] = mapped_column(JSONB, nullable=False)
    verdict: Mapped[str] = mapped_column(String(100), nullable=False)
    revision_count: Mapped[int] = mapped_column(Integer, default=0)

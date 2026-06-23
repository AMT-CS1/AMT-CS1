import uuid
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector
from app.models.base import Base

class CuratedCase(Base):
    __tablename__ = "curated_cases"
    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # Using 1536 dimension for OpenAI/standard embedding mappings
    embedding: Mapped[list[float]] = mapped_column(Vector(1536), nullable=False)
    target_kc: Mapped[str] = mapped_column(String(100), nullable=False)
    misconception_pattern: Mapped[str] = mapped_column(String(255), nullable=False)
    learner_profile: Mapped[str] = mapped_column(Text, nullable=False)
    difficulty: Mapped[str] = mapped_column(String(50), nullable=False)
    outcome_evidence: Mapped[str] = mapped_column(Text, nullable=False)

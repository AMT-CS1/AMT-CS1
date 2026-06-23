import uuid
from sqlalchemy import String, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class EvidenceBlob(Base):
    __tablename__ = "evidence_blobs"
    
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    uri: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False) # e.g. speech-audio, code-image
    hash: Mapped[str] = mapped_column(String(64), nullable=False)
    provenance: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence_level: Mapped[float | None] = mapped_column(Float, nullable=True)

import uuid
from sqlalchemy import String, Text, Integer
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base


class MisconceptionQuestion(Base):
    """A multiple-choice remediation question, keyed by misconception tag.

    Used by the sequential misconception-remediation flow: the student is served
    one question for the current tag; a correct answer clears the tag and advances
    to the next, a wrong answer serves a different question for the same tag.
    """

    __tablename__ = "misconception_questions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    misconception_tag: Mapped[str] = mapped_column(String(8), nullable=False, index=True)  # e.g. "LO", "CD", "SQ"

    # Question body (bilingual). `code` is an optional pseudocode snippet to reason about.
    text_en: Mapped[str] = mapped_column(Text, nullable=False)
    text_id: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Options (bilingual, parallel lists) and the index of the correct one.
    options_en: Mapped[list] = mapped_column(JSONB, nullable=False)
    options_id: Mapped[list] = mapped_column(JSONB, nullable=False)
    answer_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Shown after answering (safe to reveal — it's pedagogical, not a homework solution).
    explanation_en: Mapped[str] = mapped_column(Text, nullable=True)
    explanation_id: Mapped[str] = mapped_column(Text, nullable=True)

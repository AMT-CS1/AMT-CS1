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
    # KC-family tag ("LO", "SQ") or specific code ("VA-01") — same width as
    # problem_misconceptions.misconception_tag so the two vocabularies line up (P5/D3).
    misconception_tag: Mapped[str] = mapped_column(String(10), nullable=False, index=True)

    # Question body (bilingual). `code` is an optional pseudocode snippet to reason about.
    text_en: Mapped[str] = mapped_column(Text, nullable=False)
    text_id: Mapped[str] = mapped_column(Text, nullable=False)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Options (bilingual, parallel lists) and the index of the correct one.
    options_en: Mapped[list] = mapped_column(JSONB, nullable=False)
    options_id: Mapped[list] = mapped_column(JSONB, nullable=False)
    answer_index: Mapped[int] = mapped_column(Integer, nullable=False)

    # Option-level triggers (P5/D1): list parallel to options_en — entry i is the
    # list of misconception tags that picking option i reveals (correct option: []).
    # NULL = not authored; the engine then falls back to the question-level tag.
    # Diagnostic metadata only — NEVER a scoring input, and never sent to students
    # (it would label the distractors).
    option_misconceptions: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Shown after answering (safe to reveal — it's pedagogical, not a homework solution).
    explanation_en: Mapped[str] = mapped_column(Text, nullable=True)
    explanation_id: Mapped[str] = mapped_column(Text, nullable=True)

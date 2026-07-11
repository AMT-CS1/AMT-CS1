"""Core logic for the sequential misconception-remediation flow (multiple-choice).

Shared by the remediation router and the attempts endpoint. The student is served
one MC question for the current misconception tag; a correct answer clears the tag
and advances to the next, a wrong answer swaps in a different question for the same
tag. Tag order follows detection order (e.g. LO then CD).
"""
from __future__ import annotations

import uuid
import random
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.kcs import misconception_code_to_tag, misconception_tag_name
from app.models.misconception_question import MisconceptionQuestion
from app.models.remediation import RemediationSession
from app.schemas.remediation import MisconceptionQuestionSchema, RemediationStatusResponse


def ordered_tags_from_misconceptions(misconceptions: list[dict]) -> list[str]:
    """Turn detected misconceptions into an ordered, de-duplicated list of tags.

    Drops codes with no known tag (e.g. the generic "GEN" fallback), reverses
    the order so remediation begins with the last detected misconception,
    and optionally appends a dummy SQ round for testing when REMEDIATION_DUMMY_SQ is on.
    """
    tags: list[str] = []
    for m in misconceptions or []:
        tag = misconception_code_to_tag(m.get("code", ""))
        if tag and tag not in tags:
            tags.append(tag)

    # Reverse the order so remediation begins with the last detected misconception
    tags.reverse()

    # Dummy SQ injection (test-only): SQ has no automatic detector yet.
    if settings.REMEDIATION_DUMMY_SQ and tags and "SQ" not in tags:
        tags.append("SQ")

    return tags


async def _questions_for_tag(db: AsyncSession, tag: str) -> list[MisconceptionQuestion]:
    stmt = select(MisconceptionQuestion).where(MisconceptionQuestion.misconception_tag == tag)
    res = await db.execute(stmt)
    return list(res.scalars().all())


async def pick_question(
    db: AsyncSession, tag: str, exclude_id: Optional[uuid.UUID] = None
) -> Optional[MisconceptionQuestion]:
    """Pick a random question for a tag, avoiding `exclude_id` when alternatives exist."""
    questions = await _questions_for_tag(db, tag)
    if not questions:
        return None
    if exclude_id is not None and len(questions) > 1:
        questions = [q for q in questions if q.id != exclude_id]
    return random.choice(questions)


async def get_session(
    db: AsyncSession, user_id: uuid.UUID, problem_key: str
) -> Optional[RemediationSession]:
    stmt = select(RemediationSession).where(
        and_(
            RemediationSession.user_id == user_id,
            RemediationSession.problem_key == problem_key,
        )
    )
    res = await db.execute(stmt)
    return res.scalar_one_or_none()


async def upsert_session(
    db: AsyncSession, user_id: uuid.UUID, problem_key: str, tags: list[str]
) -> Optional[RemediationSession]:
    """Create or refresh an incomplete remediation session for a homework.

    Skips entirely when there are no tags. Leaves an already-completed session
    untouched. Resets progress when the tag set for a fresh, incomplete session
    changed.
    """
    if not tags:
        return None

    session = await get_session(db, user_id, problem_key)
    if session is None:
        session = RemediationSession(
            user_id=user_id,
            problem_key=problem_key,
            tags=tags,
            current_index=0,
            current_question_id=None,
            completed_at=None,
        )
        db.add(session)
    elif session.completed_at is None and session.tags != tags:
        session.tags = tags
        session.current_index = 0
        session.current_question_id = None
    return session


async def normalize_session(db: AsyncSession, session: RemediationSession) -> bool:
    """Advance past tags that have no MC questions and finalize when past the last.

    Guards against a dead-end when a detected tag has no questions in the bank.
    Returns True when the session was mutated (caller should commit).
    """
    changed = False
    tags = list(session.tags or [])
    while session.completed_at is None and session.current_index < len(tags):
        current_tag = tags[session.current_index]
        questions = await _questions_for_tag(db, current_tag)
        if questions:
            break
        session.current_index += 1
        session.current_question_id = None
        changed = True
    if session.completed_at is None and session.current_index >= len(tags):
        session.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        changed = True
    return changed


async def ensure_current_question(
    db: AsyncSession, session: RemediationSession, exclude_id: Optional[uuid.UUID] = None
) -> Optional[MisconceptionQuestion]:
    """Return the question the student should see for the current tag.

    Reuses the stored `current_question_id` when it is still valid for the current
    tag; otherwise (or when `exclude_id` is given) picks a fresh one and persists it.
    """
    tags = list(session.tags or [])
    if session.current_index >= len(tags):
        return None
    current_tag = tags[session.current_index]

    question: Optional[MisconceptionQuestion] = None
    if exclude_id is None and session.current_question_id is not None:
        question = await db.get(MisconceptionQuestion, session.current_question_id)
        if question is not None and question.misconception_tag != current_tag:
            question = None

    if question is None:
        question = await pick_question(db, current_tag, exclude_id=exclude_id)
        session.current_question_id = question.id if question else None

    return question


def _serialize_question(q: Optional[MisconceptionQuestion]) -> Optional[MisconceptionQuestionSchema]:
    if q is None:
        return None
    return MisconceptionQuestionSchema(
        id=q.id,
        text_en=q.text_en,
        text_id=q.text_id,
        code=q.code,
        options_en=list(q.options_en or []),
        options_id=list(q.options_id or []),
    )


def build_status(
    session: Optional[RemediationSession],
    current_question: Optional[MisconceptionQuestion],
) -> RemediationStatusResponse:
    """Serialize a session (plus the current question) into a status payload."""
    if session is None:
        return RemediationStatusResponse(active=False, completed=False, problem_key="")

    tags = list(session.tags or [])
    completed = session.completed_at is not None or session.current_index >= len(tags)
    current_tag = tags[session.current_index] if session.current_index < len(tags) else None

    return RemediationStatusResponse(
        active=not completed,
        completed=completed,
        problem_key=session.problem_key,
        tags=tags,
        current_index=session.current_index,
        total_tags=len(tags),
        current_tag=current_tag,
        current_tag_name=misconception_tag_name(current_tag) if current_tag else None,
        current_question=None if completed else _serialize_question(current_question),
    )


async def status_for(
    db: AsyncSession, session: Optional[RemediationSession]
) -> RemediationStatusResponse:
    """Build a full status response, loading/assigning the current question."""
    if session is None:
        return RemediationStatusResponse(active=False, completed=False, problem_key="")
    completed = session.completed_at is not None or session.current_index >= len(session.tags or [])
    question = None if completed else await ensure_current_question(db, session)
    return build_status(session, question)

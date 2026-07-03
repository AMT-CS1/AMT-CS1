import json
import logging
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.misconception import generate_ast_json
from app.core.references import load_reference_files
from app.core.security import RoleChecker
from app.core.storage import download_text_from_minio
from app.models.attempt import Attempt
from app.models.feedback import Feedback
from app.models.log import InteractionLog
from app.models.problem import Problem
from app.models.rating import Rating
from app.models.user import User
from app.schemas.review import (
    FeedbackVerdictRequest,
    FeedbackVerdictResponse,
    ReviewAttemptDetail,
    ReviewAttemptSummary,
    ReviewFeedbackItem,
    ReviewProblemContext,
    ReviewReferenceFile,
    TutoringEpisodeReview,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/review", tags=["review"])

FEEDBACK_ITEM_REF_PREFIX = "feedback:"

@router.get("/episodes", response_model=List[TutoringEpisodeReview])
async def get_review_episodes(
    current_user: dict = Depends(RoleChecker(["instructor", "rater"]))
):
    raise HTTPException(status_code=501, detail="GET /review/episodes is not implemented yet")


async def _problem_title_map(db: AsyncSession) -> dict[str, str]:
    """task_ref is a free string (not an FK), so map problem key -> title in Python."""
    res = await db.execute(select(Problem.key, Problem.title))
    return {key: title for key, title in res.all()}


@router.get("/attempts", response_model=List[ReviewAttemptSummary])
async def list_review_attempts(
    user_id: Optional[str] = Query(None, description="Filter by student UUID"),
    task_ref: Optional[str] = Query(None, description="Filter by problem key"),
    only_misconceptions: bool = Query(False, description="Only attempts with detected misconceptions"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "rater"])),
):
    """List student attempts with their detected misconceptions for expert review."""
    stmt = (
        select(Attempt, User.username)
        .join(User, User.id == Attempt.user_id)
        .order_by(Attempt.timestamp.desc())
    )
    if user_id:
        try:
            stmt = stmt.where(Attempt.user_id == uuid.UUID(user_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid user_id")
    if task_ref:
        stmt = stmt.where(Attempt.task_ref == task_ref)
    if only_misconceptions:
        # The submission pipeline stores either a non-empty list or NULL
        stmt = stmt.where(Attempt.misconceptions.isnot(None))

    result = await db.execute(stmt)
    rows = result.all()
    titles = await _problem_title_map(db)

    return [
        ReviewAttemptSummary(
            id=attempt.id,
            user_id=attempt.user_id,
            username=username,
            task_ref=attempt.task_ref,
            problem_title=titles.get(attempt.task_ref),
            passed=attempt.passed,
            timestamp=attempt.timestamp,
            has_ast=attempt.ast_ref is not None,
            misconceptions=attempt.misconceptions or [],
        )
        for attempt, username in rows
    ]


@router.get("/attempts/{id}", response_model=ReviewAttemptDetail)
async def get_review_attempt_detail(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "rater"])),
):
    """
    Full review context for one attempt: student code and AST, plus the problem's
    reference solution and reference AST.

    Unlike the problem endpoints (which null reference_solution for non-instructors),
    this endpoint intentionally exposes the reference material to raters — they are
    trusted experts comparing submissions against it.
    """
    stmt = (
        select(Attempt, User.username)
        .join(User, User.id == Attempt.user_id)
        .where(Attempt.id == id)
    )
    res = await db.execute(stmt)
    row = res.first()
    if not row:
        raise HTTPException(status_code=404, detail="Attempt not found")
    attempt, username = row

    problem_res = await db.execute(select(Problem).where(Problem.key == attempt.task_ref))
    db_problem = problem_res.scalars().first()

    student_code = await download_text_from_minio(attempt.content_ref)

    student_ast = None
    if attempt.ast_ref:
        ast_text = await download_text_from_minio(attempt.ast_ref)
        if ast_text:
            try:
                student_ast = json.loads(ast_text)
            except json.JSONDecodeError:
                logger.warning("Stored AST for attempt %s is not valid JSON", attempt.id)

    problem_ctx = None
    if db_problem is not None:
        reference_ast = db_problem.reference_ast
        if reference_ast is None and db_problem.reference_solution:
            # Lazily compile and cache the reference AST, mirroring the
            # submission pipeline in routers/attempts.py
            try:
                reference_ast = await generate_ast_json(db_problem.reference_solution)
                if reference_ast is not None:
                    db_problem.reference_ast = reference_ast
                    await db.commit()
            except Exception as e:
                logger.warning("Reference AST compilation failed for %s: %s", db_problem.key, e)
                reference_ast = None
        reference_files = await load_reference_files(db_problem, with_ast=True)
        problem_ctx = ReviewProblemContext(
            key=db_problem.key,
            title=db_problem.title,
            description_en=db_problem.description_en,
            reference_solution=db_problem.reference_solution,
            reference_ast=reference_ast,
            references=[ReviewReferenceFile(**f) for f in reference_files],
        )

    return ReviewAttemptDetail(
        id=attempt.id,
        user_id=attempt.user_id,
        username=username,
        task_ref=attempt.task_ref,
        passed=attempt.passed,
        timestamp=attempt.timestamp,
        confidence_level=attempt.confidence_level,
        student_code=student_code,
        student_ast=student_ast,
        misconceptions=attempt.misconceptions or [],
        problem=problem_ctx,
    )


@router.get("/feedbacks", response_model=List[ReviewFeedbackItem])
async def list_review_feedbacks(
    user_id: Optional[str] = Query(None, description="Filter by student UUID"),
    problem_key: Optional[str] = Query(None, description="Filter by problem key"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "rater"])),
):
    """List all generated Tutor Guidance feedback with this rater's verdicts."""
    stmt = (
        select(Feedback, User.username)
        .join(User, User.id == Feedback.user_id)
        .order_by(Feedback.timestamp.desc())
    )
    if user_id:
        try:
            stmt = stmt.where(Feedback.user_id == uuid.UUID(user_id))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid user_id")
    if problem_key:
        stmt = stmt.where(Feedback.problem_key == problem_key)

    result = await db.execute(stmt)
    rows = result.all()
    titles = await _problem_title_map(db)

    # This rater's verdicts, newest first so the first one seen per item_ref wins
    # (defends against historical duplicate rows — no unique constraint on ratings)
    verdict_res = await db.execute(
        select(Rating)
        .where(
            Rating.rater_id == uuid.UUID(current_user["id"]),
            Rating.item_ref.like(f"{FEEDBACK_ITEM_REF_PREFIX}%"),
        )
        .order_by(Rating.timestamp.desc())
    )
    verdicts: dict[str, Rating] = {}
    for rating in verdict_res.scalars().all():
        verdicts.setdefault(rating.item_ref, rating)

    items: List[ReviewFeedbackItem] = []
    for feedback, username in rows:
        rating = verdicts.get(f"{FEEDBACK_ITEM_REF_PREFIX}{feedback.id}")
        items.append(ReviewFeedbackItem(
            id=feedback.id,
            user_id=feedback.user_id,
            username=username,
            problem_key=feedback.problem_key,
            problem_title=titles.get(feedback.problem_key),
            question_text=feedback.question_text,
            student_answer=feedback.student_answer,
            feedback_text=feedback.feedback_text,
            student_rating=feedback.rating,
            timestamp=feedback.timestamp,
            expert_verdict=rating.rubric_scores.get("helpful") if rating else None,
            verdict_timestamp=rating.timestamp if rating else None,
        ))
    return items


@router.post("/feedbacks/{id}/verdict", response_model=FeedbackVerdictResponse)
async def set_feedback_verdict(
    id: uuid.UUID,
    payload: FeedbackVerdictRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "rater"])),
):
    """Record (or update) this rater's helpful / not-helpful verdict for a feedback."""
    feedback_res = await db.execute(select(Feedback).where(Feedback.id == id))
    feedback = feedback_res.scalar_one_or_none()
    if not feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")

    rater_id = uuid.UUID(current_user["id"])
    item_ref = f"{FEEDBACK_ITEM_REF_PREFIX}{id}"

    rating_res = await db.execute(
        select(Rating).where(Rating.rater_id == rater_id, Rating.item_ref == item_ref)
        .order_by(Rating.timestamp.desc())
    )
    rating = rating_res.scalars().first()
    if rating:
        rating.rubric_scores = {"helpful": payload.helpful}
        rating.timestamp = func.now()
    else:
        rating = Rating(
            rater_id=rater_id,
            item_ref=item_ref,
            rubric_scores={"helpful": payload.helpful},
        )
        db.add(rating)

    db.add(InteractionLog(
        actor=current_user["id"],
        event_type="expert_verdict",
        payload={"feedback_id": str(id), "helpful": payload.helpful},
    ))

    await db.commit()
    await db.refresh(rating)

    return FeedbackVerdictResponse(
        feedback_id=id,
        helpful=payload.helpful,
        rating_id=rating.id,
        timestamp=rating.timestamp,
    )

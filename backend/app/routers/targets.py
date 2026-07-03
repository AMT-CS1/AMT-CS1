from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List
from datetime import datetime, timezone
import uuid

from app.core.security import RoleChecker
from app.core.database import get_db
from app.models.target import WeeklyTarget
from app.models.problem import Problem
from app.models.attempt import Attempt
from app.schemas.target import TargetCreate, TargetResponse, TargetUnlockRequest, TargetGradeResponse, TargetGradeReviewResponse, ProblemReviewItem

router = APIRouter(prefix="/targets", tags=["targets"])

MAX_ASSIGNED_PROBLEMS = 3


def as_utc(dt: datetime | None) -> datetime | None:
    """Normalizes stored datetimes (naive = UTC) for comparison."""
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def to_naive_utc(dt: datetime | None) -> datetime | None:
    """Converts incoming (possibly tz-aware) datetimes to naive UTC for storage."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).replace(tzinfo=None) if dt.tzinfo else dt


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def serialize_target(target: WeeklyTarget, role: str) -> TargetResponse:
    """Serialize a target, hiding the lab password from non-instructors."""
    resp = TargetResponse.model_validate(target)
    # Emit unambiguous UTC timestamps so clients parse them correctly
    resp.deadline = as_utc(target.deadline)
    resp.starts_at = as_utc(target.starts_at)
    resp.requires_password = bool(target.kind == "lab" and target.access_password)
    if role != "instructor":
        resp.access_password = None
    return resp


def matched_problem_keys(target: WeeklyTarget, problems: list[Problem]) -> list[str]:
    """Problem keys whose kc_tags overlap the target's KC focus (same matching as the frontend)."""
    target_kcs = {k.strip().upper() for k in target.topic_kc_focus.split(",") if k.strip()}
    keys = []
    for p in problems:
        problem_kcs = {k.strip().upper() for k in p.kc_tags.split(",") if k.strip()}
        if problem_kcs & target_kcs:
            keys.append(p.key)
    return keys


@router.post("", response_model=TargetResponse, status_code=201)
async def configure_weekly_target(
    target: TargetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    if target.kind == "lab" and not target.access_password:
        raise HTTPException(status_code=400, detail="Lab sessions require an access password")

    db_target = WeeklyTarget(
        course_ref=target.course_ref,
        week=target.week,
        topic_kc_focus=target.topic_kc_focus,
        target_task=target.target_task,
        source=target.source,
        title=target.title,
        description=target.description,
        deadline=to_naive_utc(target.deadline),
        randomize_problems=target.randomize_problems,
        kind=target.kind,
        starts_at=to_naive_utc(target.starts_at),
        access_password=target.access_password
    )
    db.add(db_target)
    await db.commit()
    await db.refresh(db_target)
    return serialize_target(db_target, current_user.get("role"))

@router.get("", response_model=List[TargetResponse])
async def list_weekly_targets(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    stmt = select(WeeklyTarget)
    result = await db.execute(stmt)
    targets = result.scalars().all()
    return [serialize_target(t, current_user.get("role")) for t in targets]

@router.put("/{id}", response_model=TargetResponse)
async def update_weekly_target(
    id: uuid.UUID,
    target_in: TargetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(WeeklyTarget).where(WeeklyTarget.id == id)
    res = await db.execute(stmt)
    db_target = res.scalar_one_or_none()
    if not db_target:
        raise HTTPException(status_code=404, detail="Weekly target not found")

    if target_in.kind == "lab" and not target_in.access_password:
        raise HTTPException(status_code=400, detail="Lab sessions require an access password")

    db_target.course_ref = target_in.course_ref
    db_target.week = target_in.week
    db_target.topic_kc_focus = target_in.topic_kc_focus
    db_target.target_task = target_in.target_task
    db_target.source = target_in.source
    db_target.title = target_in.title
    db_target.description = target_in.description
    db_target.deadline = to_naive_utc(target_in.deadline)
    db_target.randomize_problems = target_in.randomize_problems
    db_target.kind = target_in.kind
    db_target.starts_at = to_naive_utc(target_in.starts_at)
    db_target.access_password = target_in.access_password

    await db.commit()
    await db.refresh(db_target)
    return serialize_target(db_target, current_user.get("role"))

@router.delete("/{id}", status_code=204)
async def delete_weekly_target(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(WeeklyTarget).where(WeeklyTarget.id == id)
    res = await db.execute(stmt)
    db_target = res.scalar_one_or_none()
    if not db_target:
        raise HTTPException(status_code=404, detail="Weekly target not found")

    await db.delete(db_target)
    await db.commit()
    return {}


@router.post("/{id}/unlock")
async def unlock_lab_target(
    id: uuid.UUID,
    payload: TargetUnlockRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    """Validates the in-class password and the lab time window."""
    stmt = select(WeeklyTarget).where(WeeklyTarget.id == id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
    if target.kind != "lab":
        raise HTTPException(status_code=400, detail="Only lab sessions require unlocking")

    now = now_utc()
    starts_at = as_utc(target.starts_at)
    deadline = as_utc(target.deadline)
    if starts_at and now < starts_at:
        raise HTTPException(status_code=403, detail="This lab session has not started yet")
    if deadline and now >= deadline:
        raise HTTPException(status_code=403, detail="This lab session has ended")
    if not target.access_password or payload.password != target.access_password:
        raise HTTPException(status_code=403, detail="Invalid lab session password")

    return {"status": "ok"}


@router.get("/{id}/grade", response_model=TargetGradeReviewResponse)
async def get_target_grade(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher"]))
):
    """
    Automated grade for the current user on a target:
    solved problems / assigned problems (max 3) * 100.
    """
    stmt = select(WeeklyTarget).where(WeeklyTarget.id == id)
    res = await db.execute(stmt)
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    problems_res = await db.execute(select(Problem))
    problems = problems_res.scalars().all()
    matched_keys = matched_problem_keys(target, problems)
    total = min(len(matched_keys), MAX_ASSIGNED_PROBLEMS)

    user_id = uuid.UUID(current_user["id"])
    solved_keys: list[str] = []
    if matched_keys:
        solved_stmt = select(Attempt.task_ref).where(
            and_(
                Attempt.user_id == user_id,
                Attempt.passed == True,  # noqa: E712
                Attempt.task_ref.in_(matched_keys)
            )
        ).distinct()
        solved_res = await db.execute(solved_stmt)
        solved_keys = [row[0] for row in solved_res.all()]

    solved = min(len(solved_keys), total)
    grade = round(100 * solved / total) if total else 0

    problem_reviews: list[dict] = []
    now = datetime.now(timezone.utc)
    target_deadline = as_utc(target.deadline)
    if target.kind == "homework" and target_deadline and now >= target_deadline:
        import logging
        from app.core.references import load_reference_files
        from app.core.storage import download_text_from_minio
        local_logger = logging.getLogger(__name__)

        for key in matched_keys:
            attempt_stmt = select(Attempt).where(
                and_(
                    Attempt.user_id == user_id,
                    Attempt.task_ref == key
                )
            ).order_by(Attempt.timestamp.desc()).limit(1)
            attempt_res = await db.execute(attempt_stmt)
            last_attempt = attempt_res.scalar_one_or_none()

            prob = next((p for p in problems if p.key == key), None)
            prob_title = prob.title if prob else key

            student_code = None
            last_submitted_at = None
            misconceptions = []

            if last_attempt:
                last_submitted_at = last_attempt.timestamp
                misconceptions = last_attempt.misconceptions or []
                if last_attempt.content_ref:
                    try:
                        student_code = await download_text_from_minio(last_attempt.content_ref)
                    except Exception as e:
                        local_logger.warning("Failed to retrieve student code for attempt %s: %s", last_attempt.id, e)

            reference_code = None
            if prob:
                try:
                    ref_files = await load_reference_files(prob)
                    if ref_files:
                        reference_code = ref_files[0]["content"]
                except Exception as e:
                    local_logger.warning("Failed to retrieve reference files for problem %s: %s", key, e)

            problem_reviews.append({
                "problem_key": key,
                "problem_title": prob_title,
                "last_submitted_at": last_submitted_at,
                "student_code": student_code,
                "reference_code": reference_code,
                "misconceptions": misconceptions
            })

    return TargetGradeReviewResponse(
        target_id=target.id,
        kind=target.kind,
        total_problems=total,
        solved_problems=solved,
        grade=grade,
        deadline=as_utc(target.deadline),
        solved_keys=solved_keys,
        problem_reviews=problem_reviews if problem_reviews else None
    )

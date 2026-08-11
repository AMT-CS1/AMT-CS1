from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, delete, func
from typing import List
from datetime import datetime, timezone
import uuid
import random

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.problem_selection import (
    kc_matched_problems,
    assigned_cap,
    resolve_assigned_problems_async,
    load_target_problem_ids,
    DEFAULT_ASSIGNED_PROBLEMS,
)
from app.models.target import WeeklyTarget, TargetProblem
from app.models.problem import Problem
from app.models.attempt import Attempt
from app.schemas.target import TargetCreate, TargetResponse, TargetUnlockRequest, TargetGradeResponse, TargetGradeReviewResponse, ProblemReviewItem, TargetReviewItem, TargetReviewResponse

router = APIRouter(prefix="/targets", tags=["targets"])

MAX_ASSIGNED_PROBLEMS = DEFAULT_ASSIGNED_PROBLEMS


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


async def write_target_problem_set(
    db: AsyncSession, target: WeeklyTarget, target_in: TargetCreate, problems: list[Problem]
) -> list[Problem]:
    """Replace a target's explicit problem set from the create/update payload.

    Returns the ordered chosen problems (empty for 'kc' mode, which stays dynamic).
    """
    await db.execute(delete(TargetProblem).where(TargetProblem.weekly_target_id == target.id))
    mode = target_in.selection_mode or "kc"
    chosen: list[Problem] = []
    if mode == "manual":
        by_key = {p.key: p for p in problems}
        for k in target_in.problem_keys:
            p = by_key.get(k)
            if p is not None and p not in chosen:
                chosen.append(p)
    elif mode == "random":
        pool = kc_matched_problems(target, problems) if (target_in.random_pool or "kc") == "kc" else list(problems)
        count = target_in.problem_count or DEFAULT_ASSIGNED_PROBLEMS
        if pool:
            chosen = random.sample(pool, min(count, len(pool)))
    # 'kc' mode leaves target_problems empty (derived dynamically).
    for pos, p in enumerate(chosen):
        db.add(TargetProblem(weekly_target_id=target.id, problem_id=p.id, position=pos))
    return chosen


def keys_after_write(target: WeeklyTarget, target_in: TargetCreate, problems: list[Problem], chosen: list[Problem]) -> list[str]:
    """Assigned problem keys right after a create/update, without re-querying."""
    if (target_in.selection_mode or "kc") in ("manual", "random"):
        return [p.key for p in chosen]
    return [p.key for p in kc_matched_problems(target, problems)[: assigned_cap(target)]]


def serialize_target(target: WeeklyTarget, role: str, problem_keys: list[str] | None = None) -> TargetResponse:
    """Serialize a target, hiding the lab password from non-instructors."""
    resp = TargetResponse.model_validate(target)
    if problem_keys is not None:
        resp.problem_keys = problem_keys
    # Emit unambiguous UTC timestamps so clients parse them correctly
    resp.deadline = as_utc(target.deadline)
    resp.starts_at = as_utc(target.starts_at)
    resp.requires_password = bool(target.kind == "lab" and target.access_password)
    if role != "instructor":
        resp.access_password = None
    return resp


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
        access_password=target.access_password,
        selection_mode=target.selection_mode or "kc",
        problem_count=target.problem_count,
        is_published=target.is_published,
    )
    db.add(db_target)
    await db.flush()  # assign db_target.id before writing the problem set

    problems = (await db.execute(select(Problem))).scalars().all()
    chosen = await write_target_problem_set(db, db_target, target, problems)
    keys = keys_after_write(db_target, target, problems, chosen)

    await db.commit()
    await db.refresh(db_target)
    return serialize_target(db_target, current_user.get("role"), keys)

@router.get("", response_model=List[TargetResponse])
async def list_weekly_targets(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    role = current_user.get("role")
    stmt = select(WeeklyTarget)
    # Students only see published targets; checkpoints stay hidden until a teacher opens them.
    if role == "student":
        stmt = stmt.where(WeeklyTarget.is_published == True)  # noqa: E712
    result = await db.execute(stmt)
    targets = result.scalars().all()

    # Bulk-resolve assigned problem keys so the client stops re-deriving.
    problems = (await db.execute(select(Problem))).scalars().all()
    problems_by_id = {p.id: p for p in problems}
    tp_rows = (
        await db.execute(
            select(TargetProblem).order_by(TargetProblem.weekly_target_id, TargetProblem.position)
        )
    ).scalars().all()
    explicit_keys: dict[uuid.UUID, list[str]] = {}
    for row in tp_rows:
        p = problems_by_id.get(row.problem_id)
        if p is not None:
            explicit_keys.setdefault(row.weekly_target_id, []).append(p.key)

    out: list[TargetResponse] = []
    for t in targets:
        if (t.selection_mode or "kc") in ("manual", "random"):
            keys = explicit_keys.get(t.id, [])
        else:
            keys = [p.key for p in kc_matched_problems(t, problems)[: assigned_cap(t)]]
        out.append(serialize_target(t, role, keys))
    return out

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
    db_target.selection_mode = target_in.selection_mode or "kc"
    db_target.problem_count = target_in.problem_count
    db_target.is_published = target_in.is_published

    problems = (await db.execute(select(Problem))).scalars().all()
    chosen = await write_target_problem_set(db, db_target, target_in, problems)
    keys = keys_after_write(db_target, target_in, problems, chosen)

    await db.commit()
    await db.refresh(db_target)
    return serialize_target(db_target, current_user.get("role"), keys)

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
    if not target.is_published:
        raise HTTPException(status_code=403, detail="This checkpoint is not open yet")

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
    assigned = await resolve_assigned_problems_async(db, target, problems)
    matched_keys = [p.key for p in assigned]
    total = len(matched_keys)

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


@router.get("/{id}/review", response_model=TargetReviewResponse)
async def get_target_review(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher"]))
):
    """
    The caller's own per-problem review for a target (R1).

    Unlike `/grade`, this is available the moment the student submits — it never
    waits for the deadline — so a submitted set can be reviewed immediately.
    Reference solutions stay deadline-gated so early submitters can't harvest them.
    """
    import logging
    from app.core.references import load_reference_files
    from app.core.storage import download_text_from_minio
    local_logger = logging.getLogger(__name__)

    res = await db.execute(select(WeeklyTarget).where(WeeklyTarget.id == id))
    target = res.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")

    problems = (await db.execute(select(Problem))).scalars().all()
    assigned = await resolve_assigned_problems_async(db, target, problems)
    matched_keys = [p.key for p in assigned]
    total = len(matched_keys)

    user_id = uuid.UUID(current_user["id"])

    solved_keys: list[str] = []
    if matched_keys:
        solved_res = await db.execute(
            select(Attempt.task_ref).where(
                and_(
                    Attempt.user_id == user_id,
                    Attempt.passed == True,  # noqa: E712
                    Attempt.task_ref.in_(matched_keys),
                )
            ).distinct()
        )
        solved_keys = [row[0] for row in solved_res.all()]
    solved_set = set(solved_keys)

    now = datetime.now(timezone.utc)
    target_deadline = as_utc(target.deadline)
    deadline_passed = bool(target_deadline and now >= target_deadline)

    reviews: list[TargetReviewItem] = []
    for key in matched_keys:
        prob = next((p for p in problems if p.key == key), None)
        prob_title = prob.title if prob else key

        # Every "Run & Verify" writes an attempt row; count them all (Q1 decision).
        attempts_count = (await db.execute(
            select(func.count()).select_from(Attempt).where(
                and_(Attempt.user_id == user_id, Attempt.task_ref == key)
            )
        )).scalar_one()

        last_attempt = (await db.execute(
            select(Attempt).where(
                and_(Attempt.user_id == user_id, Attempt.task_ref == key)
            ).order_by(Attempt.timestamp.desc()).limit(1)
        )).scalar_one_or_none()

        student_code = None
        last_submitted_at = None
        misconceptions: list = []
        if last_attempt:
            last_submitted_at = last_attempt.timestamp
            misconceptions = last_attempt.misconceptions or []
            if last_attempt.content_ref:
                try:
                    student_code = await download_text_from_minio(last_attempt.content_ref)
                except Exception as e:
                    local_logger.warning("Failed to retrieve student code for attempt %s: %s", last_attempt.id, e)

        reference_code = None
        if deadline_passed and prob:
            try:
                ref_files = await load_reference_files(prob)
                if ref_files:
                    reference_code = ref_files[0]["content"]
            except Exception as e:
                local_logger.warning("Failed to retrieve reference files for problem %s: %s", key, e)

        reviews.append(TargetReviewItem(
            problem_key=key,
            problem_title=prob_title,
            solved=key in solved_set,
            attempts_count=attempts_count,
            last_submitted_at=last_submitted_at,
            student_code=student_code,
            reference_code=reference_code,
            misconceptions=misconceptions,
        ))

    return TargetReviewResponse(
        target_id=target.id,
        kind=target.kind,
        week=target.week,
        title=target.title,
        deadline=target_deadline,
        total_problems=total,
        solved_problems=min(len(solved_keys), total),
        problem_reviews=reviews,
    )

"""Single source of truth for which problems belong to a WeeklyTarget.

Historically membership was derived three different ways (two backend helpers +
one client copy) purely by KC-tag overlap. This module unifies that and adds the
explicit `manual` / `random` selection modes backed by the `target_problems`
join table.

Modes (WeeklyTarget.selection_mode):
  - "kc"     — dynamic overlap of problem.kc_tags with target.topic_kc_focus,
               capped at problem_count (default 3).
  - "manual" — the exact set a teacher picked, stored in target_problems.
  - "random" — a set drawn once at save time from the pool, frozen in target_problems.
"""
from typing import List, Optional
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.target import WeeklyTarget, TargetProblem
from app.models.problem import Problem

DEFAULT_ASSIGNED_PROBLEMS = 3


def kc_matched_problems(target: WeeklyTarget, problems: List[Problem]) -> List[Problem]:
    """Problems whose kc_tags overlap the target's topic_kc_focus (no slice)."""
    target_kcs = {k.strip().upper() for k in (target.topic_kc_focus or "").split(",") if k.strip()}
    matched = []
    for p in problems:
        problem_kcs = {k.strip().upper() for k in (p.kc_tags or "").split(",") if k.strip()}
        if problem_kcs & target_kcs:
            matched.append(p)
    return matched


def assigned_cap(target: WeeklyTarget) -> int:
    return target.problem_count or DEFAULT_ASSIGNED_PROBLEMS


def resolve_assigned_problems(
    target: WeeklyTarget,
    problems: List[Problem],
    explicit_problem_ids: Optional[List[uuid.UUID]] = None,
) -> List[Problem]:
    """Ordered Problem objects assigned to a target, honoring selection_mode.

    For manual/random, pass the ordered problem ids from `target_problems`
    (see `load_target_problem_ids`). For kc (or when the explicit set is empty)
    the KC overlap is used, capped at the target's problem_count.
    """
    mode = (getattr(target, "selection_mode", "kc") or "kc")
    if mode in ("manual", "random") and explicit_problem_ids:
        by_id = {p.id: p for p in problems}
        return [by_id[pid] for pid in explicit_problem_ids if pid in by_id]
    return kc_matched_problems(target, problems)[: assigned_cap(target)]


async def load_target_problem_ids(db: AsyncSession, target_id: uuid.UUID) -> List[uuid.UUID]:
    """Ordered problem ids explicitly assigned to a target via target_problems."""
    res = await db.execute(
        select(TargetProblem.problem_id)
        .where(TargetProblem.weekly_target_id == target_id)
        .order_by(TargetProblem.position)
    )
    return [row[0] for row in res.all()]


async def resolve_assigned_problems_async(
    db: AsyncSession, target: WeeklyTarget, problems: List[Problem]
) -> List[Problem]:
    """Convenience entry point: loads the explicit set when needed, then resolves."""
    explicit: Optional[List[uuid.UUID]] = None
    if (target.selection_mode or "kc") in ("manual", "random"):
        explicit = await load_target_problem_ids(db, target.id)
    return resolve_assigned_problems(target, problems, explicit)


async def resolve_assigned_keys_async(
    db: AsyncSession, target: WeeklyTarget, problems: List[Problem]
) -> List[str]:
    return [p.key for p in await resolve_assigned_problems_async(db, target, problems)]

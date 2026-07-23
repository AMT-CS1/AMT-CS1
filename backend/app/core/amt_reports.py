"""Read-side aggregation for the AMT-CS1 native interaction reports.

The in-tutor counterpart to `lms_reports.py`: all numbers come from the
`attempts` table (Practice Workspace / Practicum Session submissions) plus
`remediation_sessions`, aggregated at request time. Class scoping reuses the
LMS enrollment roster (see `resolve_course_student_user_ids` in `lms_reports`),
so an AMT-CS1 report is class-aware once an LMS export has been imported.

`attempts.context` splits the two workspaces: "practice" (homework) vs
"practicum" (lab). Legacy rows with a NULL context predate this column and are
excluded from both blocks (no backfill, per plan D2).
"""
from collections import defaultdict
from typing import Optional
import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.kcs import misconception_code_to_tag, misconception_tag_name
from app.models.attempt import Attempt
from app.models.user import User
from app.models.problem import Problem
from app.models.remediation import RemediationSession
from app.models.lms import LmsParticipant


def _round(v, digits: int = 2):
    return round(v, digits) if v is not None else None


def _rate(num: int, den: int) -> Optional[float]:
    return _round(num / den) if den else None


def _attempt_tags(misconceptions) -> list[str]:
    """KC-family tags for one attempt's detected misconceptions.

    Each entry looks like {"code": "LO-10", ...}; the tag is the KC prefix.
    Codes that don't map to a known KC (e.g. the generic "GEN") are dropped so
    the panels only show real topics.
    """
    tags: set[str] = set()
    for m in misconceptions or []:
        code = m.get("code") if isinstance(m, dict) else None
        tag = misconception_code_to_tag(code) if code else None
        if tag:
            tags.add(tag)
    return sorted(tags)


async def _problem_titles(db: AsyncSession, task_refs: set[str]) -> dict[str, str]:
    if not task_refs:
        return {}
    rows = await db.execute(select(Problem.key, Problem.title).where(Problem.key.in_(task_refs)))
    return {k: t for k, t in rows}


def _build_block(rows: list[Attempt], titles: dict[str, str]) -> dict:
    """Aggregate one context's attempts into KPIs + per-problem detail + misconceptions."""
    by_problem: dict[str, list[Attempt]] = defaultdict(list)
    for a in rows:
        by_problem[a.task_ref].append(a)

    fam_count: dict[str, int] = defaultdict(int)
    total_attempts = 0
    problems_solved = 0
    problems = []

    for task_ref, prows in by_problem.items():
        prows.sort(key=lambda a: a.timestamp)
        solved = any(a.passed for a in prows)
        total_attempts += len(prows)
        if solved:
            problems_solved += 1

        attempts_out = []
        for a in prows:
            tags = _attempt_tags(a.misconceptions)
            for t in tags:
                fam_count[t] += 1
            attempts_out.append({
                "id": a.id,
                "timestamp": a.timestamp,
                "passed": a.passed,
                "confidence_level": a.confidence_level,
                "misconception_tags": tags,
            })

        problems.append({
            "task_ref": task_ref,
            "title": titles.get(task_ref),
            "attempts_count": len(prows),
            "solved": solved,
            "first_solved_at": next((a.timestamp for a in prows if a.passed), None),
            "attempts": attempts_out,
        })

    # Unsolved-but-tried problems first (they need attention), then by effort.
    problems.sort(key=lambda p: (p["solved"], -p["attempts_count"]))

    problems_attempted = len(by_problem)
    kpis = {
        "problems_attempted": problems_attempted,
        "problems_solved": problems_solved,
        "total_attempts": total_attempts,
        "solve_rate": _rate(problems_solved, problems_attempted),
        "avg_attempts_per_problem": _rate(total_attempts, problems_attempted),
    }
    misconceptions = [
        {"tag": t, "name": misconception_tag_name(t), "count": c}
        for t, c in sorted(fam_count.items(), key=lambda kv: -kv[1])
    ]
    return {"kpis": kpis, "problems": problems, "misconceptions": misconceptions}


async def _student_identity(db: AsyncSession, user_id: uuid.UUID) -> dict:
    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    name = None
    part = (await db.execute(
        select(LmsParticipant)
        .where(LmsParticipant.matched_user_id == user_id, LmsParticipant.role_shortname == "student")
    )).scalars().first()
    if part:
        name = " ".join(x for x in [part.firstname, part.lastname] if x) or None
    return {
        "user_id": str(user_id),
        "username": user.username if user else None,
        "name": name or (user.username if user else None),
    }


async def student_report(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """A student's own native activity, split practice vs practicum."""
    rows = (await db.execute(
        select(Attempt).where(Attempt.user_id == user_id).order_by(Attempt.timestamp)
    )).scalars().all()
    titles = await _problem_titles(db, {a.task_ref for a in rows})
    return {
        "student": await _student_identity(db, user_id),
        "practice": _build_block([a for a in rows if a.context == "practice"], titles),
        "practicum": _build_block([a for a in rows if a.context == "practicum"], titles),
    }


async def student_detail(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """Teacher drill-down for one student: the same blocks + remediation state."""
    base = await student_report(db, user_id)
    rem = (await db.execute(
        select(RemediationSession).where(RemediationSession.user_id == user_id)
    )).scalars().all()
    base["remediation"] = [
        {
            "problem_key": r.problem_key,
            "tags": r.tags or [],
            "completed": r.completed_at is not None,
            "current_index": r.current_index,
        }
        for r in rem
    ]
    return base


async def _roster_names(db: AsyncSession, user_ids: list[uuid.UUID]) -> tuple[dict, dict, set]:
    """Returns (username_map, name_map, matched_set) for a set of local users."""
    if not user_ids:
        return {}, {}, set()
    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()
    username_map = {u.id: u.username for u in users}
    parts = (await db.execute(
        select(LmsParticipant).where(
            LmsParticipant.matched_user_id.in_(user_ids),
            LmsParticipant.role_shortname == "student",
        )
    )).scalars().all()
    name_map: dict = {}
    matched: set = set()
    for p in parts:
        matched.add(p.matched_user_id)
        nm = " ".join(x for x in [p.firstname, p.lastname] if x)
        if nm and p.matched_user_id not in name_map:
            name_map[p.matched_user_id] = nm
    return username_map, name_map, matched


def _empty_teacher_summary(course_id: Optional[int], context: Optional[str]) -> dict:
    return {
        "scope": {"course_id": course_id, "context": context},
        "kpis": {
            "students_active": 0, "students_enrolled": 0, "total_attempts": 0,
            "avg_attempts_per_student": None, "solve_rate": None,
            "remediation_started": 0, "remediation_completed": 0,
        },
        "problems": [], "misconceptions": [], "students": [],
    }


async def teacher_summary(
    db: AsyncSession,
    course_id: Optional[int],
    roster_user_ids: Optional[list[str]],
    context: Optional[str],
    problem_key: Optional[str],
) -> dict:
    """Cohort dashboard over native attempts.

    `roster_user_ids` is the class roster (local user_ids as strings), or None for
    all-access (researcher, no course) — then every student's attempts are in scope.
    """
    # A course was requested but has no matched students → nothing to show.
    if roster_user_ids is not None and not roster_user_ids:
        return _empty_teacher_summary(course_id, context)

    filters = []
    if context in ("practice", "practicum"):
        filters.append(Attempt.context == context)
    if problem_key:
        filters.append(Attempt.task_ref == problem_key)
    roster_uuids: Optional[list[uuid.UUID]] = None
    if roster_user_ids is not None:
        roster_uuids = [uuid.UUID(x) for x in roster_user_ids]
        filters.append(Attempt.user_id.in_(roster_uuids))

    rows = (await db.execute(select(Attempt).where(*filters))).scalars().all()

    titles = await _problem_titles(db, {a.task_ref for a in rows})

    by_user: dict[uuid.UUID, list[Attempt]] = defaultdict(list)
    for a in rows:
        by_user[a.user_id].append(a)

    students_active = len(by_user)
    if roster_uuids is not None:
        students_enrolled = len(roster_uuids)
    else:
        students_enrolled = (await db.execute(
            select(func.count()).select_from(User).where(User.role == "student")
        )).scalar_one()

    pairs_attempted = {(a.user_id, a.task_ref) for a in rows}
    pairs_solved = {(a.user_id, a.task_ref) for a in rows if a.passed}

    # Per-problem cohort stats.
    by_problem: dict[str, list[Attempt]] = defaultdict(list)
    for a in rows:
        by_problem[a.task_ref].append(a)
    problems = []
    for task_ref, prows in by_problem.items():
        pu: dict[uuid.UUID, list[Attempt]] = defaultdict(list)
        for a in prows:
            pu[a.user_id].append(a)
        solved_students = {u for u, us in pu.items() if any(x.passed for x in us)}
        fam: dict[str, int] = defaultdict(int)
        for a in prows:
            for t in _attempt_tags(a.misconceptions):
                fam[t] += 1
        top = max(fam.items(), key=lambda kv: kv[1])[0] if fam else None
        problems.append({
            "task_ref": task_ref,
            "title": titles.get(task_ref),
            "attempts": len(prows),
            "students_attempted": len(pu),
            "students_solved": len(solved_students),
            "solve_rate": _rate(len(solved_students), len(pu)),
            "top_misconception": misconception_tag_name(top) if top else None,
        })
    problems.sort(key=lambda p: (p["solve_rate"] if p["solve_rate"] is not None else 1, -p["attempts"]))

    # Cohort misconception frequency.
    fam_all: dict[str, int] = defaultdict(int)
    for a in rows:
        for t in _attempt_tags(a.misconceptions):
            fam_all[t] += 1
    misconceptions = [
        {"tag": t, "name": misconception_tag_name(t), "count": c}
        for t, c in sorted(fam_all.items(), key=lambda kv: -kv[1])
    ]

    # Remediation completion over the roster (practice-only flow; N/A for labs).
    rem_filters = []
    if roster_uuids is not None:
        rem_filters.append(RemediationSession.user_id.in_(roster_uuids))
    rem_started, rem_completed = (await db.execute(
        select(
            func.count(),
            func.count(RemediationSession.completed_at),
        ).where(*rem_filters)
    )).one()

    kpis = {
        "students_active": students_active,
        "students_enrolled": students_enrolled,
        "total_attempts": len(rows),
        "avg_attempts_per_student": _rate(len(rows), students_active),
        "solve_rate": _rate(len(pairs_solved), len(pairs_attempted)),
        "remediation_started": rem_started,
        "remediation_completed": rem_completed,
    }

    # Roster covers every enrolled student (including those who never attempted).
    roster_ids = roster_uuids if roster_uuids is not None else list(by_user.keys())
    username_map, name_map, matched = await _roster_names(db, roster_ids)
    students = []
    for uid in roster_ids:
        urows = by_user.get(uid, [])
        pmap: dict[str, list[Attempt]] = defaultdict(list)
        for a in urows:
            pmap[a.task_ref].append(a)
        solved = sum(1 for _pk, ps in pmap.items() if any(x.passed for x in ps))
        students.append({
            "user_id": uid,
            "name": name_map.get(uid) or username_map.get(uid),
            "username": username_map.get(uid),
            "matched": uid in matched,
            "attempts": len(urows),
            "problems_solved": solved,
            "solve_rate": _rate(solved, len(pmap)) if pmap else None,
            "last_active": max((a.timestamp for a in urows), default=None),
        })
    students.sort(key=lambda s: (-s["attempts"], -(s["problems_solved"] or 0)))

    return {
        "scope": {"course_id": course_id, "context": context},
        "kpis": kpis,
        "problems": problems,
        "misconceptions": misconceptions,
        "students": students,
    }

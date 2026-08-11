"""Read-side aggregation for the AMT-CS1 native interaction reports.

The in-tutor counterpart to `lms_reports.py`: all numbers come from the
`attempts` table (Homework / Checkpoint submissions) plus
`remediation_sessions`, aggregated at request time. Class scoping reuses the
LMS enrollment roster (see `resolve_course_student_user_ids` in `lms_reports`),
so an AMT-CS1 report is class-aware once an LMS export has been imported.

`attempts.context` splits the two workspaces: "practice" (Homework) vs
"practicum" (Checkpoint). Legacy rows with a NULL context predate this column and are
excluded from both blocks (no backfill, per plan D2).
"""
from collections import defaultdict
from typing import Optional
import uuid

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.kcs import (
    misconception_code_to_tag,
    misconception_tag_name,
    misconception_tag_guidance,
)
from app.models.attempt import Attempt
from app.models.user import User
from app.models.problem import Problem
from app.models.remediation import RemediationSession
from app.models.lms import LmsParticipant
from app.models.target import WeeklyTarget
from app.models.homework_workflow import StudentMPAttempt, StudentHomeworkProgress
from app.models.misconception_question import MisconceptionQuestion


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


# ---------------------------------------------------------------------------
# P5/R3 — misconception profile + study recommendations
# ---------------------------------------------------------------------------

# How many study recommendations to surface (§7-Q4): enough to act on, few
# enough to not read as a verdict.
TOP_RECOMMENDATIONS = 3


def _misconception_profile(mp_rows, ps_rows) -> list[dict]:
    """Fuse MP and PS misconception evidence into one per-tag view (plan D8).

    MP evidence: each wrong `StudentMPAttempt` credits its `triggered_tags`
    (option-level, P5/D2) when recorded; pre-P5 rows fall back to the question's
    tag — except "Tidak Tahu" (D), which is absence of evidence (§7-Q2).
    PS evidence: the AST-detected codes on each attempt, family-deduped per
    attempt (same rule as `_attempt_tags`) so one attempt counts a concept once.

    Specific codes ("VA-01") normalize to their KC family for grouping but are
    kept in `codes` for display. MP/PS counts stay separate so the UI can show
    whether a concept fails in the quiz, in code, or both.
    """
    per_tag: dict[str, dict] = {}

    def _bucket(tag: str) -> dict:
        return per_tag.setdefault(tag, {
            "tag": tag,
            "name": misconception_tag_name(tag),
            "count": 0,
            "mp_count": 0,
            "ps_count": 0,
            "codes": set(),
            "first_seen": None,
            "last_seen": None,
        })

    def _credit(bucket: dict, source: str, code: str | None, ts) -> None:
        bucket["count"] += 1
        bucket[f"{source}_count"] += 1
        if code and code != bucket["tag"]:
            bucket["codes"].add(code)
        if ts is not None:
            if bucket["first_seen"] is None or ts < bucket["first_seen"]:
                bucket["first_seen"] = ts
            if bucket["last_seen"] is None or ts > bucket["last_seen"]:
                bucket["last_seen"] = ts

    # --- MP evidence ---
    for m in mp_rows:
        if m.status == "correct":
            continue
        if m.triggered_tags is not None:
            credited = m.triggered_tags
        elif m.selected_option == "D":
            credited = []  # pre-P5 "Tidak Tahu": same absence-of-evidence rule
        else:
            credited = [m.misconception_tag]
        for code in credited:
            fam = misconception_code_to_tag(str(code))
            if fam:
                _credit(_bucket(fam), "mp", str(code), m.timestamp)

    # --- PS evidence ---
    for a in ps_rows:
        fams_seen: set[str] = set()
        codes_by_fam: dict[str, list[str]] = defaultdict(list)
        for entry in (a.misconceptions or []):
            code = entry.get("code") if isinstance(entry, dict) else None
            fam = misconception_code_to_tag(code) if code else None
            if fam:
                fams_seen.add(fam)
                codes_by_fam[fam].append(code)
        for fam in fams_seen:
            b = _bucket(fam)
            _credit(b, "ps", None, a.timestamp)
            b["codes"].update(codes_by_fam[fam])

    out = []
    for b in per_tag.values():
        b["codes"] = sorted(b["codes"])
        out.append(b)
    out.sort(key=lambda b: (-b["count"], b["tag"]))
    return out


async def _phrase_recommendations(items: list[dict]) -> list[dict]:
    """LLM rephrasing seam (plan D7) — merged DISABLED; pass-through today.

    Contract for the future implementation: the LLM may only rewrite the
    *wording* of `study_focus`. It must never change which tags are
    recommended, their order, their counts, or any other field — ranking stays
    deterministic and auditable. Any exception, timeout, or malformed response
    falls back to the deterministic text (same never-break-the-main-path rule
    as misconception detection).
    """
    if not settings.RECOMMENDATIONS_LLM_ENABLED:
        return items
    # Future phase: hand `items` to get_llm_provider() to reword study_focus
    # only, under the contract above. Until then the flag stays off and the
    # deterministic text ships.
    return items


async def _recommendations(profile: list[dict]) -> list[dict]:
    """Top study recommendations from a misconception profile (plan D7).

    Deterministic: top tags by evidence count mapped to the static guidance in
    core/kcs.py. `evidence` says where the concept fails: quiz (MP), code (PS),
    or both. Empty when there is no evidence — the UI shows a clean empty state.
    """
    items = []
    for p in profile[:TOP_RECOMMENDATIONS]:
        if p["count"] < 1:
            continue
        g = misconception_tag_guidance(p["tag"])
        evidence = "both" if (p["mp_count"] and p["ps_count"]) else ("quiz" if p["mp_count"] else "code")
        items.append({
            "tag": p["tag"],
            "name": g["name"],
            "topic_area": g["topic_area"],
            "count": p["count"],
            "study_focus": g["study_focus"],
            "evidence": evidence,
        })
    return await _phrase_recommendations(items)


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
    # P5/R3: the same overall homework misconception profile the student sees in
    # My History, so teacher and student look at identical numbers. Same filters
    # as student_homework_history: MP attempts on non-lab targets, PS practice
    # attempts carrying a target_id.
    mp_rows = (await db.execute(
        select(StudentMPAttempt).where(StudentMPAttempt.user_id == user_id)
    )).scalars().all()
    lab_tids = set()
    mp_tids = {m.weekly_target_id for m in mp_rows}
    if mp_tids:
        lab_tids = {
            t.id for t in (await db.execute(
                select(WeeklyTarget).where(WeeklyTarget.id.in_(mp_tids), WeeklyTarget.kind == "lab")
            )).scalars().all()
        }
    ps_rows = (await db.execute(
        select(Attempt).where(
            Attempt.user_id == user_id,
            Attempt.target_id.isnot(None),
            Attempt.context == "practice",
        )
    )).scalars().all()
    profile = _misconception_profile(
        [m for m in mp_rows if m.weekly_target_id not in lab_tids], ps_rows
    )
    base["misconception_profile"] = profile
    base["recommendations"] = await _recommendations(profile)
    return base


async def student_homework_history(db: AsyncSession, user_id: uuid.UUID) -> dict:
    """A student's own activity grouped per homework/checkpoint (Week-n), each split
    into a MP section (from student_mp_attempts) and a PS section (from attempts).

    Powers the refined My History tabs. Only attempts carrying a target_id are
    grouped; legacy NULL-target rows are omitted (consistent with the no-backfill rule).
    """
    ps_rows = (await db.execute(
        select(Attempt).where(
            Attempt.user_id == user_id,
            Attempt.target_id.isnot(None),
            Attempt.context.in_(["practice", "practicum"]),
        ).order_by(Attempt.timestamp)
    )).scalars().all()
    titles = await _problem_titles(db, {a.task_ref for a in ps_rows})

    mp_rows = (await db.execute(
        select(StudentMPAttempt).where(StudentMPAttempt.user_id == user_id).order_by(StudentMPAttempt.timestamp)
    )).scalars().all()
    q_map: dict = {}
    q_ids = {m.misconception_question_id for m in mp_rows}
    if q_ids:
        qrows = (await db.execute(
            select(MisconceptionQuestion).where(MisconceptionQuestion.id.in_(q_ids))
        )).scalars().all()
        q_map = {q.id: q for q in qrows}

    prog_rows = (await db.execute(
        select(StudentHomeworkProgress).where(StudentHomeworkProgress.user_id == user_id)
    )).scalars().all()
    prog_by_target = {p.weekly_target_id: p for p in prog_rows}

    target_ids = {a.target_id for a in ps_rows} | {m.weekly_target_id for m in mp_rows}
    targets: dict = {}
    if target_ids:
        trows = (await db.execute(
            select(WeeklyTarget).where(WeeklyTarget.id.in_(target_ids))
        )).scalars().all()
        targets = {t.id: t for t in trows}

    ps_by_target: dict = defaultdict(list)
    for a in ps_rows:
        ps_by_target[a.target_id].append(a)
    mp_by_target: dict = defaultdict(list)
    for m in mp_rows:
        mp_by_target[m.weekly_target_id].append(m)

    entries = []
    for tid, t in targets.items():
        by_problem: dict = defaultdict(list)
        for a in ps_by_target.get(tid, []):
            by_problem[a.task_ref].append(a)
        ps_problems = []
        for task_ref, prows in by_problem.items():
            prows.sort(key=lambda a: a.timestamp)
            solved = any(a.passed for a in prows)
            ps_problems.append({
                "task_ref": task_ref,
                "title": titles.get(task_ref),
                "solved": solved,
                "first_solved_at": next((a.timestamp for a in prows if a.passed), None),
                "attempts": [
                    {
                        "id": a.id,
                        "timestamp": a.timestamp,
                        "passed": a.passed,
                        "misconception_tags": _attempt_tags(a.misconceptions),
                        "pseudocode_explanation": a.pseudocode_explanation,
                    }
                    for a in prows
                ],
            })
        ps_problems.sort(key=lambda p: (p["solved"], p["task_ref"]))

        mp_out = []
        for m in mp_by_target.get(tid, []):
            q = q_map.get(m.misconception_question_id)
            mp_out.append({
                "misconception_tag": m.misconception_tag,
                "question_text_en": q.text_en if q else None,
                "question_text_id": q.text_id if q else None,
                "selected_option": m.selected_option,
                "text_input": m.text_input,
                "status": m.status,
                "timestamp": m.timestamp,
            })
        mp_correct = sum(1 for m in mp_by_target.get(tid, []) if m.status == "correct")

        prog = prog_by_target.get(tid)
        # P5/R3: this week's misconception profile + study recommendations,
        # scoped to the same MP and PS rows listed below it.
        week_profile = _misconception_profile(mp_by_target.get(tid, []), ps_by_target.get(tid, []))
        entries.append({
            "weekly_target_id": str(tid),
            "week": t.week,
            "title": t.title,
            "kind": t.kind,
            "context": "practicum" if t.kind == "lab" else "practice",
            "submitted_at": prog.submitted_at if prog else None,
            "mp": {"attempts": mp_out, "total": len(mp_out), "correct": mp_correct},
            "ps": {
                "problems": ps_problems,
                "attempted": len(by_problem),
                "solved": sum(1 for p in ps_problems if p["solved"]),
            },
            "misconception_profile": week_profile,
            "recommendations": await _recommendations(week_profile),
        })

    entries.sort(key=lambda e: e["week"])

    # P5/R3: overall profile across all homework (practice) entries — the input
    # for the top-of-tab panel and the "what to study next" card.
    practice_tids = [tid for tid, t in targets.items() if t.kind != "lab"]
    overall_profile = _misconception_profile(
        [m for tid in practice_tids for m in mp_by_target.get(tid, [])],
        [a for tid in practice_tids for a in ps_by_target.get(tid, [])],
    )
    return {
        "student": await _student_identity(db, user_id),
        "homeworks": [e for e in entries if e["context"] == "practice"],
        "checkpoints": [e for e in entries if e["context"] == "practicum"],
        "misconception_profile": overall_profile,
        "recommendations": await _recommendations(overall_profile),
    }


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

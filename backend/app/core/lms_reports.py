"""Read-side aggregation queries for the LMS summary dashboards.

Kept separate from `lms_import.py` (write side) and thin routers. All numbers
come from SQL/Python aggregates over the `lms_*` tables at request time.

Two deliberately distinct "correct" metrics, named explicitly so the frontend
never conflates them:
- Teacher/cohort: *student success rate* — distinct students who eventually got a
  slot right / distinct students who attempted it (a per-question difficulty proxy).
- Student/self: *submission counts* — every answer row is one submission, matching
  "how many correct submissions" in the student's own words.
"""

from collections import defaultdict
from typing import Optional

from sqlalchemy import select, func, distinct, case, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.kcs import misconception_code_to_tag, misconception_tag_name
from app.models.lms import (
    LmsCourse,
    LmsQuiz,
    LmsParticipant,
    LmsQuestion,
    LmsAttempt,
    LmsAttemptAnswer,
    LmsResponseStep,
)

CORRECT_STATE = "gradedright"
WRONG_STATE = "gradedwrong"


def _round(v, digits: int = 2):
    return round(v, digits) if v is not None else None


def _rate(num: int, den: int) -> Optional[float]:
    return _round(num / den) if den else None


async def _count_distinct(db: AsyncSession, *cols, where) -> int:
    subq = select(*cols).where(*where).distinct().subquery()
    return (await db.execute(select(func.count()).select_from(subq))).scalar_one()


def _quiz_scope(course_id: Optional[int], quiz_id: Optional[int]):
    conds = []
    if quiz_id is not None:
        conds.append(LmsQuiz.quiz_id == quiz_id)
    if course_id is not None:
        conds.append(LmsQuiz.course_id == course_id)
    return conds


async def _misconception_freq(
    db: AsyncSession, quiz_ids: list[int], student_ids: Optional[list[int]] = None
) -> list[dict]:
    """Frequency of misconception KC families over wrong answers.

    Empty until QUESTION_BANK carries the tag column. Joins on slot, which is the
    open item for random slots — refine once the real data is inspected.
    """
    rows = await db.execute(
        select(LmsQuestion.quiz_id, LmsQuestion.slot_number, LmsQuestion.misconception_tags)
        .where(LmsQuestion.quiz_id.in_(quiz_ids), LmsQuestion.misconception_tags.isnot(None))
    )
    tagmap = {(r.quiz_id, r.slot_number): r.misconception_tags for r in rows}
    if not tagmap:
        return []

    wrong_where = [
        LmsAttemptAnswer.quiz_id.in_(quiz_ids),
        LmsAttemptAnswer.question_state == WRONG_STATE,
    ]
    if student_ids is not None:
        wrong_where.append(LmsAttemptAnswer.lms_user_id.in_(student_ids))
    wrong = await db.execute(
        select(LmsAttemptAnswer.quiz_id, LmsAttemptAnswer.slot_number, func.count().label("c"))
        .where(*wrong_where)
        .group_by(LmsAttemptAnswer.quiz_id, LmsAttemptAnswer.slot_number)
    )
    fam: dict[str, int] = defaultdict(int)
    for r in wrong:
        for code in tagmap.get((r.quiz_id, r.slot_number)) or []:
            tag = misconception_code_to_tag(code) or str(code).split("-", 1)[0].strip().upper()
            fam[tag] += r.c
    return [
        {"tag": t, "name": misconception_tag_name(t), "wrong_count": c}
        for t, c in sorted(fam.items(), key=lambda kv: -kv[1])
    ]


async def teacher_summary(
    db: AsyncSession,
    course_id: Optional[int],
    quiz_id: Optional[int],
    allowed_course_ids: Optional[list[int]] = None,
) -> dict:
    scope = _quiz_scope(course_id, quiz_id)
    # When no specific course is chosen, restrict to the teacher's own courses
    # (UC4). `allowed_course_ids is None` means all-access (researcher).
    if course_id is None and allowed_course_ids is not None:
        scope.append(LmsQuiz.course_id.in_(allowed_course_ids))
    quizzes = (await db.execute(select(LmsQuiz).where(*scope).order_by(LmsQuiz.quiz_id))).scalars().all()
    quiz_ids = [q.quiz_id for q in quizzes]

    empty = {
        "scope": {"course_id": course_id, "quiz_id": quiz_id},
        "kpis": {
            "students_attempted": 0, "students_enrolled": 0, "total_attempts": 0,
            "avg_attempts_per_student": None, "avg_best_grade": None, "correct_rate": None,
        },
        "quizzes": [], "per_question": [], "misconceptions": [], "students": [],
    }
    if not quiz_ids:
        return empty

    course_ids = list({q.course_id for q in quizzes})

    # Cohort = student-role participants only. Teachers also make (test) attempts;
    # counting them would push students_attempted above students_enrolled.
    student_participants = (await db.execute(
        select(LmsParticipant).where(
            LmsParticipant.course_id.in_(course_ids),
            LmsParticipant.role_shortname == "student",
        )
    )).scalars().all()
    names = {p.lms_user_id: p for p in student_participants}
    student_ids = list(names.keys())
    students_enrolled = len(student_ids)
    if not student_ids:
        return empty

    att_filter = [LmsAttempt.quiz_id.in_(quiz_ids), LmsAttempt.lms_user_id.in_(student_ids)]
    ans_filter = [LmsAttemptAnswer.quiz_id.in_(quiz_ids), LmsAttemptAnswer.lms_user_id.in_(student_ids)]

    students_attempted, total_attempts = (await db.execute(
        select(func.count(distinct(LmsAttempt.lms_user_id)), func.count()).where(*att_filter)
    )).one()

    best_subq = (
        select(func.max(LmsAttempt.total_grade).label("bg"))
        .where(*att_filter)
        .group_by(LmsAttempt.quiz_id, LmsAttempt.lms_user_id)
        .subquery()
    )
    avg_best_grade = (await db.execute(select(func.avg(best_subq.c.bg)))).scalar_one()

    attempted_slots = await _count_distinct(
        db, LmsAttemptAnswer.quiz_id, LmsAttemptAnswer.lms_user_id, LmsAttemptAnswer.slot_number,
        where=ans_filter,
    )
    correct_slots = await _count_distinct(
        db, LmsAttemptAnswer.quiz_id, LmsAttemptAnswer.lms_user_id, LmsAttemptAnswer.slot_number,
        where=ans_filter + [LmsAttemptAnswer.question_state == CORRECT_STATE],
    )

    kpis = {
        "students_attempted": students_attempted,
        "students_enrolled": students_enrolled,
        "total_attempts": total_attempts,
        "avg_attempts_per_student": _rate(total_attempts, students_attempted),
        "avg_best_grade": _round(avg_best_grade),
        "correct_rate": _rate(correct_slots, attempted_slots),
    }

    # Per-quiz overview: average of each student's best grade, per quiz.
    per_student_best = (
        select(
            LmsAttempt.quiz_id.label("quiz_id"),
            func.max(LmsAttempt.total_grade).label("bg"),
        )
        .where(*att_filter)
        .group_by(LmsAttempt.quiz_id, LmsAttempt.lms_user_id)
        .subquery()
    )
    best_by_quiz = dict((await db.execute(
        select(per_student_best.c.quiz_id, func.avg(per_student_best.c.bg))
        .group_by(per_student_best.c.quiz_id)
    )).all())

    attempted_by_quiz = dict((await db.execute(
        select(LmsAttempt.quiz_id, func.count(distinct(LmsAttempt.lms_user_id)))
        .where(*att_filter).group_by(LmsAttempt.quiz_id)
    )).all())

    quiz_overview = [
        {
            "quiz_id": q.quiz_id, "name": q.name, "total_questions": q.total_questions,
            "students_attempted": attempted_by_quiz.get(q.quiz_id, 0),
            "avg_best_grade": _round(best_by_quiz.get(q.quiz_id)),
        }
        for q in quizzes
    ]

    # Per-question (only meaningful for a single quiz in scope)
    per_question = []
    if quiz_id is not None:
        rows = await db.execute(
            select(
                LmsAttemptAnswer.slot_number,
                func.count(distinct(LmsAttemptAnswer.lms_user_id)).label("attempted"),
                func.count(distinct(case(
                    (LmsAttemptAnswer.question_state == CORRECT_STATE, LmsAttemptAnswer.lms_user_id)
                ))).label("correct"),
                LmsQuestion.name.label("qname"),
                LmsQuestion.misconception_tags.label("tags"),
            )
            .outerjoin(LmsQuestion, (LmsQuestion.quiz_id == LmsAttemptAnswer.quiz_id)
                       & (LmsQuestion.slot_number == LmsAttemptAnswer.slot_number))
            .where(*ans_filter)
            .group_by(LmsAttemptAnswer.slot_number, LmsQuestion.name, LmsQuestion.misconception_tags)
            .order_by(LmsAttemptAnswer.slot_number)
        )
        for r in rows:
            per_question.append({
                "slot_number": r.slot_number,
                "question_name": r.qname,
                "students_attempted": r.attempted,
                "students_correct": r.correct,
                "correct_rate": _rate(r.correct, r.attempted),
                "misconception_tags": r.tags,
            })

    # Student roster (students only)
    roster_att = {
        r.lms_user_id: (r.attempts, _round(r.best))
        for r in await db.execute(
            select(
                LmsAttempt.lms_user_id,
                func.count().label("attempts"),
                func.max(LmsAttempt.total_grade).label("best"),
            ).where(*att_filter).group_by(LmsAttempt.lms_user_id)
        )
    }
    roster_sub = {
        r.lms_user_id: (r.correct, r.total)
        for r in await db.execute(
            select(
                LmsAttemptAnswer.lms_user_id,
                func.count(case((LmsAttemptAnswer.question_state == CORRECT_STATE, 1))).label("correct"),
                func.count().label("total"),
            ).where(*ans_filter).group_by(LmsAttemptAnswer.lms_user_id)
        )
    }

    # Roster covers every enrolled student, including those who never attempted.
    students = []
    for uid in student_ids:
        p = names.get(uid)
        attempts, best = roster_att.get(uid, (0, None))
        correct, total = roster_sub.get(uid, (0, 0))
        students.append({
            "lms_user_id": uid,
            "name": _full_name(p),
            "username": p.username if p else None,
            "matched": bool(p and p.matched_user_id),
            "attempts": attempts,
            "best_grade": best,
            "correct_rate": _rate(correct, total),
        })
    students.sort(key=lambda s: (-s["attempts"], -(s["best_grade"] or 0)))

    return {
        "scope": {"course_id": course_id, "quiz_id": quiz_id},
        "kpis": kpis,
        "quizzes": quiz_overview,
        "per_question": per_question,
        "misconceptions": await _misconception_freq(db, quiz_ids, student_ids),
        "students": students,
    }


def _full_name(p) -> Optional[str]:
    if not p:
        return None
    parts = [p.firstname, p.lastname]
    name = " ".join(x for x in parts if x)
    return name or p.username


async def student_report(db: AsyncSession, lms_user_ids: list[int], course_id: Optional[int] = None) -> dict:
    """Per-student detail, shared by the teacher drill-down and the student self view.

    Loads the student's own rows (small) and aggregates in Python.
    """
    scope = []
    if course_id is not None:
        scope.append(LmsQuiz.course_id == course_id)

    # Which quizzes this student has touched (scoped), with metadata.
    quizzes = (await db.execute(
        select(LmsQuiz)
        .join(LmsAttempt, LmsAttempt.quiz_id == LmsQuiz.quiz_id)
        .where(LmsAttempt.lms_user_id.in_(lms_user_ids), *scope)
        .distinct()
        .order_by(LmsQuiz.quiz_id)
    )).scalars().all()
    quiz_ids = [q.quiz_id for q in quizzes]
    quiz_meta = {q.quiz_id: q for q in quizzes}

    participant = (await db.execute(
        select(LmsParticipant)
        .where(LmsParticipant.lms_user_id.in_(lms_user_ids))
        .order_by(LmsParticipant.role_shortname)
    )).scalars().first()

    student = {
        "lms_user_id": lms_user_ids[0] if lms_user_ids else None,
        "name": _full_name(participant),
        "username": participant.username if participant else None,
        "email": participant.email if participant else None,
    }

    empty_kpis = {
        "quizzes_attempted": 0, "total_attempts": 0, "avg_attempts_per_quiz": None,
        "correct_submissions": 0, "total_submissions": 0, "correct_rate": None,
    }
    if not quiz_ids:
        return {"student": student, "kpis": empty_kpis, "quizzes": [], "misconceptions": []}

    attempts = (await db.execute(
        select(LmsAttempt).where(
            LmsAttempt.lms_user_id.in_(lms_user_ids), LmsAttempt.quiz_id.in_(quiz_ids)
        )
    )).scalars().all()
    answers = (await db.execute(
        select(LmsAttemptAnswer).where(
            LmsAttemptAnswer.lms_user_id.in_(lms_user_ids), LmsAttemptAnswer.quiz_id.in_(quiz_ids)
        )
    )).scalars().all()
    questions = {
        (q.quiz_id, q.slot_number): q
        for q in (await db.execute(
            select(LmsQuestion).where(LmsQuestion.quiz_id.in_(quiz_ids))
        )).scalars().all()
    }

    attempts_per_quiz: dict[int, int] = defaultdict(int)
    for a in attempts:
        attempts_per_quiz[a.quiz_id] += 1

    # Group answers by quiz, then slot.
    by_quiz_slot: dict[int, dict[int, list]] = defaultdict(lambda: defaultdict(list))
    for ans in answers:
        by_quiz_slot[ans.quiz_id][ans.slot_number].append(ans)

    fam_wrong: dict[str, int] = defaultdict(int)
    fam_refs: dict[str, list] = defaultdict(list)
    total_correct = total_subs = 0

    quiz_details = []
    for qid in quiz_ids:
        meta = quiz_meta[qid]
        grades = [a.total_grade for a in attempts if a.quiz_id == qid and a.total_grade is not None]
        last_grade = next(
            (a.total_grade for a in sorted(
                (a for a in attempts if a.quiz_id == qid),
                key=lambda a: a.attempt_number, reverse=True)),
            None,
        )
        q_correct = q_total = 0
        question_rows = []
        for slot, slot_answers in sorted(by_quiz_slot[qid].items()):
            q_total += len(slot_answers)
            q_correct += sum(1 for a in slot_answers if a.question_state == CORRECT_STATE)
            final = max(slot_answers, key=lambda a: a.attempt_number)
            qmeta = questions.get((qid, slot))
            tags = qmeta.misconception_tags if qmeta else None
            question_rows.append({
                "slot_number": slot,
                "question_name": qmeta.name if qmeta else None,
                "question_text": qmeta.text if qmeta else None,
                "question_type": qmeta.type if qmeta else None,
                "attempts": len({a.attempt_number for a in slot_answers}),
                "final_state": final.question_state,
                "final_grade": _round(final.question_grade),
                "student_answer": final.student_answer,
                "right_answer": final.right_answer,
                "misconception_tags": tags,
            })
            # Misconception evidence: wrong final answer on a tagged question.
            if final.question_state == WRONG_STATE and tags:
                for code in tags:
                    fam = misconception_code_to_tag(code) or str(code).split("-", 1)[0].strip().upper()
                    fam_wrong[fam] += 1
                    fam_refs[fam].append({"quiz_id": qid, "slot_number": slot})

        total_correct += q_correct
        total_subs += q_total
        quiz_details.append({
            "quiz_id": qid,
            "name": meta.name,
            "attempts_used": attempts_per_quiz[qid],
            "best_grade": _round(max(grades)) if grades else None,
            "last_grade": _round(last_grade),
            "max_grade": _round(meta.max_grade),
            "correct_submissions": q_correct,
            "total_submissions": q_total,
            "questions": question_rows,
        })

    kpis = {
        "quizzes_attempted": len(quiz_ids),
        "total_attempts": len(attempts),
        "avg_attempts_per_quiz": _rate(len(attempts), len(quiz_ids)),
        "correct_submissions": total_correct,
        "total_submissions": total_subs,
        "correct_rate": _rate(total_correct, total_subs),
    }
    misconceptions = [
        {"tag": t, "name": misconception_tag_name(t), "wrong_count": c, "occurrences": fam_refs[t]}
        for t, c in sorted(fam_wrong.items(), key=lambda kv: -kv[1])
    ]

    return {"student": student, "kpis": kpis, "quizzes": quiz_details, "misconceptions": misconceptions}


async def step_timeline(
    db: AsyncSession,
    lms_user_id: int,
    quiz_id: int,
    attempt_number: int,
    slot_number: Optional[int] = None,
) -> dict:
    where = [
        LmsResponseStep.lms_user_id == lms_user_id,
        LmsResponseStep.quiz_id == quiz_id,
        LmsResponseStep.attempt_number == attempt_number,
    ]
    if slot_number is not None:
        where.append(LmsResponseStep.slot_number == slot_number)
    rows = (await db.execute(
        select(LmsResponseStep)
        .where(*where)
        .order_by(LmsResponseStep.slot_number, LmsResponseStep.step)
    )).scalars().all()
    return {
        "quiz_id": quiz_id,
        "lms_user_id": lms_user_id,
        "attempt_number": attempt_number,
        "steps": [
            {
                "slot_number": s.slot_number,
                "step": s.step,
                "time": s.time,
                "action": s.action,
                "state": s.state,
                "marks": _round(s.marks),
                "coderunner_output": s.coderunner_output,
            }
            for s in rows
        ],
    }


async def question_slot_detail(db: AsyncSession, quiz_id: int, slot_number: int) -> Optional[dict]:
    """Question metadata for one quiz slot (teacher timeline detail, UC5)."""
    q = (await db.execute(
        select(LmsQuestion).where(
            LmsQuestion.quiz_id == quiz_id,
            LmsQuestion.slot_number == slot_number,
        )
    )).scalars().first()
    if not q:
        return None
    return {
        "quiz_id": q.quiz_id,
        "slot_number": q.slot_number,
        "question_id": q.question_id,
        "name": q.name,
        "type": q.type,
        "text": q.text,
        "misconception_tags": q.misconception_tags,
    }


async def resolve_matched_lms_user_ids(db: AsyncSession, user_id) -> list[int]:
    rows = await db.execute(
        select(distinct(LmsParticipant.lms_user_id))
        .where(LmsParticipant.matched_user_id == user_id)
    )
    return [r[0] for r in rows]


# ---- Class (course) scoping, shared by the LMS and AMT-CS1 report families ----

# A participant "teaches" a class (UC4/Q3) when their role_shortname is
# `editingteacher` OR their human-readable role_name mentions "teacher"
# (covers Moodle's non-editing "teacher" too).
def _teacher_role_predicate():
    return or_(
        LmsParticipant.role_shortname == "editingteacher",
        LmsParticipant.role_name.ilike("%teacher%"),
    )


async def resolve_teacher_course_ids(db: AsyncSession, user_id) -> list[int]:
    """LMS course_ids a local teacher account is enrolled to teach.

    Empty list means the teacher isn't matched to any imported course yet — the
    caller should then scope to nothing (no data), not to everything.
    """
    rows = await db.execute(
        select(distinct(LmsParticipant.course_id)).where(
            LmsParticipant.matched_user_id == user_id,
            _teacher_role_predicate(),
        )
    )
    return [r[0] for r in rows]


async def resolve_course_student_user_ids(
    db: AsyncSession, course_ids: Optional[list[int]]
) -> Optional[list[str]]:
    """Local user_ids of the students enrolled in the given LMS courses.

    Returns None when `course_ids` is None (all-access, no course filter). An
    empty list means the courses have no matched students yet.
    """
    if course_ids is None:
        return None
    rows = await db.execute(
        select(distinct(LmsParticipant.matched_user_id)).where(
            LmsParticipant.course_id.in_(course_ids),
            LmsParticipant.role_shortname == "student",
            LmsParticipant.matched_user_id.isnot(None),
        )
    )
    return [str(r[0]) for r in rows]


async def list_teacher_courses(db: AsyncSession, user_id, all_access: bool) -> list[dict]:
    """Courses for the class selector, scoped to the caller (UC3).

    `all_access=True` (researcher) lists every imported course; otherwise only
    the teacher's own courses.
    """
    course_filter: Optional[list[int]] = None
    if not all_access:
        course_filter = await resolve_teacher_course_ids(db, user_id)
        if not course_filter:
            return []

    q = select(LmsCourse)
    if course_filter is not None:
        q = q.where(LmsCourse.course_id.in_(course_filter))
    courses = (await db.execute(q.order_by(LmsCourse.course_id))).scalars().all()

    counts = dict((await db.execute(
        select(LmsParticipant.course_id, func.count(distinct(LmsParticipant.lms_user_id)))
        .where(LmsParticipant.role_shortname == "student")
        .group_by(LmsParticipant.course_id)
    )).all())

    return [
        {
            "course_id": c.course_id,
            "shortname": c.shortname,
            "fullname": c.fullname,
            "fakultas": c.fakultas,
            "prodi": c.prodi,
            "tahun_ajar": c.tahun_ajar,
            "student_count": counts.get(c.course_id, 0),
        }
        for c in courses
    ]

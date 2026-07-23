"""Exercises app.core.lms_import against a real Moodle export.

Run inside the backend container (pytest is not installed there, so a plain
script entrypoint is provided):

    docker cp misc/Moodle_Quiz_Report_20260717_150343.xlsx amt-backend:/tmp/sample.xlsx
    docker exec amt-backend python test/test_lms_import.py

Set LMS_SAMPLE_PATH to point at a different export file.
"""

import asyncio
import os
import sys

from sqlalchemy import select, func

SAMPLE_PATH = os.environ.get("LMS_SAMPLE_PATH", "/tmp/sample.xlsx")


def _parse():
    from app.core.lms_import import parse_workbook

    return parse_workbook(SAMPLE_PATH)


def test_parse_sample():
    parsed = _parse()
    counts = parsed.row_counts()

    assert counts["courses"] >= 1
    assert counts["participants"] > 0
    assert counts["quizzes"] > 0
    assert counts["questions"] > 0
    assert counts["attempts"] > 0
    assert counts["attempt_answers"] > 0
    assert counts["response_steps"] > 0

    # Every answer/step must reference a parsed attempt, every attempt a parsed quiz,
    # every quiz a parsed course — otherwise the upsert would violate FKs.
    for key in parsed.attempt_answers:
        assert key[:3] in parsed.attempts
    for key in parsed.response_steps:
        assert key[:3] in parsed.attempts
    for attempt in parsed.attempts.values():
        assert attempt["quiz_id"] in parsed.quizzes
    for quiz in parsed.quizzes.values():
        assert quiz["course_id"] in parsed.courses

    # Coercions: IDs are ints, datetimes tz-aware, epoch sentinel became None.
    course = next(iter(parsed.courses.values()))
    assert isinstance(course["course_id"], int)
    for attempt in parsed.attempts.values():
        if attempt["start_time"] is not None:
            assert attempt["start_time"].tzinfo is not None
            assert attempt["start_time"].year > 1970

    return counts


async def _db_counts():
    from app.core.database import async_session_maker
    from app.models.lms import (
        LmsCourse, LmsParticipant, LmsQuiz, LmsQuestion,
        LmsAttempt, LmsAttemptAnswer, LmsResponseStep,
    )

    models = {
        "courses": LmsCourse, "participants": LmsParticipant, "quizzes": LmsQuiz,
        "questions": LmsQuestion, "attempts": LmsAttempt,
        "attempt_answers": LmsAttemptAnswer, "response_steps": LmsResponseStep,
    }
    async with async_session_maker() as db:
        out = {}
        for name, model in models.items():
            result = await db.execute(select(func.count()).select_from(model))
            out[name] = result.scalar_one()
        return out


async def _run_upsert(parsed):
    from app.core.database import async_session_maker
    from app.core.lms_import import upsert_lms_data

    async with async_session_maker() as db:
        return await upsert_lms_data(db, parsed)


async def main():
    print(f"Parsing {SAMPLE_PATH} ...")
    counts = test_parse_sample()
    print("PARSE OK:", counts)

    parsed = _parse()
    result1 = await _run_upsert(parsed)
    print("UPSERT #1:", result1)

    db_counts = await _db_counts()
    assert db_counts == counts, f"DB counts {db_counts} != parsed counts {counts}"
    print("DB COUNTS MATCH:", db_counts)

    # Idempotency: importing the same file again must not add or duplicate rows.
    result2 = await _run_upsert(_parse())
    db_counts2 = await _db_counts()
    assert db_counts2 == counts, f"re-import changed counts: {db_counts2}"
    print("IDEMPOTENT RE-IMPORT OK, unmatched students:", result2["unmatched_students"])

    print("ALL CHECKS PASSED")


if __name__ == "__main__":
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    asyncio.run(main())

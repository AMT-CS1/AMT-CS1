"""Link a local instructor account to the imported LMS classes it teaches.

Companion to `seed_lms_demo.py` (which links the demo *student*). The instructor
dashboard is course-scoped (UC4): an `instructor` only sees classes where their
local account is matched as a teacher participant. Matching normally happens at
import time when `users.username` equals the teacher's Moodle username or email
(`_match_participants` in app/core/lms_import.py) — but a mock/real export whose
teacher identity differs from the demo login leaves every class unscoped, so the
dashboard looks empty even though the import succeeded.

This script re-points the teacher participant rows at the given local account so
the scoped dashboard lights up, without re-importing.

Run inside the backend container after importing an export:

    docker exec amt-backend python scripts/seed_lms_teacher.py
    docker exec amt-backend python scripts/seed_lms_teacher.py --username instructor_user

Idempotent: re-running just re-applies the same link.
"""

import argparse
import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy import select, update, or_  # noqa: E402
from app.core.database import async_session_maker  # noqa: E402
from app.models import User  # noqa: E402
from app.models.lms import LmsParticipant  # noqa: E402


def _teacher_predicate():
    # Mirrors resolve_teacher_course_ids: editingteacher OR a role_name mentioning "teacher".
    return or_(
        LmsParticipant.role_shortname == "editingteacher",
        LmsParticipant.role_name.ilike("%teacher%"),
    )


async def main(username: str):
    async with async_session_maker() as db:
        user = (await db.execute(
            select(User).where(User.username == username)
        )).scalar_one_or_none()
        if user is None:
            print(f"No local user with username '{username}'. "
                  f"Seed one first (scripts/seed_demo.py) or pass --username.")
            return
        if user.role not in ("instructor", "researcher"):
            print(f"Warning: user '{username}' has role '{user.role}', not instructor/researcher. "
                  f"They still won't reach the teacher dashboard.")

        # Which courses are we about to link them to teach?
        courses = (await db.execute(
            select(LmsParticipant.course_id)
            .where(_teacher_predicate())
            .distinct()
        )).scalars().all()

        result = await db.execute(
            update(LmsParticipant)
            .where(_teacher_predicate())
            .values(matched_user_id=user.id)
        )
        await db.commit()

        print("=" * 60)
        print("Instructor linked to imported class(es)")
        print("=" * 60)
        print(f"  username     : {username}  (local user {user.id})")
        print(f"  teacher rows : {result.rowcount} updated")
        print(f"  courses      : {sorted(courses) or '(none — import an export first)'}")
        print()
        print("  Log in and open 'LMS Reports' — the dashboard is now scoped to these classes.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--username", default="instructor_user",
                        help="Local account to link as teacher (default: instructor_user)")
    args = parser.parse_args()
    asyncio.run(main(args.username))

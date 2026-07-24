"""Seed a demo login that can see the LMS summary dashboards.

The instructor dashboard is course-scoped (UC4): `instructor_user` only sees a
class once it's matched as a teacher of that class — run `seed_lms_teacher.py`
(or import a mock export, which now emits `instructor_user` as the teacher).
The *student* "My History" view only lights up for a local account that is linked
(via matched_user_id) to an imported LMS participant. The real Telkom students have
no local accounts, so this script provisions one demo student and links it to the
LMS student with the most attempts (the richest history to click through).

Run inside the backend container after importing an export:

    docker exec amt-backend python scripts/seed_lms_demo.py

Idempotent: re-running reuses the demo user and re-points the link.
"""

import asyncio
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from sqlalchemy import select, func, update  # noqa: E402
from app.core.database import async_session_maker  # noqa: E402
from app.core.security import get_password_hash  # noqa: E402
from app.models import User  # noqa: E402
from app.models.lms import LmsParticipant, LmsAttempt  # noqa: E402

DEMO_USERNAME = "lms_demo_student"
DEMO_PASSWORD = "demopass"


async def main():
    async with async_session_maker() as db:
        # Richest student = student-role participant with the most attempts.
        row = (await db.execute(
            select(
                LmsParticipant.lms_user_id,
                LmsParticipant.firstname,
                LmsParticipant.lastname,
                func.count(LmsAttempt.attempt_number).label("attempts"),
            )
            .join(LmsAttempt, LmsAttempt.lms_user_id == LmsParticipant.lms_user_id)
            .where(LmsParticipant.role_shortname == "student")
            .group_by(LmsParticipant.lms_user_id, LmsParticipant.firstname, LmsParticipant.lastname)
            .order_by(func.count(LmsAttempt.attempt_number).desc())
        )).first()

        if row is None:
            print("No LMS student attempts found. Import an export first "
                  "(POST /lms/imports or the instructor 'LMS Reports' page).")
            return

        lms_user_id, firstname, lastname, attempts = row
        full_name = " ".join(x for x in (firstname, lastname) if x) or str(lms_user_id)

        # Create-or-reuse the demo student account.
        user = (await db.execute(
            select(User).where(User.username == DEMO_USERNAME)
        )).scalar_one_or_none()
        if user is None:
            user = User(
                username=DEMO_USERNAME,
                hashed_password=get_password_hash(DEMO_PASSWORD),
                role="student",
                consent_status=True,
            )
            db.add(user)
            await db.flush()
            created = True
        else:
            created = False

        # Point every participant row for that LMS student at the demo account.
        await db.execute(
            update(LmsParticipant)
            .where(LmsParticipant.lms_user_id == lms_user_id)
            .values(matched_user_id=user.id)
        )
        await db.commit()

        print("=" * 60)
        print("Demo student account ready")
        print("=" * 60)
        print(f"  username : {DEMO_USERNAME}")
        print(f"  password : {DEMO_PASSWORD}")
        print(f"  {'created' if created else 'reused existing'} local user {user.id}")
        print(f"  linked to LMS student: {full_name} "
              f"(lms_user_id={lms_user_id}, {attempts} attempts)")
        print()
        print("  Log in and open 'My History' to see this student's LMS activity.")
        print("  Teacher view: instructor_user / instructorpass -> 'LMS Reports'.")


if __name__ == "__main__":
    asyncio.run(main())

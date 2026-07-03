"""
Seeds dummy Lab/Practicum sessions for testing.

Creates three labs in the demo course, with time windows relative to NOW so
every state is testable immediately:
  - Week 90: ACTIVE   (started 10 min ago, ends in 90 min)  password: lab123
  - Week 91: UPCOMING (starts in 30 min, 100-minute window)  password: lab456
  - Week 92: ENDED    (ended over an hour ago)               password: lab789

Re-running the script refreshes the time windows, so you can reuse it whenever
you need the three states again.

Usage (from backend/):
    .venv/Scripts/python.exe scripts/seed_lab_demo.py
"""
import sys
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from sqlalchemy import select

# Add backend directory to sys.path so we can import app modules
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.core.config import settings
from app.models import WeeklyTarget
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

COURSE_REF = "CS1-PYTHON-2026"
LAB_DURATION = timedelta(minutes=100)


def labs_to_seed():
    # Stored naive UTC, matching how the targets router persists datetimes
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return [
        {
            "week": 90,
            "title": "Lab 1: Loops & Variables (ACTIVE)",
            "topic_kc_focus": "LO, VA",
            "target_task": (
                "In-class practicum on loops and variables.\n\n"
                "Solve the three given problems before the session ends. "
                "Your grade is computed automatically at the deadline."
            ),
            "starts_at": now - timedelta(minutes=10),
            "deadline": now - timedelta(minutes=10) + LAB_DURATION,
            "access_password": "lab123",
        },
        {
            "week": 91,
            "title": "Lab 2: Conditionals & Expressions (UPCOMING)",
            "topic_kc_focus": "CD, EX",
            "target_task": (
                "In-class practicum on conditionals and expressions.\n\n"
                "The session unlocks at the start time shown on the card. "
                "Bring the password shared by your instructor in class."
            ),
            "starts_at": now + timedelta(minutes=30),
            "deadline": now + timedelta(minutes=30) + LAB_DURATION,
            "access_password": "lab456",
        },
        {
            "week": 92,
            "title": "Lab 3: Operators & I/O (ENDED)",
            "topic_kc_focus": "OP, CO, IO",
            "target_task": (
                "In-class practicum on operators, constants, and input/output.\n\n"
                "This session has ended; the automated grade is shown instead."
            ),
            "starts_at": now - timedelta(hours=3),
            "deadline": now - timedelta(hours=3) + LAB_DURATION,
            "access_password": "lab789",
        },
    ]


async def seed_labs():
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        for lab in labs_to_seed():
            stmt = select(WeeklyTarget).where(
                WeeklyTarget.course_ref == COURSE_REF,
                WeeklyTarget.week == lab["week"],
                WeeklyTarget.kind == "lab",
            )
            result = await session.execute(stmt)
            existing = result.scalar_one_or_none()

            if existing:
                existing.title = lab["title"]
                existing.topic_kc_focus = lab["topic_kc_focus"]
                existing.target_task = lab["target_task"]
                existing.description = lab["target_task"]
                existing.starts_at = lab["starts_at"]
                existing.deadline = lab["deadline"]
                existing.access_password = lab["access_password"]
                print(f"Updated lab (week {lab['week']}): {lab['title']}")
            else:
                session.add(WeeklyTarget(
                    id=uuid.uuid4(),
                    course_ref=COURSE_REF,
                    week=lab["week"],
                    topic_kc_focus=lab["topic_kc_focus"],
                    target_task=lab["target_task"],
                    source="seed",
                    title=lab["title"],
                    description=lab["target_task"],
                    deadline=lab["deadline"],
                    randomize_problems=False,
                    kind="lab",
                    starts_at=lab["starts_at"],
                    access_password=lab["access_password"],
                ))
                print(f"Seeded lab (week {lab['week']}): {lab['title']}")

        await session.commit()

    await engine.dispose()
    print("\nLab passwords -> active: lab123 | upcoming: lab456 | ended: lab789")
    print("Open /student/lab as a student to see all three states.")


if __name__ == "__main__":
    asyncio.run(seed_labs())

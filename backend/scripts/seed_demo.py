import os
import sys
import argparse
import asyncio
import uuid
from pathlib import Path
from sqlalchemy import select, delete

# Add backend directory to sys.path so we can import app modules
backend_dir = Path(__file__).resolve().parent.parent
sys.path.append(str(backend_dir))

from app.core.config import settings
from app.core.security import get_password_hash
from app.core.kcs import K_COMPONENTS
from app.models import Base, User, WeeklyTarget
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

# Align connection URL to asyncpg
db_url = settings.DATABASE_URL
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

async def seed_demo(reset: bool = False):
    engine = create_async_engine(db_url, echo=True)
    async_session = async_sessionmaker(engine, expire_on_commit=False)

    async with async_session() as session:
        print(f"Starting demo database seeding (reset={reset})...")

        if reset:
            print("Reset flag provided. Cleaning up existing demo data...")
            # Delete weekly targets for the demo course
            await session.execute(
                delete(WeeklyTarget).where(WeeklyTarget.course_ref == "CS1-PYTHON-2026")
            )
            # Delete demo student users
            demo_usernames = ["demo_student_1", "demo_student_2", "demo_student_3"]
            await session.execute(
                delete(User).where(User.username.in_(demo_usernames))
            )
            await session.commit()
            print("Cleanup completed.")

        # 1. Seed Demo Students
        demo_students = [
            {
                "username": "demo_student_1",
                "email": "student1@demo.com",
                "password": "demostudentpass",
                "role": "student",
                "consent_status": True
            },
            {
                "username": "demo_student_2",
                "email": "student2@demo.com",
                "password": "demostudentpass",
                "role": "student",
                "consent_status": True
            },
            {
                "username": "demo_student_3",
                "email": "student3@demo.com",
                "password": "demostudentpass",
                "role": "student",
                "consent_status": True
            }
        ]

        for student_data in demo_students:
            # Check if user already exists
            stmt = select(User).where(User.username == student_data["username"])
            result = await session.execute(stmt)
            existing_user = result.scalar_one_or_none()

            if not existing_user:
                db_user = User(
                    id=uuid.uuid4(),
                    username=student_data["username"],
                    hashed_password=get_password_hash(student_data["password"]),
                    role=student_data["role"],
                    consent_status=student_data["consent_status"]
                )
                session.add(db_user)
                print(f"Seeded student: {student_data['username']}")
            else:
                print(f"Student already exists: {student_data['username']}")

        # 2. Seed WeeklyTargets tied to the demo course
        targets_to_seed = [
            {
                "week": 1,
                "topic_kc_focus": "Variables",
                "target_task": (
                    "Write a program that swaps the values of two variables, x and y.\n\n"
                    "Instructions:\n"
                    "1. Read x and y from standard input.\n"
                    "2. Swap their values (use temp as helper).\n"
                    "3. Write the value of x, then write y."
                ),
                "source": "manual"
            },
            {
                "week": 2,
                "topic_kc_focus": "Loops",
                "target_task": (
                    "Write a program that computes the factorial of n (n!).\n\n"
                    "Instructions:\n"
                    "1. Read n from standard input.\n"
                    "2. Loop to calculate the factorial, storing it in fact.\n"
                    "3. Write the value of fact."
                ),
                "source": "manual"
            }
        ]

        for target_data in targets_to_seed:
            stmt = select(WeeklyTarget).where(
                WeeklyTarget.course_ref == "CS1-PYTHON-2026",
                WeeklyTarget.week == target_data["week"]
            )
            result = await session.execute(stmt)
            existing_target = result.scalar_one_or_none()

            if not existing_target:
                db_target = WeeklyTarget(
                    id=uuid.uuid4(),
                    course_ref="CS1-PYTHON-2026",
                    week=target_data["week"],
                    topic_kc_focus=target_data["topic_kc_focus"],
                    target_task=target_data["target_task"],
                    source=target_data["source"]
                )
                session.add(db_target)
                print(f"Seeded WeeklyTarget for course CS1-PYTHON-2026 week {target_data['week']}")
            else:
                # Update existing task text for consistency
                existing_target.target_task = target_data["target_task"]
                existing_target.topic_kc_focus = target_data["topic_kc_focus"]
                print(f"WeeklyTarget for course CS1-PYTHON-2026 week {target_data['week']} updated")

        await session.commit()
        print("Demo database seeding completed successfully!")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed database with demo data.")
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Reset and delete demo data before seeding"
    )
    args = parser.parse_args()
    asyncio.run(seed_demo(reset=args.reset))

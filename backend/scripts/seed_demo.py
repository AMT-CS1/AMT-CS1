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
from app.models import Base, User, WeeklyTarget, Problem
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

DEFAULT_PROBLEMS = {
    "swap-variables": {
        "title": "Variable Swapping",
        "description": (
            "Write a program that swaps the values of two variables, `x` and `y`.\n\n"
            "**Instructions:**\n"
            "1. Read two integers from the input into `x` and `y` respectively.\n"
            "2. Swap their values (use the temporary variable `temp` defined in the dictionary).\n"
            "3. Output the value of `x` and then `y` using the `write` statement.\n\n"
            "**Example:**\n"
            "If the input is `12` and `85`, the output must be:\n"
            "```\n"
            "85\n"
            "12\n"
            "```"
        ),
        "starter_code": (
            "program SwapVariables\n"
            "dictionary\n"
            "    x, y, temp : integer\n"
            "algorithm\n"
            "    read x\n"
            "    read y\n"
            "    \n"
            "    // Write your swapping logic here:\n"
            "    \n"
            "    \n"
            "    write x\n"
            "    write y\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "5\n10\n", "expected": "10\n5"},
            {"input": "-3\n42\n", "expected": "42\n-3"},
            {"input": "100\n100\n", "expected": "100\n100"}
        ]
    },
    "factorial": {
        "title": "Factorial Calculator",
        "description": (
            "Write a program that reads a non-negative integer `n` and computes its factorial (n!).\n\n"
            "**Instructions:**\n"
            "1. Read the value of `n` from the input.\n"
            "2. Compute `n * (n-1) * ... * 1` and store it in `fact`.\n"
            "3. If `n` is `0`, the factorial is defined as `1`.\n"
            "4. Output the final value of `fact`.\n\n"
            "**Example:**\n"
            "If the input is `5`, the output must be `120`."
        ),
        "starter_code": (
            "program Factorial\n"
            "dictionary\n"
            "    n, fact, i : integer\n"
            "algorithm\n"
            "    read n\n"
            "    fact <- 1\n"
            "    i <- 1\n"
            "    \n"
            "    // Write a loop here to compute the factorial:\n"
            "    \n"
            "    \n"
            "    write fact\n"
            "endprogram\n"
        ),
        "test_cases": [
            {"input": "5\n", "expected": "120"},
            {"input": "0\n", "expected": "1"},
            {"input": "3\n", "expected": "6"},
            {"input": "7\n", "expected": "5040"}
        ]
    }
}

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
            # Delete seeded problems
            await session.execute(
                delete(Problem).where(Problem.key.in_(list(DEFAULT_PROBLEMS.keys())))
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
                existing_target.target_task = target_data["target_task"]
                existing_target.topic_kc_focus = target_data["topic_kc_focus"]
                print(f"WeeklyTarget for course CS1-PYTHON-2026 week {target_data['week']} updated")

        # 3. Seed Predefined Problems
        for key, prob_data in DEFAULT_PROBLEMS.items():
            stmt = select(Problem).where(Problem.key == key)
            result = await session.execute(stmt)
            existing_prob = result.scalar_one_or_none()

            if not existing_prob:
                db_prob = Problem(
                    id=uuid.uuid4(),
                    key=key,
                    title=prob_data["title"],
                    description=prob_data["description"],
                    starter_code=prob_data["starter_code"],
                    test_cases=prob_data["test_cases"]
                )
                session.add(db_prob)
                print(f"Seeded problem: {key}")
            else:
                existing_prob.title = prob_data["title"]
                existing_prob.description = prob_data["description"]
                existing_prob.starter_code = prob_data["starter_code"]
                existing_prob.test_cases = prob_data["test_cases"]
                print(f"Problem updated: {key}")

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

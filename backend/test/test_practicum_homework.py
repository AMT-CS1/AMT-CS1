import asyncio
import uuid
from datetime import datetime, timedelta, timezone
import httpx
from sqlalchemy import delete, select

from app.main import app
from app.core.database import get_db, async_session_maker, engine
from app.core.security import create_access_token
from app.models.target import WeeklyTarget
from app.models.problem import Problem
from app.models.quiz_progress import QuizProgress
from app.models.attempt import Attempt

def get_headers(role: str, user_id: str = "11111111-1111-1111-1111-111111111111"):
    token = create_access_token({
        "sub": user_id,
        "username": f"{role}_user",
        "email": f"{role}@example.com",
        "role": role,
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}

def test_practicum_and_homework_rules():
    async def run_test():
        async with async_session_maker() as session:
            await session.begin()

            async def override_get_db():
                yield session

            app.dependency_overrides[get_db] = override_get_db
            
            created_target_ids = []
            created_problem_ids = []
            
            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    instructor = get_headers("instructor", str(uuid.uuid4()))
                    student = get_headers("student")
                    student_id = "11111111-1111-1111-1111-111111111111"
                    
                    # 1. Create a dummy problem
                    problem_key = f"test-prob-{uuid.uuid4().hex[:6]}"
                    db_problem = Problem(
                        id=uuid.uuid4(),
                        key=problem_key,
                        title="Test Problem",
                        description_en="Desc",
                        description_id="Desc",
                        starter_code="program Test\nendprogram",
                        test_cases=[
                            {"input": "1\n", "expected": "1"},
                            {"input": "2\n", "expected": "2", "hidden": True}
                        ],
                        kc_tags="VA"
                    )
                    session.add(db_problem)
                    await session.flush()
                    created_problem_ids.append(db_problem.id)

                    now = datetime.now(timezone.utc)

                    # 2. Create a Homework that has NOT started yet
                    hw_not_started_payload = {
                        "course_ref": "CS1-TEST",
                        "week": 80,
                        "topic_kc_focus": "VA",
                        "target_task": "Homework not started",
                        "source": "manual",
                        "kind": "homework",
                        "starts_at": (now + timedelta(hours=1)).isoformat(),
                        "deadline": (now + timedelta(hours=24)).isoformat()
                    }
                    res = await client.post("/targets", json=hw_not_started_payload, headers=instructor)
                    assert res.status_code == 201
                    hw_not_started = res.json()
                    created_target_ids.append(hw_not_started["id"])

                    # 3. Student tries to submit code for locked homework -> should fail (403)
                    attempt_payload = {
                        "task_ref": problem_key,
                        "content": "program Test\ndictionary\n    x : integer\nalgorithm\n    read x\n    write x\nendprogram",
                        "source": "manual",
                        "target_id": hw_not_started["id"]
                    }
                    res = await client.post("/attempts", json=attempt_payload, headers=student)
                    assert res.status_code == 403
                    assert "not started yet" in res.json()["detail"].lower()

                    # 4. Create an active Homework (starts_at in the past)
                    hw_active_payload = {
                        "course_ref": "CS1-TEST",
                        "week": 81,
                        "topic_kc_focus": "VA",
                        "target_task": "Active homework",
                        "source": "manual",
                        "kind": "homework",
                        "starts_at": (now - timedelta(hours=1)).isoformat(),
                        "deadline": (now + timedelta(hours=24)).isoformat()
                    }
                    res = await client.post("/targets", json=hw_active_payload, headers=instructor)
                    assert res.status_code == 201
                    hw_active = res.json()
                    created_target_ids.append(hw_active["id"])

                    # 5. Create an in-progress/incomplete quiz progress
                    db_quiz = QuizProgress(
                        user_id=uuid.UUID(student_id),
                        problem_key=problem_key,
                        completed_at=None
                    )
                    session.add(db_quiz)
                    await session.flush()

                    # 6. Student submits attempt while quiz is in progress -> rejected (403)
                    attempt_payload["target_id"] = hw_active["id"]
                    res = await client.post("/attempts", json=attempt_payload, headers=student)
                    assert res.status_code == 403
                    assert "quiz" in res.json()["detail"].lower()

                    # 7. Complete the quiz
                    db_quiz.completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
                    await session.flush()

                    # 8. Student submits attempt again -> passes quiz gate and succeeds (201)
                    res = await client.post("/attempts", json=attempt_payload, headers=student)
                    assert res.status_code in (200, 201)
                    attempt_data = res.json()
                    assert attempt_data["attempt"]["task_ref"] == problem_key
                    assert "p_matrix" in attempt_data
                    assert "q_matrix" in attempt_data
                    assert attempt_data["q_matrix"] == [0, 1, 0, 0, 0, 0, 0]
                    assert attempt_data["p_matrix"] == [0, 1, 0, 0, 0, 0, 0]
                    assert attempt_data["matrix_similar"] is True
                    # Check test results includes the hidden field
                    test_cases_ret = attempt_data["test_results"]
                    assert len(test_cases_ret) == 2
                    assert test_cases_ret[0]["hidden"] is False
                    assert test_cases_ret[1]["hidden"] is True

                    # 9. Create an ended homework (deadline in the past)
                    hw_ended_payload = {
                        "course_ref": "CS1-TEST",
                        "week": 82,
                        "topic_kc_focus": "VA",
                        "target_task": "Ended homework",
                        "source": "manual",
                        "kind": "homework",
                        "starts_at": (now - timedelta(hours=5)).isoformat(),
                        "deadline": (now - timedelta(hours=1)).isoformat()
                    }
                    res = await client.post("/targets", json=hw_ended_payload, headers=instructor)
                    assert res.status_code == 201
                    hw_ended = res.json()
                    created_target_ids.append(hw_ended["id"])

                    # 10. Call /targets/{id}/grade for ended homework -> should return reviews
                    res = await client.get(f"/targets/{hw_ended['id']}/grade", headers=student)
                    assert res.status_code == 200
                    grade_data = res.json()
                    assert grade_data["grade"] is not None
                    assert "problem_reviews" in grade_data
                    reviews = grade_data["problem_reviews"]
                    assert len(reviews) > 0
                    matching_rev = next((r for r in reviews if r["problem_key"] == problem_key), None)
                    assert matching_rev is not None
                    assert matching_rev["problem_title"] == "Test Problem"
                    assert matching_rev["student_code"] is not None
                    assert "write x" in matching_rev["student_code"]

            finally:
                # Cleanup
                if created_target_ids:
                    await session.execute(delete(WeeklyTarget).where(WeeklyTarget.id.in_([uuid.UUID(tid) for tid in created_target_ids])))
                if created_problem_ids:
                    await session.execute(delete(Problem).where(Problem.id.in_(created_problem_ids)))
                await session.execute(delete(Attempt).where(Attempt.task_ref == problem_key))
                await session.execute(delete(QuizProgress).where(QuizProgress.problem_key == problem_key))
                await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

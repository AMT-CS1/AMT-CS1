import asyncio
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import delete

from app.main import app
from app.core.database import get_db, async_session_maker, engine
from app.core.security import create_access_token
from app.models.target import WeeklyTarget


def make_headers(role: str, user_id: str = "11111111-1111-1111-1111-111111111111"):
    token = create_access_token({
        "sub": user_id,
        "username": f"{role}_user",
        "email": f"{role}@example.com",
        "role": role,
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}


def lab_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "course_ref": "CS1-TEST",
        "week": 99,
        "topic_kc_focus": "NONEXISTENT-KC",
        "target_task": "Lab test task",
        "source": "test",
        "kind": "lab",
        "starts_at": (now - timedelta(minutes=10)).isoformat(),
        "deadline": (now + timedelta(minutes=90)).isoformat(),
        "access_password": "kelas123",
        "randomize_problems": False,
    }
    payload.update(overrides)
    return payload


def test_lab_target_lifecycle():
    async def run_test():
        async with async_session_maker() as session:
            await session.begin()

            async def override_get_db():
                yield session

            app.dependency_overrides[get_db] = override_get_db
            created_ids = []
            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    instructor = make_headers("instructor", "22222222-2222-2222-2222-222222222222")
                    student = make_headers("student")

                    # 1. Lab without password is rejected
                    res = await client.post("/targets", json=lab_payload(access_password=None), headers=instructor)
                    assert res.status_code == 400

                    # 2. Create an active lab (started 10 min ago, ends in 90)
                    res = await client.post("/targets", json=lab_payload(), headers=instructor)
                    assert res.status_code == 201, res.text
                    lab = res.json()
                    created_ids.append(lab["id"])
                    assert lab["kind"] == "lab"
                    assert lab["access_password"] == "kelas123"  # instructor sees it

                    # 3. Students never receive the password, only requires_password
                    res = await client.get("/targets", headers=student)
                    student_lab = next(t for t in res.json() if t["id"] == lab["id"])
                    assert student_lab["access_password"] is None
                    assert student_lab["requires_password"] is True

                    # 4. Unlock: wrong password rejected, correct accepted
                    res = await client.post(f"/targets/{lab['id']}/unlock", json={"password": "salah"}, headers=student)
                    assert res.status_code == 403
                    res = await client.post(f"/targets/{lab['id']}/unlock", json={"password": "kelas123"}, headers=student)
                    assert res.status_code == 200

                    # 5. Submissions without the correct password are rejected
                    attempt_body = {
                        "task_ref": "any-problem",
                        "content": "program X\nendprogram",
                        "source": "manual",
                        "target_id": lab["id"],
                        "lab_password": "salah",
                    }
                    res = await client.post("/attempts", json=attempt_body, headers=student)
                    assert res.status_code == 403

                    # 6. A lab that has not started yet cannot be unlocked or submitted to
                    now = datetime.now(timezone.utc)
                    res = await client.post("/targets", json=lab_payload(
                        starts_at=(now + timedelta(hours=1)).isoformat(),
                        deadline=(now + timedelta(hours=3)).isoformat(),
                    ), headers=instructor)
                    future_lab = res.json()
                    created_ids.append(future_lab["id"])
                    res = await client.post(f"/targets/{future_lab['id']}/unlock", json={"password": "kelas123"}, headers=student)
                    assert res.status_code == 403
                    res = await client.post("/attempts", json={**attempt_body, "target_id": future_lab["id"], "lab_password": "kelas123"}, headers=student)
                    assert res.status_code == 403

                    # 7. Past-deadline target (lab or homework) rejects submissions and grades
                    res = await client.post("/targets", json=lab_payload(
                        kind="homework",
                        starts_at=None,
                        access_password=None,
                        deadline=(now - timedelta(minutes=5)).isoformat(),
                    ), headers=instructor)
                    ended_hw = res.json()
                    created_ids.append(ended_hw["id"])
                    res = await client.post("/attempts", json={**attempt_body, "target_id": ended_hw["id"], "lab_password": None}, headers=student)
                    assert res.status_code == 403
                    assert "deadline" in res.json()["detail"].lower()

                    # 8. Automated grade endpoint (no matching problems -> 0/0, grade 0)
                    res = await client.get(f"/targets/{ended_hw['id']}/grade", headers=student)
                    assert res.status_code == 200
                    grade = res.json()
                    assert grade["grade"] == 0
                    assert grade["total_problems"] == 0
            finally:
                for tid in created_ids:
                    await session.execute(delete(WeeklyTarget).where(WeeklyTarget.id == uuid.UUID(tid)))
                await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

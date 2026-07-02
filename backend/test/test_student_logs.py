import pytest
import uuid
import asyncio
from datetime import datetime
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.main import app
from app.core.database import get_db, async_session_maker, engine
from app.core.security import create_access_token
from app.models.log import InteractionLog

def get_student_headers(user_id="11111111-1111-1111-1111-111111111111"):
    token = create_access_token({
        "sub": user_id,
        "username": "student_user",
        "email": "student@example.com",
        "role": "student",
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}

def get_instructor_headers():
    token = create_access_token({
        "sub": "22222222-2222-2222-2222-222222222222",
        "username": "instructor_user",
        "email": "instructor@example.com",
        "role": "instructor",
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}

def test_student_interaction_logging_api():
    async def run_test():
        async with async_session_maker() as session:
            await session.begin()
            
            async def override_get_db():
                yield session
                
            app.dependency_overrides[get_db] = override_get_db
            
            created_log_ids = []
            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    # 1. POST a student log click event
                    log_payload = {
                        "event_type": "click_solve_homework",
                        "payload": {
                            "homework_id": "33333333-3333-3333-3333-333333333333",
                            "topic_kc_focus": "VA"
                        }
                    }
                    response = await client.post("/student-logs", json=log_payload, headers=get_student_headers())
                    assert response.status_code == 201
                    data = response.json()
                    assert data["event_type"] == "click_solve_homework"
                    assert data["actor"] == "11111111-1111-1111-1111-111111111111"
                    assert data["payload"]["homework_id"] == "33333333-3333-3333-3333-333333333333"
                    created_log_ids.append(uuid.UUID(data["id"]))

                    # 2. GET the student logs as a student
                    get_response = await client.get("/student-logs", headers=get_student_headers())
                    assert get_response.status_code == 200
                    logs = get_response.json()
                    # Verify our log is returned
                    matching_logs = [l for l in logs if l["id"] == data["id"]]
                    assert len(matching_logs) == 1

                    # 3. Verify BOLA/IDOR protection: another student fetches logs
                    other_student_headers = get_student_headers(user_id="55555555-5555-5555-5555-555555555555")
                    get_response_other = await client.get("/student-logs", headers=other_student_headers)
                    assert get_response_other.status_code == 200
                    other_logs = get_response_other.json()
                    # Verify our log is NOT returned to the other student
                    matching_other = [l for l in other_logs if l["id"] == data["id"]]
                    assert len(matching_other) == 0

                    # 4. GET the student logs as an instructor
                    get_response_inst = await client.get("/student-logs?actor=11111111-1111-1111-1111-111111111111", headers=get_instructor_headers())
                    assert get_response_inst.status_code == 200
                    inst_logs = get_response_inst.json()
                    matching_inst = [l for l in inst_logs if l["id"] == data["id"]]
                    assert len(matching_inst) == 1

            finally:
                if created_log_ids:
                    for lid in created_log_ids:
                        await session.execute(delete(InteractionLog).where(InteractionLog.id == lid))
                    await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

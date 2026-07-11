import pytest
import uuid
import asyncio
from datetime import datetime, timezone
import httpx
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, delete

from app.main import app
from app.core.database import get_db, async_session_maker, engine
from app.core.security import create_access_token
from app.models.target import WeeklyTarget
from app.models.hint_quiz import HintQuizQuestion

def get_instructor_headers():
    token = create_access_token({
        "sub": "22222222-2222-2222-2222-222222222222",
        "username": "instructor_user",
        "email": "instructor@example.com",
        "role": "instructor",
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}

def get_student_headers():
    token = create_access_token({
        "sub": "11111111-1111-1111-1111-111111111111",
        "username": "student_user",
        "email": "student@example.com",
        "role": "student",
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}

def test_create_and_list_weekly_targets():
    async def run_test():
        async with async_session_maker() as session:
            await session.begin()
            
            async def override_get_db():
                yield session
                
            app.dependency_overrides[get_db] = override_get_db
            
            target_id = None
            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    # 1. POST a new target with new fields (title, description, deadline)
                    target_payload = {
                        "course_ref": "CS1-TEST-2026",
                        "week": 99,
                        "topic_kc_focus": "testing-focus",
                        "target_task": "Write test cases",
                        "source": "manual",
                        "title": "Unit Testing Target",
                        "description": "Custom homework description for unit testing.",
                        "deadline": "2026-12-31T23:59:00"
                    }
                    response = await client.post("/targets", json=target_payload, headers=get_instructor_headers())
                    assert response.status_code == 201
                    data = response.json()
                    target_id = data["id"]
                    assert data["title"] == "Unit Testing Target"
                    assert data["description"] == "Custom homework description for unit testing."
                    assert "2026-12-31T23:59:00" in data["deadline"]

                    # 2. GET targets and verify the newly created target exists
                    get_response = await client.get("/targets", headers=get_student_headers())
                    assert get_response.status_code == 200
                    targets = get_response.json()
                    matching_targets = [t for t in targets if t["id"] == target_id]
                    assert len(matching_targets) == 1
                    created_target = matching_targets[0]
                    assert created_target["title"] == "Unit Testing Target"
                    assert created_target["description"] == "Custom homework description for unit testing."
                    assert "2026-12-31T23:59:00" in created_target["deadline"]

                    # 3. PUT target to update the new fields
                    update_payload = target_payload.copy()
                    update_payload["title"] = "Updated Testing Target"
                    update_payload["description"] = "Updated homework description."
                    update_payload["deadline"] = "2026-12-25T18:00:00"

                    put_response = await client.put(f"/targets/{target_id}", json=update_payload, headers=get_instructor_headers())
                    assert put_response.status_code == 200
                    updated_data = put_response.json()
                    assert updated_data["title"] == "Updated Testing Target"
                    assert updated_data["description"] == "Updated homework description."
                    assert "2026-12-25T18:00:00" in updated_data["deadline"]
            finally:
                if target_id:
                    # Clean up the test target added to the DB
                    await session.execute(delete(WeeklyTarget).where(WeeklyTarget.id == target_id))
                    await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

def test_hint_quiz_questions_caching():
    async def run_test():
        async with async_session_maker() as session:
            await session.begin()
            
            async def override_get_db():
                yield session
                
            app.dependency_overrides[get_db] = override_get_db
            
            unique_key = None
            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    unique_key = f"test-problems-key-{uuid.uuid4()}"
                    
                    req_payload = {
                        "kc_focus": "Unit Testing",
                        "problem_key": unique_key,
                        "problem_title": "Test Title",
                        "problem_description": "Test Desc"
                    }
                    first_res = await client.post("/exercises/generate", json=req_payload, headers=get_student_headers())
                    assert first_res.status_code == 200
                    first_data = first_res.json()
                    assert "questions" in first_data
                    assert len(first_data["questions"]) == 3
                    
                    first_q_text = first_data["questions"][0]["text_en"]

                    # Second call
                    second_res = await client.post("/exercises/generate", json=req_payload, headers=get_student_headers())
                    assert second_res.status_code == 200
                    second_data = second_res.json()
                    assert second_data["questions"][0]["text_en"] == first_q_text
                    
                    # Verify in DB directly
                    stmt = select(HintQuizQuestion).where(HintQuizQuestion.problem_key == unique_key)
                    db_res = await session.execute(stmt)
                    questions = db_res.scalars().all()
                    assert len(questions) == 3
                    assert questions[0].text == first_q_text
            finally:
                if unique_key:
                    # Clean up the hint quiz questions added to the DB
                    await session.execute(delete(HintQuizQuestion).where(HintQuizQuestion.problem_key == unique_key))
                    await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

import pytest
import uuid
import asyncio
import httpx
from sqlalchemy import select, delete

from app.main import app
from app.core.database import get_db, async_session_maker, engine
from app.core.security import create_access_token
from app.models.feedback import Feedback

def get_student_headers(user_id="11111111-1111-1111-1111-111111111111"):
    token = create_access_token({
        "sub": user_id,
        "username": "student_user",
        "email": "student@example.com",
        "role": "student",
        "consent_status": True
    })
    return {"Authorization": f"Bearer {token}"}

def test_quiz_feedback_and_rating_api():
    async def run_test():
        async with async_session_maker() as session:
            await session.begin()
            
            async def override_get_db():
                yield session
                
            app.dependency_overrides[get_db] = override_get_db
            
            created_feedback_ids = []
            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    # 1. POST to save the pre-generated quiz feedback
                    feedback_payload = {
                        "problem_key": "hw1_p1",
                        "question_text": "What is 2+2?",
                        "student_answer": "5",
                        "feedback_text": "What happens when you add two pairs? Try counting it out step by step.",
                        "lang": "en"
                    }
                    response = await client.post("/exercises/feedback", json=feedback_payload, headers=get_student_headers())
                    assert response.status_code == 201
                    data = response.json()
                    assert "id" in data
                    assert data["feedback_text"] == feedback_payload["feedback_text"]
                    
                    feedback_id = uuid.UUID(data["id"])
                    created_feedback_ids.append(feedback_id)

                    # 2. Rate feedback (thumbs up)
                    rate_payload = {"rating": 1}
                    rate_res = await client.post(f"/exercises/feedback/{feedback_id}/rate", json=rate_payload, headers=get_student_headers())
                    assert rate_res.status_code == 200
                    rate_data = rate_res.json()
                    assert rate_data["status"] == "success"
                    assert rate_data["rating"] == 1

                    # 3. Rate feedback with invalid rating
                    rate_res_invalid = await client.post(f"/exercises/feedback/{feedback_id}/rate", json={"rating": 5}, headers=get_student_headers())
                    assert rate_res_invalid.status_code == 400

                    # 4. Check BOLA/IDOR protection on rating: different student rates feedback
                    other_student_headers = get_student_headers(user_id="33333333-3333-3333-3333-333333333333")
                    rate_res_other = await client.post(f"/exercises/feedback/{feedback_id}/rate", json={"rating": -1}, headers=other_student_headers)
                    assert rate_res_other.status_code == 403

            finally:
                if created_feedback_ids:
                    for fid in created_feedback_ids:
                        await session.execute(delete(Feedback).where(Feedback.id == fid))
                    await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

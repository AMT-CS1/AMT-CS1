import asyncio
import uuid

import httpx
from sqlalchemy import delete

from app.main import app
from app.core.database import get_db, async_session_maker, engine
from app.core.security import create_access_token
from app.core.llm import DummyLLMProvider
from app.models.log import InteractionLog
import app.routers.exercises as exercises_router


def get_student_headers(user_id="11111111-1111-1111-1111-111111111111"):
    token = create_access_token({
        "sub": user_id,
        "username": "student_user",
        "email": "student@example.com",
        "role": "student",
        "consent_status": True,
    })
    return {"Authorization": f"Bearer {token}"}


def test_confirmation_generate_and_judge_api():
    """
    Covers the reflective understanding-confirmation flow:
      1. /exercises/confirm/generate returns a bilingual "why/how" question.
      2. /exercises/confirm/judge scores a strong explanation as passing (>=70%).
      3. /exercises/confirm/judge scores an empty explanation as failing (<70%).
    The Dummy provider is forced so scoring is deterministic (heuristic), and the
    judgement is confirmed to be logged to interaction_logs.
    """
    actor = "11111111-1111-1111-1111-111111111111"

    async def run_test():
        async with async_session_maker() as session:
            await session.begin()

            async def override_get_db():
                yield session

            app.dependency_overrides[get_db] = override_get_db
            original_provider = exercises_router.get_llm_provider
            exercises_router.get_llm_provider = lambda: DummyLLMProvider()

            try:
                transport = httpx.ASGITransport(app=app)
                async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                    headers = get_student_headers()

                    # 1. Generate the reflective confirmation question
                    gen_res = await client.post(
                        "/exercises/confirm/generate",
                        json={
                            "problem_key": "swap-variables",
                            "kc_focus": "variable-swap",
                            "question_text": "Why do we need a temp variable to swap x and y?",
                            "student_answer": "To avoid losing x's original value.",
                            "lang": "en",
                        },
                        headers=headers,
                    )
                    assert gen_res.status_code == 200
                    gen_data = gen_res.json()
                    assert gen_data["question_en"]
                    assert gen_data["question_id"]

                    # 2. Judge a strong, mechanistic explanation -> should pass
                    good_res = await client.post(
                        "/exercises/confirm/judge",
                        json={
                            "problem_key": "swap-variables",
                            "kc_focus": "variable-swap",
                            "question_text": "Why do we need a temp variable to swap x and y?",
                            "confirm_question": gen_data["question_en"],
                            "student_answer": "To avoid losing x's original value.",
                            "student_explanation": (
                                "Because if we assign x to y first we overwrite x and lose its value, "
                                "so we store x in temp before the swap and then copy temp into y."
                            ),
                            "lang": "en",
                        },
                        headers=headers,
                    )
                    assert good_res.status_code == 200
                    good_data = good_res.json()
                    assert good_data["threshold"] == 70
                    assert good_data["score"] >= 70
                    assert good_data["passed"] is True

                    # 3. Judge an empty explanation -> should fail
                    bad_res = await client.post(
                        "/exercises/confirm/judge",
                        json={
                            "problem_key": "swap-variables",
                            "kc_focus": "variable-swap",
                            "question_text": "Why do we need a temp variable to swap x and y?",
                            "confirm_question": gen_data["question_en"],
                            "student_answer": "To avoid losing x's original value.",
                            "student_explanation": "",
                            "lang": "en",
                        },
                        headers=headers,
                    )
                    assert bad_res.status_code == 200
                    bad_data = bad_res.json()
                    assert bad_data["score"] < 70
                    assert bad_data["passed"] is False

                    # The judge endpoint should have logged both judgements for research
                    from sqlalchemy import select
                    logs = (await session.execute(
                        select(InteractionLog).where(
                            InteractionLog.actor == actor,
                            InteractionLog.event_type == "confirmation",
                        )
                    )).scalars().all()
                    assert len(logs) >= 2

            finally:
                exercises_router.get_llm_provider = original_provider
                await session.execute(
                    delete(InteractionLog).where(
                        InteractionLog.actor == actor,
                        InteractionLog.event_type == "confirmation",
                    )
                )
                await session.commit()
                await session.rollback()
                app.dependency_overrides.pop(get_db, None)
                await engine.dispose()

    asyncio.run(run_test())

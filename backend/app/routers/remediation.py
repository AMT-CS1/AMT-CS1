import uuid
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import RoleChecker
from app.core import remediation as rem
from app.models.misconception_question import MisconceptionQuestion
from app.models.log import InteractionLog
from app.schemas.remediation import (
    RemediationStatusResponse,
    RemediationSubmitRequest,
    RemediationSubmitResponse,
)

logger = logging.getLogger("app.remediation")

# Router untuk alur remediasi miskonsepsi berurutan (soal pilihan ganda). Siswa
# dikasih satu soal MC per tag miskonsepsi (urutan sesuai deteksi). Jawaban benar
# -> maju ke tag berikutnya; jawaban salah -> ganti soal lain di tag yang sama.
router = APIRouter(prefix="/remediation", tags=["remediation"])


@router.get("/status/{problem_key}", response_model=RemediationStatusResponse)
async def get_remediation_status(
    problem_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"])),
):
    user_id = uuid.UUID(current_user["id"])
    session = await rem.get_session(db, user_id, problem_key)
    if session is None:
        return RemediationStatusResponse(active=False, completed=False, problem_key=problem_key)

    # Self-heal: skip tags with no questions so the flow can't dead-end.
    await rem.normalize_session(db, session)
    status = await rem.status_for(db, session)  # may assign the current question
    await db.commit()
    return status


@router.post("/submit", response_model=RemediationSubmitResponse)
async def submit_remediation(
    req: RemediationSubmitRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"])),
):
    user_id = uuid.UUID(current_user["id"])

    session = await rem.get_session(db, user_id, req.problem_key)
    if session is None:
        raise HTTPException(status_code=404, detail="No remediation session for this problem.")

    await rem.normalize_session(db, session)

    tags = list(session.tags or [])
    if session.completed_at is not None or session.current_index >= len(tags):
        await db.commit()
        return RemediationSubmitResponse(correct=True, status=await rem.status_for(db, session))

    current_tag = tags[session.current_index]

    # The answered question must belong to the tag currently being remediated.
    question = await db.get(MisconceptionQuestion, req.question_id)
    if question is None or question.misconception_tag != current_tag:
        raise HTTPException(
            status_code=400,
            detail="This question does not belong to the current misconception round.",
        )

    correct = req.answer_index == question.answer_index

    if correct:
        # Clear this tag and move on; the next question is assigned lazily by status_for.
        session.current_index += 1
        session.current_question_id = None
        await rem.normalize_session(db, session)
    else:
        # Retry the same tag with a different question.
        next_q = await rem.pick_question(db, current_tag, exclude_id=question.id)
        session.current_question_id = next_q.id if next_q else None

    db.add(InteractionLog(
        actor=current_user["id"],
        event_type="remediation",
        payload={
            "problem_key": req.problem_key,
            "question_id": str(req.question_id),
            "misconception_tag": current_tag,
            "answer_index": req.answer_index,
            "correct": correct,
            "lang": req.lang or "en",
        },
    ))

    status = await rem.status_for(db, session)
    await db.commit()

    return RemediationSubmitResponse(
        correct=correct,
        explanation_en=question.explanation_en,
        explanation_id=question.explanation_id,
        status=status,
    )

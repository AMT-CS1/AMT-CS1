from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import uuid
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.storage import get_s3_client
from app.core.config import settings
from app.core.dap_runner import evaluate_student_attempt, generate_feedback
from app.models.attempt import Attempt
from app.schemas.attempt import AttemptCreate, AttemptEvaluationResponse, AttemptResponse
from sqlalchemy import select
from app.models.state import StudentModelState
from app.models.target import WeeklyTarget
from app.schemas.internal import FeedbackRequestPayload
from app.routers.internal import mock_feedback_request

router = APIRouter(prefix="/attempts", tags=["attempts"])

def upload_code_to_minio(code: str) -> str:
    try:
        s3 = get_s3_client()
        filename = f"attempts/{uuid.uuid4().hex}.dap"
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=filename,
            Body=code.encode("utf-8"),
            ContentType="text/plain"
        )
        return filename
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload submission to object storage: {str(e)}"
        )

@router.post("", response_model=AttemptEvaluationResponse, status_code=201)
async def create_attempt(
    attempt: AttemptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # 1. Upload code to MinIO storage
    content_ref = upload_code_to_minio(attempt.content)
    
    # 2. Evaluate the code against problems and test cases using DAP runner
    eval_result = evaluate_student_attempt(attempt.task_ref, attempt.content)
    
    # 3. Save attempt details in PostgreSQL
    attempt_id = uuid.uuid4()
    db_attempt = Attempt(
        id=attempt_id,
        user_id=uuid.UUID(current_user["id"]),
        modality="pseudocode",
        task_ref=attempt.task_ref,
        content_ref=content_ref,
        source=attempt.source,
        confidence_level=attempt.confidence_level
    )
    db.add(db_attempt)
    await db.commit()
    await db.refresh(db_attempt)

    # 4. If failed, generate Socratic tutor feedback from mock internal endpoint
    feedback = None
    if not eval_result["passed"]:
        # Lookup student state and target KC

        stmt = select(StudentModelState).where(
            StudentModelState.user_id == uuid.UUID(current_user["id"])
        ).order_by(StudentModelState.updated_at.desc())
        state_res = await db.execute(stmt)
        latest_state = state_res.scalars().first()
        state_id = latest_state.id if latest_state else None

        # Look up target KC based on task_ref
        target_stmt = select(WeeklyTarget)
        target_res = await db.execute(target_stmt)
        targets = target_res.scalars().all()
        kc_focus = "Variables"
        for t in targets:
            if t.topic_kc_focus.lower() in attempt.task_ref.lower():
                kc_focus = t.topic_kc_focus
                break
        
        if "factorial" in attempt.task_ref.lower():
            kc_focus = "Loops"

        payload = FeedbackRequestPayload(
            attempt_id=attempt_id,
            learner_state_ref=state_id,
            kc_focus=kc_focus,
            code=attempt.content,
            eval_results=eval_result
        )
        feedback_res = await mock_feedback_request(payload)
        if feedback_res.status == "success":
            feedback = feedback_res.feedback_text
        else:
            feedback = f"Feedback Fallback: {feedback_res.reason}"
    
    # Map back to response model
    return AttemptEvaluationResponse(
        attempt=db_attempt,
        success=eval_result["success"],
        passed=eval_result["passed"],
        compilation_error=eval_result["compilation_error"],
        test_results=eval_result["test_results"],
        feedback=feedback
    )

@router.post("/speech", response_model=AttemptResponse, status_code=201)
async def create_speech_attempt(
    task_ref: str = Form(...),
    source: str = Form(...),
    confidence_level: float | None = Form(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    raise HTTPException(status_code=501, detail="POST /attempts/speech is not implemented yet")


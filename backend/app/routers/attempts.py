from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import uuid
import anyio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.storage import get_s3_client
from app.core.config import settings
from app.core.dap_runner import evaluate_student_attempt, generate_feedback
from app.models.attempt import Attempt
from app.models.problem import Problem
from app.models.quiz_progress import QuizProgress
from app.schemas.attempt import AttemptCreate, AttemptEvaluationResponse, AttemptResponse


router = APIRouter(prefix="/attempts", tags=["attempts"])

async def upload_code_to_minio(code: str) -> str:
    def upload():
        s3 = get_s3_client()
        filename = f"attempts/{uuid.uuid4().hex}.dap"
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=filename,
            Body=code.encode("utf-8"),
            ContentType="text/plain"
        )
        return filename

    try:
        return await anyio.to_thread.run_sync(upload)
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
    # Security check: verify student has completed the corresponding Intermediate Exercise
    user_id = uuid.UUID(current_user["id"])
    quiz_stmt = select(QuizProgress).where(
        and_(QuizProgress.user_id == user_id, QuizProgress.problem_key == attempt.task_ref)
    )
    quiz_res = await db.execute(quiz_stmt)
    quiz_progress = quiz_res.scalar_one_or_none()
    
    if quiz_progress is not None and quiz_progress.completed_at is None:
        raise HTTPException(
            status_code=403,
            detail="You have an active Intermediate Exercise quiz in progress. You must complete it before submitting homework attempts."
        )

    # 1. Upload code to MinIO storage asynchronously
    content_ref = await upload_code_to_minio(attempt.content)
    
    # 2. Retrieve the problem from the database
    problem_stmt = select(Problem).where(Problem.key == attempt.task_ref)
    problem_res = await db.execute(problem_stmt)
    db_problem = problem_res.scalars().first()
    
    # Evaluate the code asynchronously against problems and test cases using DAP runner
    eval_result = await evaluate_student_attempt(db_problem or attempt.task_ref, attempt.content)
    
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

    feedback = None
    if not eval_result["passed"]:
        feedback = await generate_feedback(
            db_problem or attempt.task_ref,
            attempt.content,
            eval_result,
            lang=attempt.lang or "en"
        )
    
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


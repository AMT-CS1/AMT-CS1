from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
import json
import uuid
import anyio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.storage import get_s3_client
from app.core.config import settings
from app.core.dap_runner import evaluate_student_attempt, generate_feedback
from app.core.misconception import generate_ast_json, detect_misconceptions
from app.models.log import InteractionLog
from app.models.attempt import Attempt
from app.models.problem import Problem
from app.models.quiz_progress import QuizProgress
from app.schemas.attempt import AttemptCreate, AttemptEvaluationResponse, AttemptResponse


router = APIRouter(prefix="/attempts", tags=["attempts"])

@router.get("", response_model=List[AttemptResponse])
async def list_attempts(
    user_id: Optional[str] = Query(None, description="Filter by user UUID"),
    task_ref: Optional[str] = Query(None, description="Filter by task_ref / problem key"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "researcher"]))
):
    """List all student attempts. Instructor-only endpoint."""
    stmt = select(Attempt).order_by(Attempt.timestamp.desc())
    
    conditions = []
    if user_id:
        conditions.append(Attempt.user_id == uuid.UUID(user_id))
    if task_ref:
        conditions.append(Attempt.task_ref == task_ref)
    
    if conditions:
        stmt = stmt.where(and_(*conditions))
    
    result = await db.execute(stmt)
    attempts = result.scalars().all()
    return attempts

@router.get("/{id}/code")
async def get_attempt_code(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "researcher", "student"]))
):
    """Retrieve the code content of a student attempt from MinIO."""
    stmt = select(Attempt).where(Attempt.id == id)
    res = await db.execute(stmt)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")
        
    # Check authorization: student can only view their own attempts
    if current_user["role"] == "student" and str(attempt.user_id) != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Download from MinIO
    def download():
        s3 = get_s3_client()
        try:
            obj = s3.get_object(Bucket=settings.MINIO_BUCKET_NAME, Key=attempt.content_ref)
            return obj["Body"].read().decode("utf-8")
        except Exception as e:
            return None

    try:
        content = await anyio.to_thread.run_sync(download)
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to retrieve code from storage")
        return {"code": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def upload_text_to_minio(key: str, body: str, content_type: str = "text/plain") -> str:
    def upload():
        s3 = get_s3_client()
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType=content_type
        )
        return key

    try:
        return await anyio.to_thread.run_sync(upload)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload submission to object storage: {str(e)}"
        )


async def upload_code_to_minio(code: str) -> str:
    return await upload_text_to_minio(f"attempts/{uuid.uuid4().hex}.dap", code)

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

    # 3. Compile the AST once and persist it to MinIO so later analyses
    # (misconception detection, P-Matrix) never need to re-invoke the compiler.
    attempt_id = uuid.uuid4()
    ast_ref = None
    student_ast = None
    if eval_result["success"]:
        student_ast = await generate_ast_json(attempt.content)
        if student_ast is not None:
            ast_ref = await upload_text_to_minio(
                f"attempts/{attempt_id.hex}.ast.json",
                json.dumps(student_ast),
                content_type="application/json"
            )

    # 4. On failed (but compiling) attempts, diff the AST against the problem's
    # reference solution to detect misconceptions.
    misconceptions = None
    if student_ast is not None and not eval_result["passed"] and db_problem is not None:
        reference_ast = db_problem.reference_ast
        if reference_ast is None and db_problem.reference_solution:
            # Lazily compile and cache the reference AST on the problem row
            reference_ast = await generate_ast_json(db_problem.reference_solution)
            if reference_ast is not None:
                db_problem.reference_ast = reference_ast
        if reference_ast is not None:
            detected = detect_misconceptions(student_ast, reference_ast)
            misconceptions = detected or None

    # 5. Save attempt details in PostgreSQL
    db_attempt = Attempt(
        id=attempt_id,
        user_id=uuid.UUID(current_user["id"]),
        modality="pseudocode",
        task_ref=attempt.task_ref,
        content_ref=content_ref,
        source=attempt.source,
        confidence_level=attempt.confidence_level,
        passed=eval_result["passed"],
        ast_ref=ast_ref,
        misconceptions=misconceptions
    )
    db.add(db_attempt)

    feedback = None

    # Log submission event
    submission_log = InteractionLog(
        actor=current_user["id"],
        event_type="submission",
        payload={
            "attempt_id": str(db_attempt.id),
            "task_ref": db_attempt.task_ref,
            "passed": db_attempt.passed
        }
    )
    db.add(submission_log)

    # Log detected misconceptions for research, referencing the attempt and AST
    if misconceptions:
        misconception_log = InteractionLog(
            actor=current_user["id"],
            event_type="misconception",
            payload={
                "attempt_id": str(db_attempt.id),
                "task_ref": db_attempt.task_ref,
                "ast_ref": ast_ref,
                "misconceptions": [
                    {"code": m["code"], "title": m["title"], "detail": m["detail"]}
                    for m in misconceptions
                ]
            }
        )
        db.add(misconception_log)

    await db.commit()
    await db.refresh(db_attempt)

    # Map back to response model
    return AttemptEvaluationResponse(
        attempt=db_attempt,
        success=eval_result["success"],
        passed=eval_result["passed"],
        compilation_error=eval_result["compilation_error"],
        test_results=eval_result["test_results"],
        feedback=feedback,
        misconceptions=misconceptions
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


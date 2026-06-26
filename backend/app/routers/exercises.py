from fastapi import APIRouter, Depends, HTTPException
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.state import StudentModelState
from app.schemas.internal import ProblemRequestPayload
from app.routers.internal import mock_problem_request
from app.core.security import RoleChecker
from app.core.database import get_db
from app.schemas.exercise import ExerciseRequest, ExerciseResponse

router = APIRouter(prefix="/exercises", tags=["exercises"])

@router.post("/intermediate", response_model=ExerciseResponse)
async def request_intermediate_exercise(
    exercise_req: ExerciseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # Get student model state
    stmt = select(StudentModelState).where(
        StudentModelState.user_id == uuid.UUID(current_user["id"])
    ).order_by(StudentModelState.updated_at.desc())
    state_res = await db.execute(stmt)
    latest_state = state_res.scalars().first()
    state_id = latest_state.id if latest_state else None

    # Call mock problem-request endpoint
    payload = ProblemRequestPayload(
        learner_state_ref=state_id,
        kc_focus=exercise_req.kc_focus,
        current_difficulty=exercise_req.difficulty or "medium"
    )
    problem_res = await mock_problem_request(payload)

    if problem_res.status == "no_match":
        raise HTTPException(
            status_code=404,
            detail=f"Problem Generation Fallback: {problem_res.reason}"
        )

    return ExerciseResponse(
        exercise_id=problem_res.exercise_id,
        kc_focus=problem_res.kc_focus,
        problem_statement=problem_res.problem_statement,
        difficulty=problem_res.difficulty
    )

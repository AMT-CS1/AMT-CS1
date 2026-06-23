from fastapi import APIRouter, Depends, HTTPException
from app.core.security import RoleChecker
from app.schemas.exercise import ExerciseRequest, ExerciseResponse

router = APIRouter(prefix="/exercises", tags=["exercises"])

@router.post("/intermediate", response_model=ExerciseResponse)
async def request_intermediate_exercise(
    exercise_req: ExerciseRequest,
    current_user: dict = Depends(RoleChecker(["student"]))
):
    raise HTTPException(status_code=501, detail="POST /exercises/intermediate is not implemented yet")

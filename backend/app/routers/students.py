from fastapi import APIRouter, Depends, HTTPException
import uuid
from app.core.security import RoleChecker
from app.schemas.progress import StudentProgressResponse

router = APIRouter(prefix="/students", tags=["students"])

@router.get("/{id}/progress", response_model=StudentProgressResponse)
async def get_student_progress(
    id: uuid.UUID,
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher"]))
):
    # Future logic: if current_user role is student, verify id == current_user["id"]
    raise HTTPException(status_code=501, detail="GET /students/{id}/progress is not implemented yet")

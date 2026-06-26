from fastapi import APIRouter, Depends, HTTPException
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import RoleChecker
from app.core.database import get_db
from app.models.state import StudentModelState
from app.schemas.progress import StudentProgressResponse

router = APIRouter(prefix="/students", tags=["students"])

@router.get("/{id}/progress", response_model=StudentProgressResponse)
async def get_student_progress(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher"]))
):
    # Enforce BOLA/IDOR ownership:
    # A student can only request their own progress. Instructors and researchers can access anyone's.
    if current_user.get("role") == "student" and current_user.get("id") != str(id):
        raise HTTPException(
            status_code=403,
            detail="Access denied. Students are only authorized to access their own progress data."
        )

    # Query the database for the latest progress/learner state of the student
    stmt = select(StudentModelState).where(
        StudentModelState.user_id == id
    ).order_by(StudentModelState.updated_at.desc())
    result = await db.execute(stmt)
    state = result.scalars().first()

    if not state:
        raise HTTPException(
            status_code=404,
            detail="No student model progress state found for this student ID."
        )

    return StudentProgressResponse(
        user_id=state.user_id,
        kc_mastery=state.kc_mastery,
        misconception_risk=state.misconception_risk,
        evidence_confidence=state.evidence_confidence,
        last_updated=state.updated_at
    )

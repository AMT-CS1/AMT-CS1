import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import RoleChecker
from app.core.lms_reports import (
    resolve_teacher_course_ids,
    resolve_course_student_user_ids,
)
from app.core.amt_reports import (
    teacher_summary,
    student_report,
    student_detail,
)
from app.schemas.amt_reports import (
    AmtTeacherSummary,
    AmtStudentReport,
    AmtStudentDetail,
)

router = APIRouter(prefix="/amt", tags=["amt-reports"])

TEACHER_ROLES = ["instructor", "researcher"]


def _is_all_access(current_user: dict) -> bool:
    """Researchers see every class; instructors are restricted to their own (UC4)."""
    return current_user.get("role") == "researcher"


async def _resolve_roster(
    db: AsyncSession, current_user: dict, course_id: Optional[int]
) -> Optional[list[str]]:
    """Class roster (local user_ids) the caller may see, honoring UC4 scoping.

    Returns None for all-access with no course filter (every student in scope),
    an empty list when the scope resolves to no students, else the roster.
    Raises 403 if an instructor requests a course they don't teach.
    """
    if _is_all_access(current_user):
        course_scope = [course_id] if course_id is not None else None
        return await resolve_course_student_user_ids(db, course_scope)

    allowed = await resolve_teacher_course_ids(db, uuid.UUID(str(current_user["id"])))
    if course_id is not None:
        if course_id not in allowed:
            raise HTTPException(status_code=403, detail="You don't have access to this class.")
        course_scope = [course_id]
    else:
        course_scope = allowed
    return await resolve_course_student_user_ids(db, course_scope)


@router.get("/summary/teacher", response_model=AmtTeacherSummary)
async def get_amt_teacher_summary(
    course_id: Optional[int] = Query(None),
    context: Optional[str] = Query(None, description="practice | practicum"),
    problem_key: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    """Cohort dashboard over AMT-CS1 native attempts, scoped to the teacher's classes."""
    roster = await _resolve_roster(db, current_user, course_id)
    return await teacher_summary(db, course_id, roster, context, problem_key)


@router.get("/summary/teacher/students/{user_id}", response_model=AmtStudentDetail)
async def get_amt_student_drilldown(
    user_id: uuid.UUID,
    course_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    # Ownership: an instructor may only drill into students in their own classes.
    if not _is_all_access(current_user):
        roster = await _resolve_roster(db, current_user, course_id)
        if roster is not None and str(user_id) not in roster:
            raise HTTPException(status_code=403, detail="This student isn't in your classes.")
    return await student_detail(db, user_id)


@router.get("/summary/student", response_model=AmtStudentReport)
async def get_amt_student_self(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher"])),
):
    """A student's own native activity. BOLA: always force-resolved to the caller."""
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
    return await student_report(db, uuid.UUID(str(user_id)))

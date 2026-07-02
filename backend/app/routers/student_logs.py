from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional
import uuid

from app.core.security import RoleChecker
from app.core.database import get_db
from app.models.log import InteractionLog
from app.schemas.student_logs import StudentInteractionLogCreate, StudentInteractionLogResponse

router = APIRouter(prefix="/student-logs", tags=["student-logs"])

@router.post("", response_model=StudentInteractionLogResponse, status_code=201)
async def create_student_log(
    payload: StudentInteractionLogCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    actor_id = current_user.get("id")
    if not actor_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")
        
    db_log = InteractionLog(
        actor=actor_id,
        event_type=payload.event_type,
        payload=payload.payload
    )
    db.add(db_log)
    await db.commit()
    await db.refresh(db_log)
    return db_log

@router.get("", response_model=List[StudentInteractionLogResponse])
async def get_student_logs(
    actor: Optional[str] = Query(None, description="Filter by actor UUID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    # Enforce BOLA/IDOR ownership:
    # A student can only request their own logs. Instructors, researchers, and raters can access anyone's.
    user_role = current_user.get("role")
    user_id = current_user.get("id")

    if user_role == "student":
        # Force student to view only their own logs
        actor = user_id

    stmt = select(InteractionLog).order_by(InteractionLog.timestamp.desc())
    conditions = []
    if actor:
        conditions.append(InteractionLog.actor == actor)
    if event_type:
        conditions.append(InteractionLog.event_type == event_type)
        
    if conditions:
        stmt = stmt.where(and_(*conditions))
        
    result = await db.execute(stmt)
    logs = result.scalars().all()
    return logs

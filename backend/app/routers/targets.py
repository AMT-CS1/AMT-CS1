from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.core.security import RoleChecker
from app.core.database import get_db
from app.models.target import WeeklyTarget
from app.schemas.target import TargetCreate, TargetResponse

router = APIRouter(prefix="/targets", tags=["targets"])

@router.post("", response_model=TargetResponse, status_code=201)
async def configure_weekly_target(
    target: TargetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    db_target = WeeklyTarget(
        course_ref=target.course_ref,
        week=target.week,
        topic_kc_focus=target.topic_kc_focus,
        target_task=target.target_task,
        source=target.source
    )
    db.add(db_target)
    await db.commit()
    await db.refresh(db_target)
    return db_target

@router.get("", response_model=List[TargetResponse])
async def list_weekly_targets(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    stmt = select(WeeklyTarget)
    result = await db.execute(stmt)
    targets = result.scalars().all()
    return targets

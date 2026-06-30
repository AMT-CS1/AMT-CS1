from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

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
        source=target.source,
        title=target.title,
        description=target.description,
        deadline=target.deadline
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

@router.put("/{id}", response_model=TargetResponse)
async def update_weekly_target(
    id: uuid.UUID,
    target_in: TargetCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(WeeklyTarget).where(WeeklyTarget.id == id)
    res = await db.execute(stmt)
    db_target = res.scalar_one_or_none()
    if not db_target:
        raise HTTPException(status_code=404, detail="Weekly target not found")
        
    db_target.course_ref = target_in.course_ref
    db_target.week = target_in.week
    db_target.topic_kc_focus = target_in.topic_kc_focus
    db_target.target_task = target_in.target_task
    db_target.source = target_in.source
    db_target.title = target_in.title
    db_target.description = target_in.description
    db_target.deadline = target_in.deadline
    
    await db.commit()
    await db.refresh(db_target)
    return db_target

@router.delete("/{id}", status_code=204)
async def delete_weekly_target(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(WeeklyTarget).where(WeeklyTarget.id == id)
    res = await db.execute(stmt)
    db_target = res.scalar_one_or_none()
    if not db_target:
        raise HTTPException(status_code=404, detail="Weekly target not found")
        
    await db.delete(db_target)
    await db.commit()
    return {}


from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import uuid

from app.core.security import RoleChecker
from app.core.database import get_db
from app.models.problem import Problem
from app.schemas.problem import ProblemCreate, ProblemResponse

router = APIRouter(prefix="/problems", tags=["problems"])

@router.get("", response_model=List[ProblemResponse])
async def list_problems(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    stmt = select(Problem)
    result = await db.execute(stmt)
    problems = result.scalars().all()
    return problems

@router.get("/{key}", response_model=ProblemResponse)
async def get_problem(
    key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    stmt = select(Problem).where(Problem.key == key)
    result = await db.execute(stmt)
    problem = result.scalar_one_or_none()
    if not problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return problem

@router.post("", response_model=ProblemResponse, status_code=201)
async def create_or_update_problem(
    problem_in: ProblemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(Problem).where(Problem.key == problem_in.key)
    res = await db.execute(stmt)
    db_problem = res.scalar_one_or_none()
    
    test_cases_data = [tc.model_dump() for tc in problem_in.test_cases]
    
    if db_problem:
        db_problem.title = problem_in.title
        db_problem.description_en = problem_in.description_en
        db_problem.description_id = problem_in.description_id
        db_problem.starter_code = problem_in.starter_code
        db_problem.test_cases = test_cases_data
    else:
        db_problem = Problem(
            id=uuid.uuid4(),
            key=problem_in.key,
            title=problem_in.title,
            description_en=problem_in.description_en,
            description_id=problem_in.description_id,
            starter_code=problem_in.starter_code,
            test_cases=test_cases_data
        )
        db.add(db_problem)
        
    await db.commit()
    await db.refresh(db_problem)
    return db_problem

@router.put("/{id}", response_model=ProblemResponse)
async def update_problem(
    id: uuid.UUID,
    problem_in: ProblemCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(Problem).where(Problem.id == id)
    res = await db.execute(stmt)
    db_problem = res.scalar_one_or_none()
    if not db_problem:
        raise HTTPException(status_code=404, detail="Problem not found")
        
    if db_problem.key != problem_in.key:
        key_stmt = select(Problem).where(Problem.key == problem_in.key, Problem.id != id)
        key_res = await db.execute(key_stmt)
        if key_res.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Problem with this key already exists")

    test_cases_data = [tc.model_dump() for tc in problem_in.test_cases]
    db_problem.key = problem_in.key
    db_problem.title = problem_in.title
    db_problem.description_en = problem_in.description_en
    db_problem.description_id = problem_in.description_id
    db_problem.starter_code = problem_in.starter_code
    db_problem.test_cases = test_cases_data

    await db.commit()
    await db.refresh(db_problem)
    return db_problem

@router.delete("/{id}", status_code=204)
async def delete_problem(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    stmt = select(Problem).where(Problem.id == id)
    res = await db.execute(stmt)
    db_problem = res.scalar_one_or_none()
    if not db_problem:
        raise HTTPException(status_code=404, detail="Problem not found")
        
    await db.delete(db_problem)
    await db.commit()
    return {}


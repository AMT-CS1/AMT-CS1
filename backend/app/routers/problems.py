from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.misconception import generate_ast_json
from app.models.problem import Problem
from app.schemas.problem import ProblemCreate, ProblemResponse

router = APIRouter(prefix="/problems", tags=["problems"])


def serialize_problem(problem: Problem, role: str) -> ProblemResponse:
    """Serialize a problem, hiding the reference solution from non-instructors."""
    resp = ProblemResponse.model_validate(problem)
    if role != "instructor":
        resp.reference_solution = None
    return resp


async def compile_reference_solution(reference_solution: str | None) -> tuple[str | None, dict | None]:
    """Validate and compile the reference solution to its cached AST."""
    solution = (reference_solution or "").strip() or None
    if not solution:
        return None, None
    reference_ast = await generate_ast_json(solution)
    if reference_ast is None:
        raise HTTPException(status_code=400, detail="Reference solution does not compile")
    return solution, reference_ast


@router.get("", response_model=List[ProblemResponse])
async def list_problems(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    stmt = select(Problem)
    result = await db.execute(stmt)
    problems = result.scalars().all()
    return [serialize_problem(p, current_user.get("role")) for p in problems]

@router.get("/by-kc", response_model=List[ProblemResponse])
async def list_problems_by_kc(
    kc: str = Query(..., description="Comma-separated KC IDs to filter by, e.g. 'VA,LO'"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher", "rater"]))
):
    """Return problems where any of the requested KCs match any of the problem's kc_tags."""
    requested_kcs = {k.strip().upper() for k in kc.split(",") if k.strip()}
    if not requested_kcs:
        return []
    
    stmt = select(Problem)
    result = await db.execute(stmt)
    all_problems = result.scalars().all()
    
    # Filter in Python since kc_tags is a comma-separated string
    matched = []
    for p in all_problems:
        problem_kcs = {k.strip().upper() for k in p.kc_tags.split(",") if k.strip()}
        if problem_kcs & requested_kcs:  # intersection
            matched.append(p)

    return [serialize_problem(p, current_user.get("role")) for p in matched]

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
    return serialize_problem(problem, current_user.get("role"))

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
    reference_solution, reference_ast = await compile_reference_solution(problem_in.reference_solution)

    if db_problem:
        db_problem.title = problem_in.title
        db_problem.description_en = problem_in.description_en
        db_problem.description_id = problem_in.description_id
        db_problem.starter_code = problem_in.starter_code
        db_problem.test_cases = test_cases_data
        db_problem.kc_tags = problem_in.kc_tags
        db_problem.reference_solution = reference_solution
        db_problem.reference_ast = reference_ast
    else:
        db_problem = Problem(
            id=uuid.uuid4(),
            key=problem_in.key,
            title=problem_in.title,
            description_en=problem_in.description_en,
            description_id=problem_in.description_id,
            starter_code=problem_in.starter_code,
            test_cases=test_cases_data,
            kc_tags=problem_in.kc_tags,
            reference_solution=reference_solution,
            reference_ast=reference_ast
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
    reference_solution, reference_ast = await compile_reference_solution(problem_in.reference_solution)
    db_problem.key = problem_in.key
    db_problem.title = problem_in.title
    db_problem.description_en = problem_in.description_en
    db_problem.description_id = problem_in.description_id
    db_problem.starter_code = problem_in.starter_code
    db_problem.test_cases = test_cases_data
    db_problem.kc_tags = problem_in.kc_tags
    db_problem.reference_solution = reference_solution
    db_problem.reference_ast = reference_ast

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

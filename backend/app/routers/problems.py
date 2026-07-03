from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional
import uuid

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.misconception import generate_ast_json
from app.core.references import (
    delete_reference_file,
    list_reference_filenames,
    load_reference_files,
    sanitize_reference_filename,
    upload_reference_file,
)
from app.models.problem import Problem
from app.schemas.problem import (
    ProblemCreate,
    ProblemResponse,
    ReferenceFileOut,
    ReferenceFilesUpload,
    TestCaseSchema,
)

router = APIRouter(prefix="/problems", tags=["problems"])


def serialize_problem(problem: Problem, role: str) -> ProblemResponse:
    """Serialize a problem, hiding the reference solution and hidden test cases from non-instructors."""
    # Filter test cases if not instructor
    test_cases = problem.test_cases or []
    if role != "instructor":
        visible_test_cases = [
            tc for tc in test_cases
            if not (isinstance(tc, dict) and tc.get("hidden", False))
        ]
    else:
        visible_test_cases = test_cases

    # Construct ProblemResponse with filtered test cases
    resp = ProblemResponse(
        id=problem.id,
        key=problem.key,
        title=problem.title,
        description_en=problem.description_en,
        description_id=problem.description_id,
        starter_code=problem.starter_code,
        test_cases=[
            TestCaseSchema(
                input=tc.get("input", "") if isinstance(tc, dict) else getattr(tc, "input", ""),
                expected=tc.get("expected", "") if isinstance(tc, dict) else getattr(tc, "expected", "")
            )
            for tc in visible_test_cases
        ],
        kc_tags=problem.kc_tags,
        reference_solution=problem.reference_solution if role == "instructor" else None
    )
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

async def _get_problem_by_id(id: uuid.UUID, db: AsyncSession) -> Problem:
    res = await db.execute(select(Problem).where(Problem.id == id))
    db_problem = res.scalar_one_or_none()
    if not db_problem:
        raise HTTPException(status_code=404, detail="Problem not found")
    return db_problem


@router.get("/{id}/references", response_model=List[ReferenceFileOut])
async def list_problem_references(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "rater"]))
):
    """Reference solution files stored under problems/{id}_{key}/reference_solution/."""
    db_problem = await _get_problem_by_id(id, db)
    files = await load_reference_files(db_problem, with_ast=False)
    return [ReferenceFileOut(filename=f["filename"], content=f["content"]) for f in files]


@router.post("/{id}/references", response_model=List[ReferenceFileOut], status_code=201)
async def upload_problem_references(
    id: uuid.UUID,
    payload: ReferenceFilesUpload,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    """
    Attach one or more reference solution files to a problem. Every file must
    compile; its AST is cached next to it so misconception detection never has
    to re-invoke the compiler.
    """
    db_problem = await _get_problem_by_id(id, db)

    validated: list[tuple[str, str, dict]] = []
    for f in payload.files:
        try:
            filename = sanitize_reference_filename(f.filename)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"{f.filename}: {e}")
        content = f.content.strip()
        if not content:
            raise HTTPException(status_code=400, detail=f"{filename}: file is empty")
        ast = await generate_ast_json(content)
        if ast is None:
            raise HTTPException(
                status_code=400,
                detail=f"{filename}: reference solution does not compile"
            )
        validated.append((filename, content, ast))

    for filename, content, ast in validated:
        await upload_reference_file(db_problem, filename, content, ast)

    files = await load_reference_files(db_problem, with_ast=False)
    return [ReferenceFileOut(filename=f["filename"], content=f["content"]) for f in files]


@router.delete("/{id}/references/{filename}", status_code=204)
async def delete_problem_reference(
    id: uuid.UUID,
    filename: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    db_problem = await _get_problem_by_id(id, db)
    try:
        safe_name = sanitize_reference_filename(filename)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if safe_name not in await list_reference_filenames(db_problem):
        raise HTTPException(status_code=404, detail="Reference file not found")
    await delete_reference_file(db_problem, safe_name)
    return {}


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

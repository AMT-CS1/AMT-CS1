import io
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database import get_db
from app.core.security import RoleChecker
from app.core.storage import upload_bytes_to_minio
from app.core.lms_import import parse_workbook, upsert_lms_data
from app.core.roster_import import parse_roster_workbook, upsert_roster
from app.core.lms_reports import (
    teacher_summary,
    student_report,
    step_timeline,
    question_slot_detail,
    resolve_matched_lms_user_ids,
    resolve_teacher_course_ids,
    list_teacher_courses,
)
from app.models.lms import LmsImport, LmsParticipant
from app.schemas.lms_reports import (
    LmsImportResponse,
    LmsImportResult,
    UnmatchedParticipant,
    CourseOut,
    TeacherSummary,
    StudentReport,
    StepTimeline,
    QuestionSlotDetail,
)
from app.schemas.roster import RosterImportResult

router = APIRouter(prefix="/lms", tags=["lms-reports"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


@router.post("/imports", response_model=LmsImportResult, status_code=201)
async def create_lms_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "researcher"])),
):
    """Upload a Moodle XLSX export: store the raw file, parse, and upsert."""
    filename = file.filename or "upload.xlsx"
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted")

    body = await file.read()
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB upload limit")
    if not body:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    import_id = uuid.uuid4()
    uploaded_by = uuid.UUID(str(current_user["id"]))

    # Raw-file provenance is best-effort: a MinIO hiccup shouldn't block the import.
    storage_ref = None
    try:
        storage_ref = await upload_bytes_to_minio(
            f"lms_imports/{import_id}_{filename}", body, XLSX_CONTENT_TYPE
        )
    except Exception:
        pass

    try:
        parsed = parse_workbook(io.BytesIO(body))
    except ValueError as e:
        db.add(LmsImport(id=import_id, uploaded_by=uploaded_by, filename=filename,
                         storage_ref=storage_ref, status="failed"))
        await db.commit()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        db.add(LmsImport(id=import_id, uploaded_by=uploaded_by, filename=filename,
                         storage_ref=storage_ref, status="failed"))
        await db.commit()
        raise HTTPException(status_code=400, detail="File could not be read as an XLSX workbook")

    result = await upsert_lms_data(db, parsed)

    unmatched_stmt = (
        select(LmsParticipant)
        .where(
            LmsParticipant.role_shortname == "student",
            LmsParticipant.matched_user_id.is_(None),
            LmsParticipant.course_id.in_(list(parsed.courses.keys())),
        )
        .order_by(LmsParticipant.username)
    )
    unmatched = (await db.execute(unmatched_stmt)).scalars().all()

    db_import = LmsImport(
        id=import_id,
        uploaded_by=uploaded_by,
        filename=filename,
        storage_ref=storage_ref,
        status="completed",
        row_counts=result["row_counts"],
        unmatched_count=result["unmatched_students"],
    )
    db.add(db_import)
    await db.commit()
    await db.refresh(db_import)

    return LmsImportResult(
        id=db_import.id,
        filename=db_import.filename,
        status=db_import.status,
        storage_ref=db_import.storage_ref,
        row_counts=db_import.row_counts,
        unmatched_count=db_import.unmatched_count,
        created_at=db_import.created_at,
        unmatched_participants=[UnmatchedParticipant.model_validate(p) for p in unmatched],
    )


@router.get("/imports", response_model=List[LmsImportResponse])
async def list_lms_imports(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "researcher"])),
):
    stmt = select(LmsImport).order_by(LmsImport.created_at.desc()).limit(50)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/roster", response_model=RosterImportResult, status_code=201)
async def create_roster_import(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["researcher"])),
):
    """Provision a class from a roster XLSX: create teacher + student accounts,
    the course, and the teacher↔class↔student links in one idempotent pass (R4)."""
    filename = file.filename or "roster.xlsx"
    if not filename.lower().endswith(".xlsx"):
        raise HTTPException(status_code=400, detail="Only .xlsx files are accepted")

    body = await file.read()
    if len(body) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 25 MB upload limit")
    if not body:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    import_id = uuid.uuid4()
    uploaded_by = uuid.UUID(str(current_user["id"]))

    storage_ref = None
    try:
        storage_ref = await upload_bytes_to_minio(
            f"roster_imports/{import_id}_{filename}", body, XLSX_CONTENT_TYPE
        )
    except Exception:
        pass

    def _fail(detail: str):
        return LmsImport(
            id=import_id, uploaded_by=uploaded_by, filename=filename,
            storage_ref=storage_ref, status="failed", row_counts={"import_type": "roster"},
        )

    try:
        parsed = parse_roster_workbook(io.BytesIO(body))
    except ValueError as e:
        db.add(_fail(str(e)))
        await db.commit()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        db.add(_fail("unreadable"))
        await db.commit()
        raise HTTPException(status_code=400, detail="File could not be read as an XLSX workbook")

    result = await upsert_roster(db, parsed)  # commits the provisioning

    # Provenance: reuse LmsImport, tagging the type so the imports list can label it.
    db_import = LmsImport(
        id=import_id,
        uploaded_by=uploaded_by,
        filename=filename,
        storage_ref=storage_ref,
        status="completed",
        row_counts={"import_type": "roster", **result["counts"]},
        unmatched_count=result["counts"].get("skipped", 0),
    )
    db.add(db_import)
    await db.commit()
    await db.refresh(db_import)

    return RosterImportResult(
        id=db_import.id,
        filename=db_import.filename,
        status=db_import.status,
        counts=result["counts"],
        generated_credentials=result["generated_credentials"],
        skipped=result["skipped"],
        created_at=db_import.created_at,
    )


TEACHER_ROLES = ["instructor", "researcher"]


def _is_all_access(current_user: dict) -> bool:
    """Researchers see every class; instructors are restricted to their own (UC4/Q4)."""
    return current_user.get("role") == "researcher"


async def _resolve_course_scope(
    db: AsyncSession, current_user: dict, course_id: Optional[int]
) -> tuple[Optional[int], Optional[list[int]]]:
    """Authorize the requested course and compute the caller's course scope.

    Returns (course_id, allowed_course_ids). `allowed_course_ids is None` means
    all-access (no restriction). Raises 403 if an instructor requests a course
    they don't teach.
    """
    if _is_all_access(current_user):
        return course_id, None
    allowed = await resolve_teacher_course_ids(db, uuid.UUID(str(current_user["id"])))
    if course_id is not None and course_id not in allowed:
        raise HTTPException(status_code=403, detail="You don't have access to this class.")
    return course_id, allowed


@router.get("/courses", response_model=List[CourseOut])
async def list_courses(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    """Classes for the report course selector, scoped to the caller (UC3/UC4)."""
    return await list_teacher_courses(
        db, uuid.UUID(str(current_user["id"])), _is_all_access(current_user)
    )


@router.get("/summary/teacher", response_model=TeacherSummary)
async def get_teacher_summary(
    course_id: Optional[int] = Query(None),
    quiz_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    """Cohort dashboard. Per-question breakdown is populated only when quiz_id is set."""
    course_id, allowed = await _resolve_course_scope(db, current_user, course_id)
    return await teacher_summary(db, course_id, quiz_id, allowed)


@router.get("/summary/teacher/students/{lms_user_id}", response_model=StudentReport)
async def get_student_drilldown(
    lms_user_id: int,
    course_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    course_id, _ = await _resolve_course_scope(db, current_user, course_id)
    return await student_report(db, [lms_user_id], course_id)


@router.get("/summary/teacher/students/{lms_user_id}/steps", response_model=StepTimeline)
async def get_student_steps(
    lms_user_id: int,
    quiz_id: int = Query(...),
    attempt_number: int = Query(...),
    slot_number: Optional[int] = Query(None, description="Filter to one question slot (UC5)"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    """Lazy-loaded RESPONSE_HISTORY timeline for one attempt (teacher-only detail)."""
    return await step_timeline(db, lms_user_id, quiz_id, attempt_number, slot_number)


@router.get("/quizzes/{quiz_id}/questions/{slot_number}", response_model=QuestionSlotDetail)
async def get_question_slot(
    quiz_id: int,
    slot_number: int,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(TEACHER_ROLES)),
):
    """Question metadata for one quiz slot, for the teacher timeline detail (UC5)."""
    detail = await question_slot_detail(db, quiz_id, slot_number)
    if detail is None:
        raise HTTPException(status_code=404, detail="Question slot not found")
    return detail


@router.get("/summary/student", response_model=StudentReport)
async def get_student_self_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student", "instructor", "researcher"])),
):
    """A student's own LMS report, resolved from their linked account.

    Same BOLA rule as student_logs: a student can only ever see their own data,
    resolved through matched_user_id — never a caller-supplied id.
    """
    user_id = current_user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="User ID not found in token")

    lms_user_ids = await resolve_matched_lms_user_ids(db, uuid.UUID(str(user_id)))
    if not lms_user_ids:
        raise HTTPException(
            status_code=404,
            detail="Your account isn't linked to any imported LMS data yet. Ask your instructor to import the latest export.",
        )
    return await student_report(db, lms_user_ids)

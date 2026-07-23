from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
import json
import uuid
import anyio
import math
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from typing import List, Optional

from app.core.security import RoleChecker
from app.core.database import get_db
from app.core.storage import get_s3_client
from app.core.config import settings
from app.core.dap_runner import evaluate_student_attempt, generate_feedback
from app.core.misconception import generate_ast_json, detect_misconceptions_best
from app.core.references import load_reference_asts, submission_prefix, upload_reference_file
from app.models.log import InteractionLog
from app.models.attempt import Attempt
from app.models.problem import Problem
from app.models.target import WeeklyTarget
from app.models.quiz_progress import QuizProgress
from app.models.remediation import RemediationSession
from app.core import remediation as rem
from app.routers.targets import as_utc, now_utc
from app.schemas.attempt import AttemptCreate, AttemptEvaluationResponse, AttemptResponse, RemediationSummary


# Router buat semua hal soal "attempt" = submission jawaban siswa.
# Endpoint intinya POST "" (submit + evaluasi + deteksi miskonsepsi + P/Q matrix).
router = APIRouter(prefix="/attempts", tags=["attempts"])

@router.get("", response_model=List[AttemptResponse])
async def list_attempts(
    user_id: Optional[str] = Query(None, description="Filter by user UUID"),
    task_ref: Optional[str] = Query(None, description="Filter by task_ref / problem key"),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "researcher"]))
):
    """Daftar semua attempt siswa (terbaru duluan). Khusus instruktur/peneliti.
    Bisa disaring pakai user_id dan/atau task_ref."""
    stmt = select(Attempt).order_by(Attempt.timestamp.desc())

    # Rakit filter opsional; dua-duanya digabung pakai AND kalau sama-sama diisi.
    conditions = []
    if user_id:
        conditions.append(Attempt.user_id == uuid.UUID(user_id))
    if task_ref:
        conditions.append(Attempt.task_ref == task_ref)
    
    if conditions:
        stmt = stmt.where(and_(*conditions))
    
    result = await db.execute(stmt)
    attempts = result.scalars().all()
    return attempts

@router.get("/{id}/code")
async def get_attempt_code(
    id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["instructor", "researcher", "student"]))
):
    """Ambil isi kode dari satu attempt (disimpan di MinIO, bukan di Postgres).
    Postgres cuma nyimpen pointer-nya (content_ref)."""
    stmt = select(Attempt).where(Attempt.id == id)
    res = await db.execute(stmt)
    attempt = res.scalar_one_or_none()
    if not attempt:
        raise HTTPException(status_code=404, detail="Attempt not found")

    # Cek izin: siswa cuma boleh lihat kodenya sendiri (cegah IDOR).
    if current_user["role"] == "student" and str(attempt.user_id) != current_user["id"]:
        raise HTTPException(status_code=403, detail="Forbidden")

    # Download from MinIO
    def download():
        s3 = get_s3_client()
        try:
            obj = s3.get_object(Bucket=settings.MINIO_BUCKET_NAME, Key=attempt.content_ref)
            return obj["Body"].read().decode("utf-8")
        except Exception as e:
            return None

    try:
        content = await anyio.to_thread.run_sync(download)
        if content is None:
            raise HTTPException(status_code=500, detail="Failed to retrieve code from storage")
        return {"code": content}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


async def upload_text_to_minio(key: str, body: str, content_type: str = "text/plain") -> str:
    def upload():
        s3 = get_s3_client()
        s3.put_object(
            Bucket=settings.MINIO_BUCKET_NAME,
            Key=key,
            Body=body.encode("utf-8"),
            ContentType=content_type
        )
        return key

    try:
        return await anyio.to_thread.run_sync(upload)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload submission to object storage: {str(e)}"
        )


async def upload_code_to_minio(code: str) -> str:
    return await upload_text_to_minio(f"attempts/{uuid.uuid4().hex}.dap", code)

@router.post("", response_model=AttemptEvaluationResponse, status_code=201)
async def create_attempt(
    attempt: AttemptCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # === ENDPOINT UTAMA fitur ini ===
    # Alur besarnya: cek izin/waktu → evaluasi kode → compile AST → deteksi
    # miskonsepsi → hitung P/Q matrix → simpan semuanya → balikin ke frontend.
    # Baca docs/fitur-misconception-pq-matrix.md buat gambaran lengkapnya.
    user_id = uuid.UUID(current_user["id"])

    # Cek jendela waktu + password lab buat target (tugas/sesi) yang punya soal ini.
    db_target = None
    if attempt.target_id is not None:
        target_res = await db.execute(select(WeeklyTarget).where(WeeklyTarget.id == attempt.target_id))
        db_target = target_res.scalar_one_or_none()

    if db_target is not None:
        now = now_utc()
        deadline = as_utc(db_target.deadline)
        if deadline and now >= deadline:
            raise HTTPException(
                status_code=403,
                detail="The deadline has passed. Submissions are closed and your grade has been finalized."
            )
        starts_at = as_utc(db_target.starts_at)
        if starts_at and now < starts_at:
            label = "lab session" if db_target.kind == "lab" else "homework assignment"
            raise HTTPException(status_code=403, detail=f"This {label} has not started yet.")
        if db_target.kind == "lab":
            if db_target.access_password and attempt.lab_password != db_target.access_password:
                raise HTTPException(status_code=403, detail="Invalid lab session password.")

    # Security check: verify student has completed the corresponding Intermediate Exercise.
    # Labs have no misconception probes, so the quiz gate only applies to homework.
    if db_target is None or db_target.kind != "lab":
        quiz_stmt = select(QuizProgress).where(
            and_(QuizProgress.user_id == user_id, QuizProgress.problem_key == attempt.task_ref)
        )
        quiz_res = await db.execute(quiz_stmt)
        quiz_progress = quiz_res.scalar_one_or_none()

        if quiz_progress is not None and quiz_progress.completed_at is None:
            raise HTTPException(
                status_code=403,
                detail="You have an active Intermediate Exercise quiz in progress. You must complete it before submitting homework attempts."
            )

        # Same gate for the misconception-remediation flow: a homework can't be
        # re-submitted while there is an incomplete remediation session for it.
        rem_stmt = select(RemediationSession).where(
            and_(RemediationSession.user_id == user_id, RemediationSession.problem_key == attempt.task_ref)
        )
        rem_res = await db.execute(rem_stmt)
        rem_session = rem_res.scalar_one_or_none()
        if rem_session is not None and rem_session.completed_at is None:
            raise HTTPException(
                status_code=403,
                detail="You have an active misconception remediation in progress. Clear it before submitting homework attempts."
            )

    # 1. Ambil data soal dari DB (bisa None kalau task_ref-nya gak kedaftar).
    problem_stmt = select(Problem).where(Problem.key == attempt.task_ref)
    problem_res = await db.execute(problem_stmt)
    db_problem = problem_res.scalars().first()

    # 2. Upload code to MinIO. Submissions live in the problem's folder
    # (problems/{id}_{key}/code_submission/) next to its reference solutions;
    # attempts without a matching problem row fall back to the flat attempts/ prefix.
    attempt_id = uuid.uuid4()
    if db_problem is not None:
        content_ref = await upload_text_to_minio(
            f"{submission_prefix(db_problem)}{attempt_id.hex}.dap", attempt.content
        )
    else:
        content_ref = await upload_code_to_minio(attempt.content)

    # Evaluasi kode lawan test case pakai DAP runner. Hasilnya dict berisi:
    # success (kompile jalan?), passed (semua test lulus?), compilation_error,
    # dan test_results per test case.
    eval_result = await evaluate_student_attempt(db_problem or attempt.task_ref, attempt.content)

    # 3. Compile AST-nya SEKALI aja terus simpan ke MinIO — analisis
    # selanjutnya (deteksi miskonsepsi, P-Matrix, review rater) tinggal baca
    # hasilnya, gak perlu manggil compiler lagi.
    ast_ref = None
    student_ast = None
    if eval_result["success"]:
        student_ast = await generate_ast_json(attempt.content)
        if student_ast is not None:
            ast_key = (
                f"{submission_prefix(db_problem)}{attempt_id.hex}.ast.json"
                if db_problem is not None
                else f"attempts/{attempt_id.hex}.ast.json"
            )
            ast_ref = await upload_text_to_minio(
                ast_key,
                json.dumps(student_ast),
                content_type="application/json"
            )

    # 4. Deteksi miskonsepsi: kumpulin dulu semua AST solusi referensi
    # (kandidat pembanding), baru diff kalau jawabannya salah.
    misconceptions = None
    candidate_asts = []
    if student_ast is not None and db_problem is not None:
        # Referensi dari MinIO: solusi resmi + submission siswa lain yang lulus.
        candidate_asts = [entry["ast"] for entry in await load_reference_asts(db_problem)]

        legacy_ast = db_problem.reference_ast
        if legacy_ast is None and db_problem.reference_solution:
            # Soal lama cuma nyimpen kode referensinya doang — compile sekali
            # di sini terus cache AST-nya di row problem biar gak diulang.
            legacy_ast = await generate_ast_json(db_problem.reference_solution)
            if legacy_ast is not None:
                db_problem.reference_ast = legacy_ast
        if legacy_ast is not None:
            candidate_asts.append(legacy_ast)

        # Diff-nya cuma jalan kalau jawabannya SALAH — jawaban benar gak
        # perlu dicariin miskonsepsinya.
        if not eval_result["passed"] and candidate_asts:
            detected = detect_misconceptions_best(student_ast, candidate_asts)
            misconceptions = detected or None

    # 5. Hitung Q-Matrix, P-Matrix, dan skor kemiripannya.
    #    Q-Matrix = konsep apa aja yang DIWAJIBKAN soal (dari kc_tags).
    #    P-Matrix = konsep apa aja yang BENERAN muncul di kode siswa.
    q_matrix = None
    p_matrix = None
    matrix_similar = None
    if db_problem is not None:
        # Urutan slot vektornya tetap: CO, VA, OP, EX, IO, CD, LO.
        concepts = ["CO", "VA", "OP", "EX", "IO", "CD", "LO"]
        problem_kcs = [c.strip().upper() for c in db_problem.kc_tags.split(",") if c.strip()]

        # Bangun Q-Matrix dari tag KC yang nempel di soal.
        q_matrix = [0] * 7
        for i, concept in enumerate(concepts):
            if concept in problem_kcs:
                q_matrix[i] = 1

        p_matrix = q_matrix.copy()
        if not eval_result["success"]:
            # Kodenya aja gagal compile — semua konsep wajib dianggap gagal.
            for i in range(len(p_matrix)):
                if q_matrix[i] == 1:
                    p_matrix[i] = 0
        else:
            from app.DAP.build_pmatrix import get_pmatrix_from_ast
            # Deteksi kehadiran konsep WAJIB pakai AST mentah (normalize=False):
            # normalisasi nge-inline assignment sekali-pakai (misal
            # `sum <- a + b + c` dilipat ke dalam `write`), jadi konsep VA-nya
            # bisa "hilang". Kalau compile ulangnya gagal, fallback ke student_ast.
            raw_student_ast = await generate_ast_json(attempt.content, normalize=False)
            p_matrix = get_pmatrix_from_ast(raw_student_ast or student_ast, candidate_asts, q_matrix)

            # Kalau ada konsep wajib yang gak muncul di kode siswa, submission
            # dianggap gagal verifikasi dan konsep yang hilang dilaporin
            # sebagai miskonsepsi "XX-MISSING".
            if p_matrix != q_matrix:
                eval_result["passed"] = False
                if misconceptions is None:
                    misconceptions = []
                concept_names = {
                    "CO": "Constant", "VA": "Variable", "OP": "Operation",
                    "EX": "Expression", "IO": "Input/Output", "CD": "Conditional", "LO": "Loop"
                }
                for i in range(len(q_matrix)):
                    if q_matrix[i] == 1 and p_matrix[i] == 0:
                        mc = concepts[i]
                        # Jangan dobel: kalau diff AST udah nemuin miskonsepsi
                        # di konsep yang sama, gak usah ditambahin lagi.
                        if not any(m.get("code", "").startswith(mc) for m in misconceptions):
                            misconceptions.append({
                                "code": f"{mc}-MISSING",
                                "title": f"Missing {concept_names.get(mc, mc)} Logic",
                                "description": f"Your code is missing required logic for {concept_names.get(mc, mc)}.",
                                "detail": f"Your code is missing required logic for {concept_names.get(mc, mc)}. Please revise your code to include this logic.",
                                "buggy_expr": "Missing code"
                            })
                            
            # Kasus lain: konsepnya lengkap semua TAPI test case-nya ada yang
            # gagal — berarti pemakaian konsepnya masih salah, jadi semua
            # konsep wajib tetep dinolkan di P-Matrix.
            elif not eval_result["passed"]:
                for i in range(len(p_matrix)):
                    if q_matrix[i] == 1:
                        p_matrix[i] = 0

        # Cosine similarity antara P dan Q: 1.0 = kode siswa nyentuh semua
        # konsep yang diwajibkan. Ambangnya 0.70 buat flag matrix_similar.
        dot_product = sum(p * q for p, q in zip(p_matrix, q_matrix))
        norm_p = math.sqrt(sum(p * p for p in p_matrix))
        norm_q = math.sqrt(sum(q * q for q in q_matrix))
        if norm_p > 0 and norm_q > 0:
            similarity = dot_product / (norm_p * norm_q)
        else:
            # Salah satu vektornya nol semua — cosine-nya gak kedefinisi,
            # jadi cukup cek sama persis atau nggak.
            similarity = 1.0 if p_matrix == q_matrix else 0.0
        matrix_similar = (similarity >= 0.70)

    # 6. Simpan detail attempt ke Postgres. Kode & AST-nya sendiri ada di
    # MinIO — di sini cuma pointer-nya (content_ref, ast_ref) + hasil analisis.
    # Origin marker: "practicum" for lab targets, "practice" for homework; None
    # when the attempt carries no target (kept as "Uncategorized" in reports).
    attempt_context = None
    if db_target is not None:
        attempt_context = "practicum" if db_target.kind == "lab" else "practice"

    db_attempt = Attempt(
        id=attempt_id,
        user_id=uuid.UUID(current_user["id"]),
        modality="pseudocode",
        task_ref=attempt.task_ref,
        content_ref=content_ref,
        source=attempt.source,
        confidence_level=attempt.confidence_level,
        passed=eval_result["passed"],
        ast_ref=ast_ref,
        misconceptions=misconceptions,
        context=attempt_context,
        target_id=attempt.target_id,
    )
    db.add(db_attempt)

    # Submission yang lulus disimpan jadi solusi referensi baru — makin banyak
    # variasi jawaban benar, makin adil deteksi miskonsepsi buat siswa berikutnya.
    if eval_result["passed"] and db_problem is not None and student_ast is not None:
        try:
            ref_filename = f"student_{attempt_id.hex}.dap"
            await upload_reference_file(db_problem, ref_filename, attempt.content, student_ast)
        except Exception as e:
            logging.getLogger(__name__).warning("Failed to save passing student submission as reference: %s", e)

    feedback = None

    # Catat event submission ke InteractionLog (buat jejak aktivitas/riset).
    submission_log = InteractionLog(
        actor=current_user["id"],
        event_type="submission",
        payload={
            "attempt_id": str(db_attempt.id),
            "task_ref": db_attempt.task_ref,
            "passed": db_attempt.passed
        }
    )
    db.add(submission_log)

    # Miskonsepsi yang kedeteksi juga dicatat ke InteractionLog buat keperluan
    # riset (nanti di-review sama rater), lengkap dengan rujukan attempt & AST-nya.
    if misconceptions:
        misconception_log = InteractionLog(
            actor=current_user["id"],
            event_type="misconception",
            payload={
                "attempt_id": str(db_attempt.id),
                "task_ref": db_attempt.task_ref,
                "ast_ref": ast_ref,
                "misconceptions": [
                    {
                        "code": m.get("code", "UNKNOWN"),
                        "title": m.get("title", "Unknown Misconception"),
                        "description": m.get("description", ""),
                        "detail": m.get("detail", ""),
                        "buggy_expr": m.get("buggy_expr", "")
                    }
                    for m in misconceptions
                ]
            }
        )
        db.add(misconception_log)

    # Kick off (or refresh) the sequential misconception-remediation flow. Only for
    # non-lab homework that failed and carries misconception tags. Tags are ordered
    # by detection (e.g. LO then CD); an optional dummy SQ round can be appended for
    # testing (REMEDIATION_DUMMY_SQ). See core/remediation.py.
    remediation_summary = None
    is_lab = db_target is not None and db_target.kind == "lab"
    if not is_lab and not eval_result["passed"] and misconceptions:
        rem_tags = rem.ordered_tags_from_misconceptions(misconceptions)
        rem_session = await rem.upsert_session(db, user_id, attempt.task_ref, rem_tags)
        if rem_session is not None:
            await db.flush()  # ensure a freshly-added session is queryable before normalize
            await rem.normalize_session(db, rem_session)
            tags = list(rem_session.tags or [])
            current_tag = tags[rem_session.current_index] if rem_session.current_index < len(tags) else None
            remediation_summary = RemediationSummary(
                active=rem_session.completed_at is None,
                completed=rem_session.completed_at is not None,
                tags=tags,
                current_tag=current_tag,
            )

    await db.commit()
    await db.refresh(db_attempt)

    # Balikin semua hasil ke frontend dalam satu paket: verdict evaluasi,
    # miskonsepsi (buat "Logic Hints"), dan P/Q matrix + skor kemiripannya.
    return AttemptEvaluationResponse(
        attempt=db_attempt,
        success=eval_result["success"],
        passed=eval_result["passed"],
        compilation_error=eval_result["compilation_error"],
        test_results=eval_result["test_results"],
        feedback=feedback,
        misconceptions=misconceptions,
        p_matrix=p_matrix,
        q_matrix=q_matrix,
        matrix_similar=matrix_similar,
        remediation=remediation_summary
    )

@router.post("/speech", response_model=AttemptResponse, status_code=201)
async def create_speech_attempt(
    task_ref: str = Form(...),
    source: str = Form(...),
    confidence_level: float | None = Form(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    raise HTTPException(status_code=501, detail="POST /attempts/speech is not implemented yet")


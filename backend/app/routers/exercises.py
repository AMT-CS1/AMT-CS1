from fastapi import APIRouter, Depends, HTTPException
import uuid
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.state import StudentModelState
from app.models.hint_quiz import HintQuizQuestion
from app.models.quiz_progress import QuizProgress
from app.models.feedback import Feedback
from app.models.log import InteractionLog
from app.schemas.internal import ProblemRequestPayload
from app.routers.internal import mock_problem_request
from app.core.security import RoleChecker
from app.core.database import get_db
from app.schemas.exercise import (
    ExerciseRequest, ExerciseResponse,
    GenerateExercisesRequest, GenerateExercisesResponse, QuizQuestionSchema,
    QuizFeedbackRequest, QuizFeedbackResponse, QuizFeedbackRatingRequest,
    ConfirmQuestionRequest, ConfirmQuestionResponse,
    ConfirmJudgeRequest, ConfirmJudgeResponse
)
from app.schemas.quiz_progress import QuizCompleteRequest, QuizProgressResponse
from app.core.llm import get_llm_provider, heuristic_understanding_score

logger = logging.getLogger("app.exercises")

# Router buat alur hint quiz / Misconception Probe: bikin soal konsep, simpan
# progres siswa, simpan feedback + ratingnya, plus alur "konfirmasi pemahaman"
# (pertanyaan lanjutan "kenapa/gimana" + penilaiannya).

# Skor pemahaman minimal (persen) yang harus dicapai siswa di pertanyaan
# konfirmasi biar jawaban benarnya dihitung "paham beneran". Di bawah ini
# dianggap belum paham, dan frontend lanjut ke soal probe berikutnya.
UNDERSTANDING_THRESHOLD = 70

router = APIRouter(prefix="/exercises", tags=["exercises"])

# Bank soal cadangan (statis, bilingual) yang dipakai kalau LLM gak tersedia
# atau gagal. Dikelompokin per jenis tugas: swap-variables, factorial, generic.
STATIC_FALLBACK_QUIZZES = {
  'swap-variables': [
    {
      "type": "mc",
      "text_en": "If x <- 5 and y <- 10 initially, what are the values of x and y after running the following pseudocode?",
      "text_id": "Jika awalnya x <- 5 dan y <- 10, berapakah nilai x dan y setelah menjalankan pseudocode berikut?",
      "code": "temp <- x\nx <- y\ny <- temp",
      "options_en": [
        "x = 5, y = 10",
        "x = 10, y = 5",
        "x = 5, y = 5",
        "x = 10, y = 10"
      ],
      "options_id": [
        "x = 5, y = 10",
        "x = 10, y = 5",
        "x = 5, y = 5",
        "x = 10, y = 10"
      ],
      "answer": "B",
      "explanation_en": "A temp variable stores the initial value of x (5), then x takes y's value (10), and y takes temp's stored value (5). This swaps the two variables.",
      "explanation_id": "Variabel temp menyimpan nilai awal dari x (5), kemudian x mengambil nilai y (10), dan y mengambil nilai temp yang tersimpan (5). Ini menukar nilai kedua variabel."
    },
    {
      "type": "sa",
      "text_en": "In DAP pseudocode, which character operator sequence is used to perform variable assignment (e.g., storing a value)?",
      "text_id": "Dalam pseudocode DAP, urutan karakter operator mana yang digunakan untuk melakukan penugasan variabel (misalnya, menyimpan nilai)?",
      "code": None,
      "options_en": None,
      "options_id": None,
      "answer": "<-",
      "explanation_en": "The arrow operator <- is used in DAP to assign values to variables.",
      "explanation_id": "Operator panah <- digunakan dalam DAP untuk menetapkan nilai ke variabel."
    },
    {
      "type": "mc",
      "text_en": "Why do we need a temporary helper variable (temp) to swap the values of two variables x and y?",
      "text_id": "Mengapa kita memerlukan variabel pembantu sementara (temp) untuk menukar nilai dari dua variabel x dan y?",
      "options_en": [
        "To prevent losing the original value of x when we overwrite it with y.",
        "Because DAP pseudocode compiler requires at least 3 variables to run.",
        "To speed up the compilation and program execution time.",
        "To declare the temp variable as a global buffer."
      ],
      "options_id": [
        "Untuk mencegah hilangnya nilai asli x ketika kita menimpanya dengan y.",
        "Karena compiler pseudocode DAP membutuhkan setidaknya 3 variabel untuk dijalankan.",
        "Untuk mempercepat waktu kompilasi dan eksekusi program.",
        "Untuk mendeklarasikan variabel temp sebagai buffer global."
      ],
      "answer": "A",
      "explanation_en": "If we assign x <- y directly without saving x's original value, we overwrite x and lose its value forever, preventing us from assigning it to y.",
      "explanation_id": "Jika kita menetapkan x <- y secara langsung tanpa menyimpan nilai asli x, kita menimpa x dan kehilangan nilainya selamanya, mencegah kita menetapkannya ke y."
    }
  ],
  'factorial': [
    {
      "type": "mc",
      "text_en": "What will be the final value of fact if we execute the loop with input n = 4?",
      "text_id": "Berapakah nilai akhir dari fact jika kita mengeksekusi loop dengan input n = 4?",
      "code": "fact <- 1\ni <- 1\nwhile i <= n do\n    fact <- fact * i\n    i <- i + 1\nendwhile",
      "options_en": [
        "24",
        "12",
        "6",
        "1"
      ],
      "options_id": [
        "24",
        "12",
        "6",
        "1"
      ],
      "answer": "A",
      "explanation_en": "For n = 4, the loop multiplies fact by 1, 2, 3, and 4 sequentially: 1 * 1 * 2 * 3 * 4 = 24.",
      "explanation_id": "Untuk n = 4, loop mengalikan fact dengan 1, 2, 3, dan 4 secara berurutan: 1 * 1 * 2 * 3 * 4 = 24."
    },
    {
      "type": "sa",
      "text_en": "In the factorial algorithm, what is the initial value of the accumulator variable 'fact'?",
      "text_id": "Dalam algoritma faktorial, berapakah nilai awal dari variabel akumulator 'fact'?",
      "code": None,
      "options_en": None,
      "options_id": None,
      "answer": "1",
      "explanation_en": "The variable 'fact' is initialized to 1 because 1 is the multiplicative identity. Initializing to 0 would cause all subsequent multiplications to result in 0.",
      "explanation_id": "Variabel 'fact' diinisialisasi ke 1 karena 1 adalah identitas perkalian. Menginisialisasi ke 0 akan menyebabkan semua perkalian berikutnya menghasilkan 0."
    },
    {
      "type": "mc",
      "text_en": "What type of loop is used in the provided factorial algorithm?",
      "text_id": "Jenis loop apa yang digunakan dalam algoritma faktorial yang disediakan?",
      "options_en": [
        "while loop",
        "for loop",
        "repeat-until loop",
        "infinite loop"
      ],
      "options_id": [
        "while loop",
        "for loop",
        "repeat-until loop",
        "infinite loop"
      ],
      "answer": "A",
      "explanation_en": "The algorithm uses a 'while' loop block structure: 'while i <= n do ... endwhile'.",
      "explanation_id": "Algoritma menggunakan struktur blok 'while' loop: 'while i <= n do ... endwhile'."
    }
  ],
  'generic': [
    {
      "type": "mc",
      "text_en": "Which of the following is a key element of structured programming used to repeat a block of code?",
      "text_id": "Manakah dari berikut ini yang merupakan elemen kunci dari pemrograman terstruktur yang digunakan untuk mengulang blok kode?",
      "options_en": [
        "Iteration (loops)",
        "Selection (if-else)",
        "Sequence",
        "Variables"
      ],
      "options_id": [
        "Iterasi (loops)",
        "Seleksi (if-else)",
        "Sekuensial",
        "Variabel"
      ],
      "answer": "A",
      "explanation_en": "Iteration (loops) are used to repeat execution of a block of code.",
      "explanation_id": "Iterasi (loops) digunakan untuk mengulang eksekusi blok kode."
    },
    {
      "type": "sa",
      "text_en": "What is the name of the section in a DAP program where variables are declared?",
      "text_id": "Apakah nama bagian dalam program DAP tempat variabel dideklarasikan?",
      "code": None,
      "options_en": None,
      "options_id": None,
      "answer": "dictionary",
      "explanation_en": "Variables in a DAP program must be declared inside the 'dictionary' block.",
      "explanation_id": "Variabel dalam program DAP harus dideklarasikan di dalam blok 'dictionary'."
    },
    {
      "type": "mc",
      "text_en": "What does a syntax error mean in programming?",
      "text_id": "Apakah arti dari syntax error dalam pemrograman?",
      "options_en": [
        "The code violates the grammar rules of the programming language.",
        "The code runs but produces the wrong output.",
        "The program runs too slowly.",
        "The database connection failed."
      ],
      "options_id": [
        "Kode melanggar aturan tata bahasa (grammar) dari bahasa pemrograman.",
        "Kode berjalan tetapi menghasilkan output yang salah.",
        "Program berjalan terlalu lambat.",
        "Koneksi database gagal."
      ],
      "answer": "A",
      "explanation_en": "A syntax error occurs when the code does not conform to the spelling and grammar rules of the programming language, preventing it from compiling.",
      "explanation_id": "Syntax error terjadi ketika kode tidak sesuai dengan ejaan dan aturan tata bahasa dari bahasa pemrograman, mencegahnya untuk dikompilasi."
    }
  ]
}

@router.post("/intermediate", response_model=ExerciseResponse)
async def request_intermediate_exercise(
    exercise_req: ExerciseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    stmt = select(StudentModelState).where(
        StudentModelState.user_id == uuid.UUID(current_user["id"])
    ).order_by(StudentModelState.updated_at.desc())
    state_res = await db.execute(stmt)
    latest_state = state_res.scalars().first()
    state_id = latest_state.id if latest_state else None

    payload = ProblemRequestPayload(
        learner_state_ref=state_id,
        kc_focus=exercise_req.kc_focus,
        current_difficulty=exercise_req.difficulty or "medium"
    )
    problem_res = await mock_problem_request(payload)

    if problem_res.status == "no_match":
        raise HTTPException(
            status_code=404,
            detail=f"Problem Generation Fallback: {problem_res.reason}"
        )

    return ExerciseResponse(
        exercise_id=problem_res.exercise_id,
        kc_focus=problem_res.kc_focus,
        problem_statement=problem_res.problem_statement,
        difficulty=problem_res.difficulty
    )

@router.post("/generate", response_model=GenerateExercisesResponse)
async def generate_exercises(
    req: GenerateExercisesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # Bikin (atau ambil) 3 soal hint quiz buat satu soal. Urutan prioritasnya:
    # cache DB dulu → kalau kurang, generate pakai LLM → kalau LLM gak ada/gagal,
    # pakai soal statis. Apapun sumbernya, hasilnya disimpan ke DB biar
    # konsisten & bisa dipakai lagi.
    problem_key = req.problem_key or "generic"

    # Pastikan ada baris progres kuis buat siswa ini (dibikin kalau belum ada).
    user_id = uuid.UUID(current_user["id"])
    progress_stmt = select(QuizProgress).where(
        and_(QuizProgress.user_id == user_id, QuizProgress.problem_key == problem_key)
    )
    progress_res = await db.execute(progress_stmt)
    progress = progress_res.scalar_one_or_none()
    if not progress:
        progress = QuizProgress(
            user_id=user_id,
            problem_key=problem_key,
            questions_answered=0,
            completed_at=None
        )
        db.add(progress)
        await db.commit()
    
    # 1. Cek cache di DB dulu. Kalau udah ada >= 3 soal, langsung pakai itu
    #    (hemat, dan soalnya konsisten buat semua siswa di problem yang sama).
    stmt = select(HintQuizQuestion).where(HintQuizQuestion.problem_key == problem_key)
    res = await db.execute(stmt)
    db_questions = res.scalars().all()

    if len(db_questions) >= 3:
        logger.info(f"Returning cached hint quizzes from database for key: {problem_key}")
        questions = [
            QuizQuestionSchema(
                type=q.type,
                text_en=q.text_en or q.text or "",
                text_id=q.text_id or q.text or "",
                code=q.code,
                options_en=q.options_en or q.options or [],
                options_id=q.options_id or q.options or [],
                answer=q.answer,
                explanation_en=q.explanation_en or q.explanation or "",
                explanation_id=q.explanation_id or q.explanation or ""
            ) for q in db_questions
        ]
        return GenerateExercisesResponse(questions=questions[:3])

    # 2. Tebak jenis tugasnya dari nama problem_key, buat milih bank soal
    #    statis yang paling nyambung kalau nanti kepaksa fallback.
    task_ref = "generic"
    ref = problem_key.lower()
    if "swap" in ref or "variables" in ref:
        task_ref = "swap-variables"
    elif "loop" in ref or "factorial" in ref:
        task_ref = "factorial"

    # Siapin soal cadangannya (belum tentu kepakai).
    fallback_questions = STATIC_FALLBACK_QUIZZES.get(task_ref, STATIC_FALLBACK_QUIZZES["generic"])

    # Kalau providernya Dummy (gak ada LLM beneran), langsung pakai soal statis.
    llm = get_llm_provider()
    if llm.__class__.__name__ == "DummyLLMProvider":
        logger.info("Using static exercises fallback (DummyLLMProvider configured)")
        fallback_schemas = []
        for item in fallback_questions:
            q_schema = QuizQuestionSchema(
                type=item.get("type", "mc"),
                text_en=item.get("text_en", ""),
                text_id=item.get("text_id", ""),
                code=item.get("code"),
                options_en=item.get("options_en"),
                options_id=item.get("options_id"),
                answer=str(item.get("answer", "")),
                explanation_en=item.get("explanation_en", ""),
                explanation_id=item.get("explanation_id", "")
            )
            fallback_schemas.append(q_schema)
            db_q = HintQuizQuestion(
                problem_key=problem_key,
                type=q_schema.type,
                text=q_schema.text_en,
                code=q_schema.code,
                options=q_schema.options_en,
                answer=q_schema.answer,
                explanation=q_schema.explanation_en,
                text_en=q_schema.text_en,
                text_id=q_schema.text_id,
                options_en=q_schema.options_en,
                options_id=q_schema.options_id,
                explanation_en=q_schema.explanation_en,
                explanation_id=q_schema.explanation_id
            )
            db.add(db_q)
        await db.commit()
        return GenerateExercisesResponse(questions=fallback_schemas)

    # 3. Coba generate lewat LLM beneran. Kalau sukses, simpan ke DB terus
    #    balikin; kalau lempar exception, ketangkep di except di bawah.
    try:
        data = await llm.generate_misconception_probe(
            kc_focus=req.kc_focus,
            problem_title=req.problem_title,
            problem_description=req.problem_description,
            lang=req.lang or "en"
        )

        questions = []
        for item in data:
            questions.append(
                QuizQuestionSchema(
                    type=item.get("type", "mc"),
                    text_en=item.get("text_en", ""),
                    text_id=item.get("text_id", ""),
                    code=item.get("code"),
                    options_en=item.get("options_en"),
                    options_id=item.get("options_id"),
                    answer=str(item.get("answer", "")),
                    explanation_en=item.get("explanation_en", ""),
                    explanation_id=item.get("explanation_id", "")
                )
            )

        # Save generated to DB
        for q in questions:
            db_q = HintQuizQuestion(
                problem_key=problem_key,
                type=q.type,
                text=q.text_en,
                code=q.code,
                options=q.options_en,
                answer=q.answer,
                explanation=q.explanation_en,
                text_en=q.text_en,
                text_id=q.text_id,
                options_en=q.options_en,
                options_id=q.options_id,
                explanation_en=q.explanation_en,
                explanation_id=q.explanation_id
            )
            db.add(db_q)
        await db.commit()
        return GenerateExercisesResponse(questions=questions)

    except Exception as e:
        # 4. LLM-nya ngambek — jangan bikin siswa gagal, mundur ke soal statis.
        logger.warning(f"Failed to generate exercises via LLM: {e}. Falling back to pre-defined static questions.")

        fallback_schemas = []
        for item in fallback_questions:
            q_schema = QuizQuestionSchema(
                type=item.get("type", "mc"),
                text_en=item.get("text_en", ""),
                text_id=item.get("text_id", ""),
                code=item.get("code"),
                options_en=item.get("options_en"),
                options_id=item.get("options_id"),
                answer=str(item.get("answer", "")),
                explanation_en=item.get("explanation_en", ""),
                explanation_id=item.get("explanation_id", "")
            )
            fallback_schemas.append(q_schema)
            
            db_q = HintQuizQuestion(
                problem_key=problem_key,
                type=q_schema.type,
                text=q_schema.text_en,
                code=q_schema.code,
                options=q_schema.options_en,
                answer=q_schema.answer,
                explanation=q_schema.explanation_en,
                text_en=q_schema.text_en,
                text_id=q_schema.text_id,
                options_en=q_schema.options_en,
                options_id=q_schema.options_id,
                explanation_en=q_schema.explanation_en,
                explanation_id=q_schema.explanation_id
            )
            db.add(db_q)
        await db.commit()
        return GenerateExercisesResponse(questions=fallback_schemas)

@router.get("/status/{problem_key}", response_model=QuizProgressResponse)
async def get_quiz_status(
    problem_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # Status kuis siswa buat satu soal: udah selesai, lagi jalan, atau belum mulai.
    # Dipakai attempts.py buat "gate" — homework gak boleh disubmit kalau masih
    # ada kuis yang lagi jalan.
    user_id = uuid.UUID(current_user["id"])
    stmt = select(QuizProgress).where(
        and_(QuizProgress.user_id == user_id, QuizProgress.problem_key == problem_key)
    )
    res = await db.execute(stmt)
    progress = res.scalar_one_or_none()

    if progress:
        # completed_at keisi = udah kelar; masih None = lagi jalan.
        completed = progress.completed_at is not None
        in_progress = progress.completed_at is None
        return QuizProgressResponse(
            completed=completed,
            in_progress=in_progress,
            questions_answered=progress.questions_answered,
            completed_at=progress.completed_at
        )
    return QuizProgressResponse(
        completed=False,
        in_progress=False,
        questions_answered=0
    )

@router.post("/complete", response_model=QuizProgressResponse)
async def complete_quiz(
    req: QuizCompleteRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # Tandain kuis selesai. Syaratnya ketiga soal harus udah dijawab.
    user_id = uuid.UUID(current_user["id"])

    if req.questions_answered < 3:
        raise HTTPException(status_code=400, detail="Must answer all 3 questions to complete the quiz.")

    stmt = select(QuizProgress).where(
        and_(QuizProgress.user_id == user_id, QuizProgress.problem_key == req.problem_key)
    )
    res = await db.execute(stmt)
    progress = res.scalar_one_or_none()

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if progress:
        progress.questions_answered = req.questions_answered
        progress.completed_at = now
    else:
        progress = QuizProgress(
            user_id=user_id,
            problem_key=req.problem_key,
            questions_answered=req.questions_answered,
            completed_at=now
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)

    return QuizProgressResponse(
        completed=True,
        in_progress=False,
        questions_answered=progress.questions_answered,
        completed_at=progress.completed_at
    )


@router.post("/feedback", response_model=QuizFeedbackResponse, status_code=201)
async def save_quiz_feedback(
    payload: QuizFeedbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    """
    Saves the pre-generated Socratic feedback (created during hint-quiz
    generation) when a student answers a question incorrectly, so it can be
    rated and analyzed. No extra LLM call happens here.
    """
    user_id = uuid.UUID(current_user["id"])
    feedback_text = payload.feedback_text

    # Store feedback in the feedbacks table
    db_feedback = Feedback(
        user_id=user_id,
        problem_key=payload.problem_key,
        question_text=payload.question_text,
        student_answer=payload.student_answer,
        feedback_text=feedback_text
    )
    db.add(db_feedback)
    await db.flush()  # assign the feedback id before referencing it in the log

    # Record the event in interaction_logs, referencing the generated feedback
    db_log = InteractionLog(
        actor=str(user_id),
        event_type="feedback",
        payload={
            "feedback_id": str(db_feedback.id),
            "problem_key": payload.problem_key,
            "question_text": payload.question_text,
            "student_answer": payload.student_answer,
            "lang": payload.lang or "en",
        }
    )
    db.add(db_log)

    await db.commit()
    await db.refresh(db_feedback)
    
    return QuizFeedbackResponse(
        id=db_feedback.id,
        feedback_text=db_feedback.feedback_text
    )


@router.post("/feedback/{feedback_id}/rate")
async def rate_quiz_feedback(
    feedback_id: uuid.UUID,
    rate_payload: QuizFeedbackRatingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    user_id = uuid.UUID(current_user["id"])
    
    stmt = select(Feedback).where(Feedback.id == feedback_id)
    res = await db.execute(stmt)
    db_feedback = res.scalar_one_or_none()
    
    if not db_feedback:
        raise HTTPException(status_code=404, detail="Feedback not found")
        
    # Cek kepemilikan: siswa cuma boleh nge-rate feedback miliknya sendiri (cegah IDOR/BOLA).
    if db_feedback.user_id != user_id:
        raise HTTPException(status_code=403, detail="Forbidden: You are not authorized to rate this feedback")

    # Rating cuma boleh 1 (👍) atau -1 (👎).
    if rate_payload.rating not in [1, -1]:
        raise HTTPException(status_code=400, detail="Invalid rating value. Must be 1 or -1")
        
    db_feedback.rating = rate_payload.rating
    await db.commit()
    return {"status": "success", "rating": db_feedback.rating}


@router.post("/confirm/generate", response_model=ConfirmQuestionResponse)
async def generate_confirmation_question(
    req: ConfirmQuestionRequest,
    current_user: dict = Depends(RoleChecker(["student"]))
):
    """
    After a student answers a Misconception Probe question correctly, generate a
    reflective "why/how" follow-up so the system can verify genuine understanding
    (rather than a lucky guess) before letting them advance.
    """
    llm = get_llm_provider()
    try:
        data = await llm.generate_confirmation_question(
            question_text=req.question_text,
            student_answer=req.student_answer,
            kc_focus=req.kc_focus,
            lang=req.lang or "en",
        )
        return ConfirmQuestionResponse(
            question_en=data["question_en"],
            question_id=data.get("question_id") or data["question_en"],
        )
    except Exception as e:
        # Never block the learning flow on an LLM failure — fall back to a
        # generic reflective prompt that still elicits the student's reasoning.
        logger.warning(f"Failed to generate confirmation question via LLM: {e}. Using static fallback.")
        return ConfirmQuestionResponse(
            question_en="Correct! In your own words, why is that the right answer? Walk me through your reasoning.",
            question_id="Benar! Dengan kata-katamu sendiri, mengapa itu jawaban yang tepat? Jelaskan alasanmu.",
        )


@router.post("/confirm/judge", response_model=ConfirmJudgeResponse)
async def judge_confirmation(
    req: ConfirmJudgeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    """
    Score how well the student's free-text explanation demonstrates real
    understanding (0-100%). A score below UNDERSTANDING_THRESHOLD is treated as
    "not yet understood": the frontend then advances to the next probe question.
    The judgement is logged for research/analysis.
    """
    user_id = uuid.UUID(current_user["id"])
    llm = get_llm_provider()

    try:
        result = await llm.judge_understanding(
            confirm_question=req.confirm_question,
            student_explanation=req.student_explanation,
            question_text=req.question_text,
            student_answer=req.student_answer,
            kc_focus=req.kc_focus,
            lang=req.lang or "en",
        )
    except Exception as e:
        # Degrade gracefully to a heuristic score rather than failing the request.
        logger.warning(f"Failed to judge understanding via LLM: {e}. Using heuristic fallback.")
        result = heuristic_understanding_score(req.student_explanation, req.student_answer)

    score = max(0, min(100, int(result.get("score", 0))))
    passed = score >= UNDERSTANDING_THRESHOLD

    # Log the confirmation judgement for later analysis (research signal).
    db_log = InteractionLog(
        actor=str(user_id),
        event_type="confirmation",
        payload={
            "problem_key": req.problem_key,
            "kc_focus": req.kc_focus,
            "question_text": req.question_text,
            "confirm_question": req.confirm_question,
            "student_answer": req.student_answer,
            "student_explanation": req.student_explanation,
            "score": score,
            "passed": passed,
            "threshold": UNDERSTANDING_THRESHOLD,
            "lang": req.lang or "en",
        }
    )
    db.add(db_log)
    await db.commit()

    return ConfirmJudgeResponse(
        score=score,
        passed=passed,
        threshold=UNDERSTANDING_THRESHOLD,
        feedback_en=result.get("feedback_en", ""),
        feedback_id=result.get("feedback_id") or result.get("feedback_en", ""),
    )


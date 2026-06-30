from fastapi import APIRouter, Depends, HTTPException
import uuid
import json
import logging
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.models.state import StudentModelState
from app.models.hint_quiz import HintQuizQuestion
from app.models.quiz_progress import QuizProgress
from app.schemas.internal import ProblemRequestPayload
from app.routers.internal import mock_problem_request
from app.core.security import RoleChecker
from app.core.database import get_db
from app.schemas.exercise import (
    ExerciseRequest, ExerciseResponse, 
    GenerateExercisesRequest, GenerateExercisesResponse, QuizQuestionSchema
)
from app.schemas.quiz_progress import QuizCompleteRequest, QuizProgressResponse
from app.core.llm import get_llm_provider, generate_intermediate_exercises

logger = logging.getLogger("app.exercises")

router = APIRouter(prefix="/exercises", tags=["exercises"])

STATIC_FALLBACK_QUIZZES = {
  'swap-variables': [
    {
      "type": "mc",
      "text": "If x <- 5 and y <- 10 initially, what are the values of x and y after running the following pseudocode?",
      "code": "temp <- x\nx <- y\ny <- temp",
      "options": [
        "x = 5, y = 10",
        "x = 10, y = 5",
        "x = 5, y = 5",
        "x = 10, y = 10"
      ],
      "answer": "B",
      "explanation": "A temp variable stores the initial value of x (5), then x takes y's value (10), and y takes temp's stored value (5). This swaps the two variables."
    },
    {
      "type": "sa",
      "text": "In DAP pseudocode, which character operator sequence is used to perform variable assignment (e.g., storing a value)?",
      "answer": "<-",
      "explanation": "The arrow operator <- is used in DAP to assign values to variables."
    },
    {
      "type": "mc",
      "text": "Why do we need a temporary helper variable (temp) to swap the values of two variables x and y?",
      "options": [
        "To prevent losing the original value of x when we overwrite it with y.",
        "Because DAP pseudocode compiler requires at least 3 variables to run.",
        "To speed up the compilation and program execution time.",
        "To declare the temp variable as a global buffer."
      ],
      "answer": "A",
      "explanation": "If we assign x <- y directly without saving x's original value, we overwrite x and lose its value forever, preventing us from assigning it to y."
    }
  ],
  'factorial': [
    {
      "type": "mc",
      "text": "What will be the final value of fact if we execute the loop with input n = 4?",
      "code": "fact <- 1\ni <- 1\nwhile i <= n do\n    fact <- fact * i\n    i <- i + 1\nendwhile",
      "options": [
        "24",
        "12",
        "6",
        "1"
      ],
      "answer": "A",
      "explanation": "For n = 4, the loop multiplies fact by 1, 2, 3, and 4 sequentially: 1 * 1 * 2 * 3 * 4 = 24."
    },
    {
      "type": "sa",
      "text": "In the factorial algorithm, what is the initial value of the accumulator variable 'fact'?",
      "answer": "1",
      "explanation": "The variable 'fact' is initialized to 1 because 1 is the multiplicative identity. Initializing to 0 would cause all subsequent multiplications to result in 0."
    },
    {
      "type": "mc",
      "text": "What type of loop is used in the provided factorial algorithm?",
      "options": [
        "while loop",
        "for loop",
        "repeat-until loop",
        "infinite loop"
      ],
      "answer": "A",
      "explanation": "The algorithm uses a 'while' loop block structure: 'while i <= n do ... endwhile'."
    }
  ],
  'generic': [
    {
      "type": "mc",
      "text": "Which of the following is a key element of structured programming used to repeat a block of code?",
      "options": [
        "Iteration (loops)",
        "Selection (if-else)",
        "Sequence",
        "Variables"
      ],
      "answer": "A",
      "explanation": "Iteration (loops) are used to repeat execution of a block of code."
    },
    {
      "type": "sa",
      "text": "What is the name of the section in a DAP program where variables are declared?",
      "answer": "dictionary",
      "explanation": "Variables in a DAP program must be declared inside the 'dictionary' block."
    },
    {
      "type": "mc",
      "text": "What does a syntax error mean in programming?",
      "options": [
        "The code violates the grammar rules of the programming language.",
        "The code runs but produces the wrong output.",
        "The program runs too slowly.",
        "The database connection failed."
      ],
      "answer": "A",
      "explanation": "A syntax error occurs when the code does not conform to the spelling and grammar rules of the programming language, preventing it from compiling."
    }
  ]
}

@router.post("/intermediate", response_model=ExerciseResponse)
async def request_intermediate_exercise(
    exercise_req: ExerciseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    # Get student model state
    stmt = select(StudentModelState).where(
        StudentModelState.user_id == uuid.UUID(current_user["id"])
    ).order_by(StudentModelState.updated_at.desc())
    state_res = await db.execute(stmt)
    latest_state = state_res.scalars().first()
    state_id = latest_state.id if latest_state else None

    # Call mock problem-request endpoint
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
    """
    Generates exactly 3 Intermediate Exercises (IE) using the configured LLM API.
    Checks the database first; if not present, generates and saves them.
    """
    problem_key = req.problem_key or "generic"
    
    # Ensure QuizProgress is initialized for this student and problem key (marks starting the quiz)
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
    
    # 1. Check DB first
    stmt = select(HintQuizQuestion).where(HintQuizQuestion.problem_key == problem_key)
    res = await db.execute(stmt)
    db_questions = res.scalars().all()
    
    if len(db_questions) >= 3:
        logger.info(f"Returning cached hint quizzes from database for key: {problem_key}")
        questions = [
            QuizQuestionSchema(
                type=q.type,
                text=q.text,
                code=q.code,
                options=q.options,
                answer=q.answer,
                explanation=q.explanation
            ) for q in db_questions
        ]
        return GenerateExercisesResponse(questions=questions[:3])

    # 2. Identify task type for fallback matching
    task_ref = "generic"
    ref = problem_key.lower()
    if "swap" in ref or "variables" in ref:
        task_ref = "swap-variables"
    elif "loop" in ref or "factorial" in ref:
        task_ref = "factorial"

    # Get the static questions for fallback
    fallback_questions = STATIC_FALLBACK_QUIZZES.get(task_ref, STATIC_FALLBACK_QUIZZES["generic"])

    llm = get_llm_provider()
    # Check if we should use the LLM provider
    if llm.__class__.__name__ == "DummyLLMProvider":
        logger.info("Using static exercises fallback (DummyLLMProvider configured)")
        # Cache fallback in DB
        fallback_schemas = []
        for item in fallback_questions:
            q_schema = QuizQuestionSchema(
                type=item.get("type", "mc"),
                text=item.get("text", ""),
                code=item.get("code"),
                options=item.get("options"),
                answer=str(item.get("answer", "")),
                explanation=item.get("explanation", "")
            )
            fallback_schemas.append(q_schema)
            db_q = HintQuizQuestion(
                problem_key=problem_key,
                type=q_schema.type,
                text=q_schema.text,
                code=q_schema.code,
                options=q_schema.options,
                answer=q_schema.answer,
                explanation=q_schema.explanation
            )
            db.add(db_q)
        await db.commit()
        return GenerateExercisesResponse(questions=fallback_schemas)

    try:
        data = await generate_intermediate_exercises(
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
                    text=item.get("text", ""),
                    code=item.get("code"),
                    options=item.get("options"),
                    answer=str(item.get("answer", "")),
                    explanation=item.get("explanation", "")
                )
            )

        # Save generated to DB
        for q in questions:
            db_q = HintQuizQuestion(
                problem_key=problem_key,
                type=q.type,
                text=q.text,
                code=q.code,
                options=q.options,
                answer=q.answer,
                explanation=q.explanation
            )
            db.add(db_q)
        await db.commit()
        return GenerateExercisesResponse(questions=questions)

    except Exception as e:
        logger.warning(f"Failed to generate exercises via LLM: {e}. Falling back to pre-defined static questions.")
        
        # Save fallback to DB so we don't have to keep falling back/trying LLM again
        fallback_schemas = []
        for item in fallback_questions:
            q_schema = QuizQuestionSchema(
                type=item.get("type", "mc"),
                text=item.get("text", ""),
                code=item.get("code"),
                options=item.get("options"),
                answer=str(item.get("answer", "")),
                explanation=item.get("explanation", "")
            )
            fallback_schemas.append(q_schema)
            
            db_q = HintQuizQuestion(
                problem_key=problem_key,
                type=q_schema.type,
                text=q_schema.text,
                code=q_schema.code,
                options=q_schema.options,
                answer=q_schema.answer,
                explanation=q_schema.explanation
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
    """Check whether the current student has completed the IE quiz for a given problem key."""
    user_id = uuid.UUID(current_user["id"])
    stmt = select(QuizProgress).where(
        and_(QuizProgress.user_id == user_id, QuizProgress.problem_key == problem_key)
    )
    res = await db.execute(stmt)
    progress = res.scalar_one_or_none()

    if progress:
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
    """Mark the IE quiz as completed for the current student and problem key."""
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

from fastapi import APIRouter, Depends
import uuid
from app.schemas.internal import (
    FeedbackRequestPayload, FeedbackResponsePayload,
    ProblemRequestPayload, ProblemResponsePayload
)
from app.core.security import RoleChecker

router = APIRouter(prefix="/internal", tags=["internal"])

@router.post("/feedback-request", response_model=FeedbackResponsePayload)
async def mock_feedback_request(
    payload: FeedbackRequestPayload,
    current_user: dict = Depends(RoleChecker(["instructor", "researcher"]))
):
    # Handle the fallback case
    if "fallback" in payload.kc_focus.lower() or "loop" in payload.kc_focus.lower() or "lo" in payload.kc_focus.lower():
        return FeedbackResponsePayload(
            status="no_match",
            feedback_text=None,
            reason="No matched tutoring pattern or misconception case found for this KC focus."
        )
    
    # Return canned success response
    return FeedbackResponsePayload(
        status="success",
        feedback_text=(
            "Mock Vertical Feedback: Great attempt! However, make sure you store "
            "the original value of your variables before overwriting them."
        ),
        reason=None
    )

@router.post("/problem-request", response_model=ProblemResponsePayload)
async def mock_problem_request(
    payload: ProblemRequestPayload,
    current_user: dict = Depends(RoleChecker(["instructor", "researcher"]))
):
    # Handle the fallback case
    if "fallback" in payload.kc_focus.lower() or "loop" in payload.kc_focus.lower() or "lo" in payload.kc_focus.lower():
        return ProblemResponsePayload(
            status="no_match",
            exercise_id=None,
            kc_focus=None,
            problem_statement=None,
            difficulty=None,
            reason="No tailored problem generator template found for the given KC focus."
        )
    
    # Return canned success response
    return ProblemResponsePayload(
        status="success",
        exercise_id=uuid.UUID("33333333-3333-3333-3333-333333333333"),
        kc_focus=payload.kc_focus,
        problem_statement=(
            "Mock Vertical Problem: Write a program that reads a number `n` and "
            "outputs its double."
        ),
        difficulty=payload.current_difficulty or "medium",
        reason=None
    )

from fastapi import APIRouter, Depends, HTTPException
from app.core.security import RoleChecker
from app.schemas.tutoring import TutoringFeedbackRequest, TutoringFeedbackResponse

router = APIRouter(prefix="/tutoring", tags=["tutoring"])

@router.post("/feedback", response_model=TutoringFeedbackResponse)
async def generate_tutoring_feedback(
    feedback_req: TutoringFeedbackRequest,
    current_user: dict = Depends(RoleChecker(["student", "instructor", "rater"]))
):
    raise HTTPException(status_code=501, detail="POST /tutoring/feedback is not implemented yet")

from fastapi import APIRouter, Depends, HTTPException
from app.core.security import RoleChecker
from app.core.config import settings
from app.core.rate_limiter import rate_limit
from app.schemas.tutoring import TutoringFeedbackRequest, TutoringFeedbackResponse

router = APIRouter(prefix="/tutoring", tags=["tutoring"])

@router.post(
    "/feedback",
    response_model=TutoringFeedbackResponse,
    dependencies=[Depends(rate_limit("tutoring", settings.RATE_LIMIT_TUTORING_PER_MIN, 60))]
)
async def generate_tutoring_feedback(
    feedback_req: TutoringFeedbackRequest,
    current_user: dict = Depends(RoleChecker(["student", "instructor", "rater"]))
):
    raise HTTPException(status_code=501, detail="POST /tutoring/feedback is not implemented yet")

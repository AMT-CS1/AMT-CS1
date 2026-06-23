from pydantic import BaseModel
import uuid

class TutoringFeedbackRequest(BaseModel):
    attempt_id: uuid.UUID
    context: str | None = None

class TutoringFeedbackResponse(BaseModel):
    episode_id: uuid.UUID
    feedback_text: str
    status: str

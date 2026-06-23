from pydantic import BaseModel
import uuid
from datetime import datetime

class TutoringEpisodeReview(BaseModel):
    episode_id: uuid.UUID
    user_id: uuid.UUID
    action_type: str
    generated_output_ref: str
    status: str
    created_at: datetime
    verdict: str | None = None
    checks: dict | None = None

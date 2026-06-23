from pydantic import BaseModel
import uuid
from datetime import datetime

class StudentProgressResponse(BaseModel):
    user_id: uuid.UUID
    kc_mastery: dict
    misconception_risk: dict
    evidence_confidence: float
    last_updated: datetime

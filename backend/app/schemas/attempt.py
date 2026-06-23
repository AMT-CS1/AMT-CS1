from pydantic import BaseModel
from datetime import datetime
import uuid

class AttemptCreate(BaseModel):
    task_ref: str
    content: str
    source: str
    confidence_level: float | None = None

class AttemptResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    task_ref: str
    modality: str
    content_ref: str
    source: str
    timestamp: datetime
    confidence_level: float | None

    class Config:
        from_attributes = True

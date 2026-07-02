from pydantic import BaseModel
import uuid
from datetime import datetime
from typing import Dict, Any

class StudentInteractionLogCreate(BaseModel):
    event_type: str
    payload: Dict[str, Any]

class StudentInteractionLogResponse(BaseModel):
    id: uuid.UUID
    actor: str
    event_type: str
    payload: Dict[str, Any]
    timestamp: datetime

    class Config:
        from_attributes = True

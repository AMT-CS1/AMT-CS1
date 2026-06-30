from pydantic import BaseModel
import uuid
from datetime import datetime

class TargetCreate(BaseModel):
    course_ref: str
    week: int
    topic_kc_focus: str
    target_task: str
    source: str
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None

class TargetResponse(BaseModel):
    id: uuid.UUID
    course_ref: str
    week: int
    topic_kc_focus: str
    target_task: str
    source: str
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None

    class Config:
        from_attributes = True

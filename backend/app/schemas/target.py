from pydantic import BaseModel
import uuid

class TargetCreate(BaseModel):
    course_ref: str
    week: int
    topic_kc_focus: str
    target_task: str
    source: str

class TargetResponse(BaseModel):
    id: uuid.UUID
    course_ref: str
    week: int
    topic_kc_focus: str
    target_task: str
    source: str

    class Config:
        from_attributes = True

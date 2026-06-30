from pydantic import BaseModel
import uuid
from datetime import datetime


class QuizCompleteRequest(BaseModel):
    problem_key: str
    questions_answered: int = 3


class QuizProgressResponse(BaseModel):
    completed: bool
    in_progress: bool
    questions_answered: int = 0
    completed_at: datetime | None = None

    class Config:
        from_attributes = True

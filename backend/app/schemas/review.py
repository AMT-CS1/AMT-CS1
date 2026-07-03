from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime

from app.schemas.attempt import MisconceptionSchema

class TutoringEpisodeReview(BaseModel):
    episode_id: uuid.UUID
    user_id: uuid.UUID
    action_type: str
    generated_output_ref: str
    status: str
    created_at: datetime
    verdict: str | None = None
    checks: dict | None = None

class ReviewAttemptSummary(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    task_ref: str
    problem_title: Optional[str] = None
    passed: Optional[bool] = False
    timestamp: datetime
    has_ast: bool = False
    misconceptions: List[MisconceptionSchema] = Field(default_factory=list)

class ReviewReferenceFile(BaseModel):
    filename: str
    content: Optional[str] = None
    ast: Optional[dict] = None

class ReviewProblemContext(BaseModel):
    key: str
    title: str
    description_en: str
    reference_solution: Optional[str] = None
    reference_ast: Optional[dict] = None
    references: List[ReviewReferenceFile] = Field(default_factory=list)

class ReviewAttemptDetail(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    task_ref: str
    passed: Optional[bool] = False
    timestamp: datetime
    confidence_level: Optional[float] = None
    student_code: Optional[str] = None
    student_ast: Optional[dict] = None
    misconceptions: List[MisconceptionSchema] = Field(default_factory=list)
    problem: Optional[ReviewProblemContext] = None

class ReviewFeedbackItem(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    username: str
    problem_key: str
    problem_title: Optional[str] = None
    question_text: str
    student_answer: str
    feedback_text: str
    student_rating: Optional[int] = None
    timestamp: datetime
    expert_verdict: Optional[bool] = None
    verdict_timestamp: Optional[datetime] = None

class FeedbackVerdictRequest(BaseModel):
    helpful: bool

class FeedbackVerdictResponse(BaseModel):
    feedback_id: uuid.UUID
    helpful: bool
    rating_id: uuid.UUID
    timestamp: datetime

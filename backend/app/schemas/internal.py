from pydantic import BaseModel
import uuid
from typing import Optional, Any

class FeedbackRequestPayload(BaseModel):
    attempt_id: uuid.UUID
    learner_state_ref: Optional[uuid.UUID] = None
    kc_focus: str
    code: str
    eval_results: dict

class FeedbackResponsePayload(BaseModel):
    status: str  # "success" or "no_match"
    feedback_text: Optional[str] = None
    reason: Optional[str] = None

class ProblemRequestPayload(BaseModel):
    learner_state_ref: Optional[uuid.UUID] = None
    kc_focus: str
    current_difficulty: Optional[str] = "medium"

class ProblemResponsePayload(BaseModel):
    status: str  # "success" or "no_match"
    exercise_id: Optional[uuid.UUID] = None
    kc_focus: Optional[str] = None
    problem_statement: Optional[str] = None
    difficulty: Optional[str] = None
    reason: Optional[str] = None

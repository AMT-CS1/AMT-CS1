from pydantic import BaseModel, ConfigDict
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
    randomize_problems: bool = False
    kind: str = "homework"  # homework | lab
    starts_at: datetime | None = None  # labs only
    access_password: str | None = None  # labs only

class TargetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    course_ref: str
    week: int
    topic_kc_focus: str
    target_task: str
    source: str
    title: str | None = None
    description: str | None = None
    deadline: datetime | None = None
    randomize_problems: bool = False
    kind: str = "homework"
    starts_at: datetime | None = None
    # Nulled for non-instructors by the router; students only get requires_password.
    access_password: str | None = None
    requires_password: bool = False

class TargetUnlockRequest(BaseModel):
    password: str

class TargetGradeResponse(BaseModel):
    target_id: uuid.UUID
    kind: str
    total_problems: int
    solved_problems: int
    grade: int  # 0-100
    deadline: datetime | None = None
    solved_keys: list[str] = []

class ProblemReviewItem(BaseModel):
    problem_key: str
    problem_title: str
    last_submitted_at: datetime | None = None
    student_code: str | None = None
    reference_code: str | None = None
    misconceptions: list[dict] = []

class TargetGradeReviewResponse(BaseModel):
    target_id: uuid.UUID
    kind: str
    total_problems: int
    solved_problems: int
    grade: int  # 0-100
    deadline: datetime | None = None
    solved_keys: list[str] = []
    problem_reviews: list[ProblemReviewItem] | None = None

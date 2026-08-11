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
    # Problem-set selection: "kc" (dynamic KC overlap), "manual" (explicit picks),
    # "random" (server draws N once from the pool and freezes the set).
    selection_mode: str = "kc"
    problem_count: int | None = None  # NULL => default 3
    problem_keys: list[str] = []      # used by "manual" mode: the picked problem keys
    random_pool: str = "kc"           # used by "random" mode: "kc" (matching KC pool) | "all"
    is_published: bool = True         # checkpoints/labs typically start unpublished

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
    selection_mode: str = "kc"
    problem_count: int | None = None
    is_published: bool = True
    # Resolved assigned problem keys (server-computed) so the client stops re-deriving.
    problem_keys: list[str] = []

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


# --- Self-review route (R1) --------------------------------------------------
# A student's own per-problem review, available the moment they submit (unlike
# the grade endpoint's problem_reviews, which stay hidden until the deadline).
# Reference solutions remain deadline-gated so early submitters can't harvest them.

class TargetReviewItem(BaseModel):
    problem_key: str
    problem_title: str
    solved: bool = False
    attempts_count: int = 0
    last_submitted_at: datetime | None = None
    student_code: str | None = None
    reference_code: str | None = None  # populated only after the deadline
    misconceptions: list[dict] = []


class TargetReviewResponse(BaseModel):
    target_id: uuid.UUID
    kind: str
    week: int
    title: str | None = None
    deadline: datetime | None = None
    total_problems: int
    solved_problems: int
    problem_reviews: list[TargetReviewItem] = []

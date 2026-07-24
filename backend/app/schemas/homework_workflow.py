import uuid
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime
from typing import List, Optional

class HomeworkStatusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    weekly_target_id: uuid.UUID
    week: int
    topic_kc_focus: str
    title: Optional[str] = None
    deadline: Optional[datetime] = None
    mp_status: str  # "red" (locked), "green" (available), "yellow" (accessible only after something else - N/A for MP), "completed"
    ps_status: str  # "red" (locked), "green" (available), "yellow" (locked; accessible only after MP completion), "completed"


class MPQuestionResponse(BaseModel):
    id: uuid.UUID
    misconception_tag: str
    text_en: str
    text_id: str
    code: Optional[str] = None
    options_en: List[str] = []
    options_id: List[str] = []


class MPSessionStatusResponse(BaseModel):
    active: bool
    completed: bool
    weekly_target_id: uuid.UUID
    tag_queue: List[str] = []
    current_index: int = 0
    total_questions: int = 0
    attempts_on_current: int = 0
    max_attempts: int = 3
    current_question: Optional[MPQuestionResponse] = None


class MPSubmitRequest(BaseModel):
    weekly_target_id: uuid.UUID
    question_id: uuid.UUID
    selected_option: str = Field(..., description="Option chosen: 'A', 'B', 'C', or 'D'")
    text_input: Optional[str] = Field(None, description="Explanation text, required/used if 'D' is selected")
    lang: Optional[str] = "en"


class MPSubmitResponse(BaseModel):
    correct: bool
    explanation_en: Optional[str] = None
    explanation_id: Optional[str] = None
    session_status: MPSessionStatusResponse


# Analytics Schemas

class StudentSummaryReport(BaseModel):
    user_id: uuid.UUID
    username: str
    mp_status: str
    mp_score: Optional[float] = None
    ps_status: str
    ps_score: Optional[float] = None
    completed: bool
    last_active_at: Optional[datetime] = None


class ClassReportResponse(BaseModel):
    weekly_target_id: uuid.UUID
    week: int
    topic_kc_focus: str
    students: List[StudentSummaryReport]


class MisconceptionCount(BaseModel):
    misconception_tag: str
    triggered_count: int
    total_attempts: int
    student_count: int  # how many unique students triggered it


class HeatmapResponse(BaseModel):
    weekly_target_id: uuid.UUID
    week: int
    topic_kc_focus: str
    misconceptions: List[MisconceptionCount]


class StudentMPAttemptDetail(BaseModel):
    misconception_tag: str
    question_text: str
    selected_option: str
    text_input: Optional[str] = None
    status: str  # "correct", "incorrect"
    timestamp: datetime


class StudentPSAttemptDetail(BaseModel):
    problem_key: str
    problem_title: str
    passed: bool
    submitted_at: datetime
    code: Optional[str] = None
    misconceptions_triggered: List[str] = []


class StudentDrilldownResponse(BaseModel):
    user_id: uuid.UUID
    username: str
    weekly_target_id: uuid.UUID
    week: int
    mp_attempts: List[StudentMPAttemptDetail]
    ps_attempts: List[StudentPSAttemptDetail]


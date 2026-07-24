from pydantic import BaseModel
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional


class UnmatchedParticipant(BaseModel):
    """An LMS student with no linked local account (their student view won't work yet)."""
    course_id: int
    lms_user_id: int
    username: Optional[str] = None
    email: Optional[str] = None
    firstname: Optional[str] = None
    lastname: Optional[str] = None

    class Config:
        from_attributes = True


class LmsImportResponse(BaseModel):
    id: uuid.UUID
    filename: str
    status: str
    storage_ref: Optional[str] = None
    row_counts: Optional[Dict[str, int]] = None
    unmatched_count: int
    created_at: datetime

    class Config:
        from_attributes = True


class LmsImportResult(LmsImportResponse):
    """POST response: the import record plus the unmatched students themselves."""
    unmatched_participants: List[UnmatchedParticipant] = []


# ---- Class (course) selector ----

class CourseOut(BaseModel):
    course_id: int
    shortname: Optional[str] = None
    fullname: Optional[str] = None
    fakultas: Optional[str] = None
    prodi: Optional[str] = None
    tahun_ajar: Optional[str] = None
    student_count: int = 0


# ---- Teacher cohort summary ----

class TeacherKpis(BaseModel):
    students_attempted: int
    students_enrolled: int
    total_attempts: int
    avg_attempts_per_student: Optional[float] = None
    avg_best_grade: Optional[float] = None
    correct_rate: Optional[float] = None  # distinct students eventually correct / attempted


class QuizOverview(BaseModel):
    quiz_id: int
    name: Optional[str] = None
    total_questions: Optional[int] = None
    students_attempted: int
    avg_best_grade: Optional[float] = None


class QuestionStat(BaseModel):
    slot_number: int
    question_name: Optional[str] = None
    students_attempted: int
    students_correct: int
    correct_rate: Optional[float] = None
    misconception_tags: Optional[List[str]] = None


class MisconceptionStat(BaseModel):
    tag: str
    name: str
    wrong_count: int


class StudentRosterRow(BaseModel):
    lms_user_id: int
    name: Optional[str] = None
    username: Optional[str] = None
    matched: bool
    attempts: int
    best_grade: Optional[float] = None
    correct_rate: Optional[float] = None  # correct submissions / total submissions


class TeacherSummary(BaseModel):
    scope: Dict[str, Optional[int]]
    kpis: TeacherKpis
    quizzes: List[QuizOverview]
    per_question: List[QuestionStat]
    misconceptions: List[MisconceptionStat]
    students: List[StudentRosterRow]


# ---- Per-student detail (teacher drill-down + student self view) ----

class StudentKpis(BaseModel):
    quizzes_attempted: int
    total_attempts: int
    avg_attempts_per_quiz: Optional[float] = None
    correct_submissions: int
    total_submissions: int
    correct_rate: Optional[float] = None


class StudentQuestionDetail(BaseModel):
    slot_number: int
    question_name: Optional[str] = None
    question_text: Optional[str] = None  # UC6: the actual question body, not just answers
    question_type: Optional[str] = None
    attempts: int
    final_state: Optional[str] = None
    final_grade: Optional[float] = None
    student_answer: Optional[str] = None
    right_answer: Optional[str] = None
    misconception_tags: Optional[List[str]] = None


class StudentQuizDetail(BaseModel):
    quiz_id: int
    name: Optional[str] = None
    attempts_used: int
    best_grade: Optional[float] = None
    last_grade: Optional[float] = None
    max_grade: Optional[float] = None
    correct_submissions: int
    total_submissions: int
    questions: List[StudentQuestionDetail]


class StudentMisconception(BaseModel):
    tag: str
    name: str
    wrong_count: int
    occurrences: List[Dict[str, int]] = []


class StudentReport(BaseModel):
    student: Dict[str, Any]
    kpis: StudentKpis
    quizzes: List[StudentQuizDetail]
    misconceptions: List[StudentMisconception]


# ---- Response-step timeline (teacher-only) ----

class ResponseStepOut(BaseModel):
    slot_number: int
    step: int
    time: Optional[datetime] = None
    action: Optional[str] = None
    state: Optional[str] = None
    marks: Optional[float] = None
    coderunner_output: Optional[str] = None


class StepTimeline(BaseModel):
    quiz_id: int
    lms_user_id: int
    attempt_number: int
    steps: List[ResponseStepOut]


class QuestionSlotDetail(BaseModel):
    quiz_id: int
    slot_number: int
    question_id: Optional[int] = None
    name: Optional[str] = None
    type: Optional[str] = None
    text: Optional[str] = None
    misconception_tags: Optional[List[str]] = None

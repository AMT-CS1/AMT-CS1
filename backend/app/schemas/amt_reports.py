"""Schemas for the AMT-CS1 native interaction reports (the `attempts` data),
the in-tutor counterpart to the LMS reports in `lms_reports.py`.

Two viewer shapes, both built from the same per-context "block":
- Student self view — `AmtStudentReport` (own practice + practicum blocks).
- Teacher view — `AmtTeacherSummary` (cohort) + `AmtStudentDetail` (drill-down).
"""
from pydantic import BaseModel
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional


# ---- Per-context block (shared by student self + teacher drill-down) ----

class AmtAttempt(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    passed: Optional[bool] = None
    confidence_level: Optional[float] = None
    misconception_tags: List[str] = []


class AmtProblemDetail(BaseModel):
    task_ref: str
    title: Optional[str] = None
    attempts_count: int
    solved: bool
    first_solved_at: Optional[datetime] = None
    attempts: List[AmtAttempt] = []


class AmtMisconceptionStat(BaseModel):
    tag: str
    name: str
    count: int


# ---- P5/R3: misconception profile + study recommendations ----

class AmtMisconceptionProfileItem(BaseModel):
    """One concept's fused MP + PS evidence. Shape is a superset of
    AmtMisconceptionStat so MisconceptionPanel renders it unchanged."""
    tag: str
    name: str
    count: int
    mp_count: int
    ps_count: int
    codes: List[str] = []
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None


class AmtRecommendationItem(BaseModel):
    tag: str
    name: str
    topic_area: str
    count: int
    study_focus: str
    evidence: str  # "quiz" | "code" | "both"


class AmtBlockKpis(BaseModel):
    problems_attempted: int
    problems_solved: int
    total_attempts: int
    solve_rate: Optional[float] = None
    avg_attempts_per_problem: Optional[float] = None


class AmtBlock(BaseModel):
    kpis: AmtBlockKpis
    problems: List[AmtProblemDetail] = []
    misconceptions: List[AmtMisconceptionStat] = []


# ---- Student self view ----

class AmtStudentReport(BaseModel):
    student: Dict[str, Any]
    practice: AmtBlock
    practicum: AmtBlock


# ---- Teacher drill-down (student self blocks + remediation) ----

class AmtRemediationStatus(BaseModel):
    problem_key: str
    tags: List[str] = []
    completed: bool
    current_index: int


class AmtStudentDetail(BaseModel):
    student: Dict[str, Any]
    practice: AmtBlock
    practicum: AmtBlock
    remediation: List[AmtRemediationStatus] = []
    # P5/R3: the same overall homework profile the student sees in My History.
    misconception_profile: List[AmtMisconceptionProfileItem] = []
    recommendations: List[AmtRecommendationItem] = []


# ---- Teacher cohort summary ----

class AmtTeacherKpis(BaseModel):
    students_active: int
    students_enrolled: int
    total_attempts: int
    avg_attempts_per_student: Optional[float] = None
    solve_rate: Optional[float] = None  # distinct (student, problem) solved / attempted
    remediation_started: int = 0
    remediation_completed: int = 0


class AmtProblemStat(BaseModel):
    task_ref: str
    title: Optional[str] = None
    attempts: int
    students_attempted: int
    students_solved: int
    solve_rate: Optional[float] = None
    top_misconception: Optional[str] = None


class AmtStudentRosterRow(BaseModel):
    user_id: uuid.UUID
    name: Optional[str] = None
    username: Optional[str] = None
    matched: bool
    attempts: int
    problems_solved: int
    solve_rate: Optional[float] = None
    last_active: Optional[datetime] = None


class AmtTeacherSummary(BaseModel):
    scope: Dict[str, Any]
    kpis: AmtTeacherKpis
    problems: List[AmtProblemStat] = []
    misconceptions: List[AmtMisconceptionStat] = []
    students: List[AmtStudentRosterRow] = []

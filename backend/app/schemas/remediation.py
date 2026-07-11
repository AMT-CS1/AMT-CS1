import uuid
from pydantic import BaseModel, Field
from typing import List, Optional


class MisconceptionQuestionSchema(BaseModel):
    """A multiple-choice question served to the student. The correct answer is
    deliberately NOT included — grading happens server-side."""
    id: uuid.UUID
    text_en: str
    text_id: str
    code: Optional[str] = None
    options_en: List[str] = []
    options_id: List[str] = []


class RemediationStatusResponse(BaseModel):
    active: bool = False          # an incomplete session exists
    completed: bool = False       # every tag has been cleared
    problem_key: str              # the homework being remediated
    tags: List[str] = []          # ordered, de-duplicated tags to clear
    current_index: int = 0
    total_tags: int = 0
    current_tag: Optional[str] = None
    current_tag_name: Optional[str] = None
    current_question: Optional[MisconceptionQuestionSchema] = None


class RemediationSubmitRequest(BaseModel):
    problem_key: str = Field(..., max_length=100)   # the homework
    question_id: uuid.UUID                           # the question being answered
    answer_index: int                                # index of the chosen option
    lang: Optional[str] = "en"


class RemediationSubmitResponse(BaseModel):
    correct: bool
    explanation_en: Optional[str] = None
    explanation_id: Optional[str] = None
    status: RemediationStatusResponse

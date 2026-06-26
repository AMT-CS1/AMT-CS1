from pydantic import BaseModel, Field
from datetime import datetime
from typing import List, Optional
import uuid

class AttemptCreate(BaseModel):
    task_ref: str = Field(..., max_length=100)
    content: str = Field(..., max_length=50000)
    source: str = Field(..., max_length=100)
    confidence_level: float | None = None

class AttemptResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    task_ref: str
    modality: str
    content_ref: str
    source: str
    timestamp: datetime
    confidence_level: float | None

    class Config:
        from_attributes = True

class TestCaseResultSchema(BaseModel):
    test_case_index: int
    input: str
    expected: str
    actual: str
    passed: bool
    error: Optional[str] = None

class AttemptEvaluationResponse(BaseModel):
    attempt: AttemptResponse
    success: bool
    passed: bool
    compilation_error: Optional[str] = None
    test_results: List[TestCaseResultSchema]
    feedback: Optional[str] = None


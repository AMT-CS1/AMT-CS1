from pydantic import BaseModel, Field
from typing import List
import uuid

class TestCaseSchema(BaseModel):
    input: str
    expected: str

class ProblemCreate(BaseModel):
    key: str = Field(..., max_length=100)
    title: str = Field(..., max_length=255)
    description: str
    starter_code: str
    test_cases: List[TestCaseSchema]

class ProblemResponse(BaseModel):
    id: uuid.UUID
    key: str
    title: str
    description: str
    starter_code: str
    test_cases: List[TestCaseSchema]

    class Config:
        from_attributes = True

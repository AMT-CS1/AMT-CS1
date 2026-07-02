from pydantic import BaseModel, Field
from typing import List
import uuid

class TestCaseSchema(BaseModel):
    input: str
    expected: str

class ProblemCreate(BaseModel):
    key: str = Field(..., max_length=100)
    title: str = Field(..., max_length=255)
    description_en: str
    description_id: str
    starter_code: str
    test_cases: List[TestCaseSchema]
    kc_tags: str = Field(default="", max_length=255)
    reference_solution: str | None = None

class ProblemResponse(BaseModel):
    id: uuid.UUID
    key: str
    title: str
    description_en: str
    description_id: str
    starter_code: str
    test_cases: List[TestCaseSchema]
    kc_tags: str
    # Reference solution is only populated for instructors; the routers null
    # it out for other roles so students never receive the answer.
    reference_solution: str | None = None

    class Config:
        from_attributes = True

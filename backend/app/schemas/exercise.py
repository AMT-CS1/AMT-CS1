from pydantic import BaseModel
import uuid

class ExerciseRequest(BaseModel):
    kc_focus: str
    difficulty: str | None = "medium"

class ExerciseResponse(BaseModel):
    exercise_id: uuid.UUID
    kc_focus: str
    problem_statement: str
    difficulty: str

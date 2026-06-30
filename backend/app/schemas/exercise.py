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

class QuizQuestionSchema(BaseModel):
    type: str # "mc" or "sa"
    text: str
    code: str | None = None
    options: list[str] | None = None
    answer: str
    explanation: str

class GenerateExercisesRequest(BaseModel):
    kc_focus: str
    problem_key: str | None = None
    problem_title: str | None = None
    problem_description: str | None = None
    lang: str | None = "en"

class GenerateExercisesResponse(BaseModel):
    questions: list[QuizQuestionSchema]


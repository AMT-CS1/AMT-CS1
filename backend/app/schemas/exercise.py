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
    text_en: str
    text_id: str
    code: str | None = None
    options_en: list[str] | None = None
    options_id: list[str] | None = None
    answer: str
    explanation_en: str
    explanation_id: str

class GenerateExercisesRequest(BaseModel):
    kc_focus: str
    problem_key: str | None = None
    problem_title: str | None = None
    problem_description: str | None = None
    lang: str | None = "en"

class GenerateExercisesResponse(BaseModel):
    questions: list[QuizQuestionSchema]


class QuizFeedbackRequest(BaseModel):
    problem_key: str
    question_text: str
    student_answer: str
    # Pre-generated Socratic feedback (created together with the quiz question);
    # the endpoint stores it for rating/research instead of generating a new one.
    feedback_text: str
    lang: str | None = "en"


class QuizFeedbackResponse(BaseModel):
    id: uuid.UUID
    feedback_text: str


class QuizFeedbackRatingRequest(BaseModel):
    rating: int  # 1 or -1


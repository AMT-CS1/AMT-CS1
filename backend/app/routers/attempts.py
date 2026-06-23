from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
import uuid
from app.core.security import RoleChecker
from app.schemas.attempt import AttemptCreate, AttemptResponse

router = APIRouter(prefix="/attempts", tags=["attempts"])

@router.post("", response_model=AttemptResponse, status_code=201)
async def create_attempt(
    attempt: AttemptCreate,
    current_user: dict = Depends(RoleChecker(["student"]))
):
    raise HTTPException(status_code=501, detail="POST /attempts is not implemented yet")

@router.post("/speech", response_model=AttemptResponse, status_code=201)
async def create_speech_attempt(
    task_ref: str = Form(...),
    source: str = Form(...),
    confidence_level: float | None = Form(None),
    file: UploadFile = File(...),
    current_user: dict = Depends(RoleChecker(["student"]))
):
    raise HTTPException(status_code=501, detail="POST /attempts/speech is not implemented yet")

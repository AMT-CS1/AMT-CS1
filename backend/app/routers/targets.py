from fastapi import APIRouter, Depends, HTTPException
from app.core.security import RoleChecker
from app.schemas.target import TargetCreate, TargetResponse

router = APIRouter(prefix="/targets", tags=["targets"])

@router.post("", response_model=TargetResponse, status_code=201)
async def configure_weekly_target(
    target: TargetCreate,
    current_user: dict = Depends(RoleChecker(["instructor"]))
):
    raise HTTPException(status_code=501, detail="POST /targets is not implemented yet")

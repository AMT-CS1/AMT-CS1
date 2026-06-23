from fastapi import APIRouter, Depends, HTTPException
from typing import List
from app.core.security import RoleChecker
from app.schemas.review import TutoringEpisodeReview

router = APIRouter(prefix="/review", tags=["review"])

@router.get("/episodes", response_model=List[TutoringEpisodeReview])
async def get_review_episodes(
    current_user: dict = Depends(RoleChecker(["instructor", "rater"]))
):
    raise HTTPException(status_code=501, detail="GET /review/episodes is not implemented yet")

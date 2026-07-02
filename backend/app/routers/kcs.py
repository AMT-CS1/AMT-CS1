from fastapi import APIRouter
from app.core.kcs import K_COMPONENTS

router = APIRouter(prefix="/kcs", tags=["kcs"])

@router.get("")
async def list_kcs():
    """Return the list of Knowledge Components (KCs) for the course."""
    return K_COMPONENTS

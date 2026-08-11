import uuid
from datetime import datetime
from pydantic import BaseModel


class RosterImportResult(BaseModel):
    """Result of a researcher roster provisioning upload (R4)."""

    id: uuid.UUID
    filename: str
    status: str  # completed | failed
    counts: dict = {}
    # username -> generated temp password, for accounts created without an
    # explicit password. Surface these once so the researcher can distribute
    # them; they are not stored in plaintext anywhere.
    generated_credentials: dict[str, str] = {}
    skipped: list[dict] = []
    created_at: datetime

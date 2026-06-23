from pydantic import BaseModel

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: str | None = None
    role: str | None = None

class UserRead(BaseModel):
    id: str
    username: str
    role: str
    consent_status: bool

    class Config:
        from_attributes = True

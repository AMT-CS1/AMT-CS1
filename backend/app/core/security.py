from datetime import datetime, timedelta, timezone
from typing import Any, List
import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from app.core.config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/token")

class UserTokenData(BaseModel):
    id: str
    username: str
    role: str

# Password hashing helpers
def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")

# Stub User database for Day 1
STUB_USERS = {
    "11111111-1111-1111-1111-111111111111": {
        "id": "11111111-1111-1111-1111-111111111111",
        "username": "student_user",
        "email": "student@example.com",
        "hashed_password": get_password_hash("studentpass"),
        "role": "student",
        "consent_status": True
    },
    "22222222-2222-2222-2222-222222222222": {
        "id": "22222222-2222-2222-2222-222222222222",
        "username": "instructor_user",
        "email": "instructor@example.com",
        "hashed_password": get_password_hash("instructorpass"),
        "role": "instructor",
        "consent_status": True
    },
    "33333333-3333-3333-3333-333333333333": {
        "id": "33333333-3333-3333-3333-333333333333",
        "username": "researcher_user",
        "email": "researcher@example.com",
        "hashed_password": get_password_hash("researcherpass"),
        "role": "researcher",
        "consent_status": True
    },
    "44444444-4444-4444-4444-444444444444": {
        "id": "44444444-4444-4444-4444-444444444444",
        "username": "rater_user",
        "email": "rater@example.com",
        "hashed_password": get_password_hash("raterpass"),
        "role": "rater",
        "consent_status": True
    }
}

def find_stub_user_by_username(username: str) -> dict | None:
    for u in STUB_USERS.values():
        if u["username"] == username or u["email"] == username:
            return u
    return None

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    user_id = data.get("sub")
    username = data.get("username", "")
    email = data.get("email", "")
    role = data.get("role", "student")
    consent_status = data.get("consent_status", True)
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
        
    payload = {
        "aud": "authenticated",
        "exp": int(expire.timestamp()),
        "sub": user_id,
        "email": email,
        "app_metadata": {
            "provider": "email",
            "providers": ["email"]
        },
        "user_metadata": {
            "username": username,
            "role": role,
            "consent_status": consent_status
        },
        "role": "authenticated"
    }
    encoded_jwt = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub: str | None = payload.get("sub")
        if sub is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    user = STUB_USERS.get(sub)
    if user is None:
        # Resolve user dynamically from JWT metadata if not present in stub DB
        user_metadata = payload.get("user_metadata", {})
        email = payload.get("email", "")
        user = {
            "id": sub,
            "username": user_metadata.get("username", email.split("@")[0] if email else sub),
            "email": email,
            "role": user_metadata.get("role", "student"),
            "consent_status": user_metadata.get("consent_status", True)
        }
    return user

class RoleChecker:
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access forbidden. Required roles: {self.allowed_roles}"
            )
        return current_user

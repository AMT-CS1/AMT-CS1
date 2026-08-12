from datetime import datetime, timedelta, timezone
from typing import Any, List
import bcrypt
import jwt
import uuid
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.redis import redis_client

from app.core.config import settings
from app.core.database import get_db
from app.models.user import User

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

# Stub Users removed. Seeding is handled via seed_demo.py database seeding.

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

async def blacklist_token(token: str, expires_in_seconds: int = 3600):
    """Blacklist a JWT token in Redis until it expires."""
    try:
        await redis_client.set(f"blacklist:{token}", "1", ex=expires_in_seconds)
    except Exception as e:
        pass

async def is_token_blacklisted(token: str) -> bool:
    """Check if token is blacklisted in Redis."""
    try:
        val = await redis_client.get(f"blacklist:{token}")
        return val is not None
    except Exception:
        return False

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db)
) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    # Check if token is blacklisted in Redis
    if await is_token_blacklisted(token):
        raise credentials_exception

    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            audience="authenticated"
        )
        sub: str | None = payload.get("sub")
        if sub is None:
            raise credentials_exception
    except jwt.PyJWTError:
        raise credentials_exception
        
    try:
        stmt = select(User).where(User.id == uuid.UUID(sub))
        result = await db.execute(stmt)
        db_user = result.scalar_one_or_none()
    except Exception:
        db_user = None

    if db_user:
        user = {
            "id": str(db_user.id),
            "username": db_user.username,
            "email": db_user.username + "@example.com",
            "role": db_user.role,
            "consent_status": db_user.consent_status
        }
    else:
        # Resolve user dynamically from JWT metadata if not present in DB
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

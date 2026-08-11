import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Resolve backend/ folder
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
# Resolve workspace root (parent of backend)
WORKSPACE_DIR = BACKEND_DIR.parent

class Settings(BaseSettings):
    # Environment
    ENV: str = "development"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/amt_db"
    DB_ECHO: bool = False
    
    # CORS
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"
    
    # JWT Secrets
    JWT_SECRET: str = "supersecretjwtkeyforamtcs1developmentonly"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    
    # LLM Settings
    LLM_PROVIDER: str = "dummy"
    LLM_API_KEY: str = "dummy-api-key"

    # Remediation: when on, append a dummy SQ (Sequence) round to the misconception
    # tag list whenever any misconception is detected. SQ has no automatic detector
    # yet — this flag lets testers reach the SQ remediation round. Test-only.
    REMEDIATION_DUMMY_SQ: bool = False

    # P5/D7: LLM rephrasing of study recommendations. OFF everywhere — the seam
    # (_phrase_recommendations in core/amt_reports.py) is merged dormant; the
    # deterministic study_focus text in core/kcs.py is what ships. When enabled
    # later, the LLM may only reword study_focus — never change which tags are
    # recommended, their order, or their counts — and must fall back to the
    # deterministic text on any failure.
    RECOMMENDATIONS_LLM_ENABLED: bool = False
    
    # MinIO / S3 Settings
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "minioadmin"
    MINIO_SECURE: bool = False
    MINIO_BUCKET_NAME: str = "amt-evidence"

    model_config = SettingsConfigDict(
        env_file=(BACKEND_DIR / ".env", WORKSPACE_DIR / ".env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()

if settings.ENV == "production" and settings.JWT_SECRET == "supersecretjwtkeyforamtcs1developmentonly":
    raise ValueError("Insecure JWT_SECRET configured for production environment!")

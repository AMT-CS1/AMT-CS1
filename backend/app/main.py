from contextlib import asynccontextmanager
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import redis.asyncio as redis

from app.core.config import settings
from app.core.database import get_db
from app.core.redis import get_redis
from app.core.storage import init_storage
from app.routers import auth, attempts, tutoring, exercises, students, targets, review

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup actions: Initialize S3 buckets
    print("Starting up: initializing MinIO storage buckets...")
    init_storage()
    yield
    # Shutdown actions
    print("Shutting down...")

app = FastAPI(
    title="AMT-CS1 API",
    description="Research-prototype agentic tutoring backend for introductory programming (CS1)",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["system"])
async def health_check(
    db: AsyncSession = Depends(get_db),
    redis_client: redis.Redis = Depends(get_redis)
):
    health_status = {
        "status": "healthy",
        "database": "unknown",
        "redis": "unknown"
    }
    
    # Check Database connection
    try:
        await db.execute(select(1))
        health_status["database"] = "connected"
    except Exception as e:
        health_status["database"] = f"disconnected: {e}"
        health_status["status"] = "unhealthy"

    # Check Redis connection
    try:
        await redis_client.ping()
        health_status["redis"] = "connected"
    except Exception as e:
        health_status["redis"] = f"disconnected: {e}"
        health_status["status"] = "unhealthy"

    if health_status["status"] == "unhealthy":
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=health_status
        )
        
    return health_status

# Include routers
app.include_router(auth.router)
app.include_router(attempts.router)
app.include_router(tutoring.router)
app.include_router(exercises.router)
app.include_router(students.router)
app.include_router(targets.router)
app.include_router(review.router)

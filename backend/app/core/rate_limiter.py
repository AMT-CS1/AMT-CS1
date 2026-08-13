import time
import logging
from typing import Callable
from fastapi import Request, HTTPException, status
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

def rate_limit(prefix: str, limit: int, window_seconds: int = 60) -> Callable:
    """
    FastAPI dependency factory for Redis sliding window rate limiting.
    
    Usage:
        @router.post("/attempts", dependencies=[Depends(rate_limit("attempts", 10, 60))])
    """
    async def dependency(request: Request):
        # Extract user ID from state/auth if present, check X-Forwarded-For, fallback to client IP
        identifier = "anonymous"
        user = getattr(request.state, "user", None)
        if isinstance(user, dict) and "id" in user:
            identifier = str(user["id"])
        else:
            forwarded = request.headers.get("x-forwarded-for")
            if forwarded:
                identifier = forwarded.split(",")[0].strip()
            elif request.client and request.client.host:
                identifier = request.client.host

        key = f"rate_limit:{prefix}:{identifier}"
        now = time.time()
        window_start = now - window_seconds

        try:
            async with redis_client.pipeline(transaction=True) as pipe:
                # Remove requests older than sliding window
                pipe.zremrangebyscore(key, 0, window_start)
                # Count current requests in window
                pipe.zcard(key)
                # Add current request timestamp
                pipe.zadd(key, {f"{now}": now})
                # Set TTL on key
                pipe.expire(key, window_seconds + 1)
                
                results = await pipe.execute()
                
            request_count = results[1]

            if request_count >= limit:
                logger.warning(f"Rate limit exceeded for {key}: {request_count}/{limit} in {window_seconds}s")
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Rate limit exceeded. Maximum {limit} requests allowed per {window_seconds} seconds.",
                    headers={"Retry-After": str(window_seconds)}
                )

        except HTTPException:
            raise
        except Exception as e:
            # Fallback gracefully if Redis fails (don't block legitimate user traffic)
            logger.warning(f"Rate limiter Redis error for '{key}': {e}")

    return dependency

import json
import logging
from typing import Any, Optional
from app.core.redis import redis_client

logger = logging.getLogger(__name__)

async def get_cache(key: str) -> Optional[Any]:
    """Retrieve and deserialize JSON data from Redis. Returns None on cache miss or error."""
    try:
        data = await redis_client.get(key)
        if data:
            return json.loads(data)
    except Exception as e:
        logger.warning(f"Redis get_cache error for key '{key}': {e}")
    return None


async def set_cache(key: str, value: Any, ttl_seconds: int = 3600) -> bool:
    """Serialize value to JSON and store in Redis with expiration TTL."""
    try:
        serialized = json.dumps(value)
        await redis_client.set(key, serialized, ex=ttl_seconds)
        return True
    except Exception as e:
        logger.warning(f"Redis set_cache error for key '{key}': {e}")
        return False


async def delete_cache(key: str) -> bool:
    """Delete a specific key from Redis cache."""
    try:
        await redis_client.delete(key)
        return True
    except Exception as e:
        logger.warning(f"Redis delete_cache error for key '{key}': {e}")
        return False


async def delete_cache_pattern(pattern: str) -> bool:
    """Scan and delete all keys matching pattern (e.g., 'problem:*')."""
    try:
        keys = []
        async for key in redis_client.scan_iter(match=pattern):
            keys.append(key)
        if keys:
            await redis_client.delete(*keys)
        return True
    except Exception as e:
        logger.warning(f"Redis delete_cache_pattern error for pattern '{pattern}': {e}")
        return False

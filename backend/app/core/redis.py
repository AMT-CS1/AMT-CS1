import asyncio
import redis.asyncio as redis
from app.core.config import settings

_client: redis.Redis | None = None
_client_loop: asyncio.AbstractEventLoop | None = None

def get_redis_client() -> redis.Redis:
    global _client, _client_loop
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _client is None or _client_loop != current_loop or (current_loop and current_loop.is_closed()):
        _client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        _client_loop = current_loop
    return _client

class _RedisProxy:
    def __getattr__(self, name):
        client = get_redis_client()
        return getattr(client, name)

redis_client = _RedisProxy()

async def get_redis() -> redis.Redis:
    return get_redis_client()

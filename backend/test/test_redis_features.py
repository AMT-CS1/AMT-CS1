import uuid
import pytest
from fastapi import Request, HTTPException
from app.core.cache import get_cache, set_cache, delete_cache, delete_cache_pattern
from app.core.security import blacklist_token, is_token_blacklisted
from app.core.rate_limiter import rate_limit


@pytest.mark.asyncio
async def test_redis_cache_set_get_delete():
    key = f"test:unit_key:{uuid.uuid4().hex}"
    val = {"name": "AMT-CS1", "status": "active", "count": 42}
    
    # Set cache
    saved = await set_cache(key, val, ttl_seconds=60)
    assert saved is True
    
    # Get cache
    retrieved = await get_cache(key)
    assert retrieved == val
    
    # Delete cache
    deleted = await delete_cache(key)
    assert deleted is True
    
    # Verify deleted
    after_delete = await get_cache(key)
    assert after_delete is None


@pytest.mark.asyncio
async def test_redis_cache_pattern_deletion():
    p1_key = f"problem:p1:{uuid.uuid4().hex}"
    p2_key = f"problem:p2:{uuid.uuid4().hex}"
    
    await set_cache(p1_key, {"id": 1}, ttl_seconds=60)
    await set_cache(p2_key, {"id": 2}, ttl_seconds=60)
    
    assert await get_cache(p1_key) is not None
    assert await get_cache(p2_key) is not None
    
    await delete_cache_pattern("problem:*")
    
    assert await get_cache(p1_key) is None
    assert await get_cache(p2_key) is None


@pytest.mark.asyncio
async def test_redis_jwt_token_blacklisting():
    dummy_token = f"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.{uuid.uuid4().hex}"
    
    # Initially not blacklisted
    assert await is_token_blacklisted(dummy_token) is False
    
    # Blacklist token
    await blacklist_token(dummy_token, expires_in_seconds=60)
    
    # Now blacklisted
    assert await is_token_blacklisted(dummy_token) is True


@pytest.mark.asyncio
async def test_redis_rate_limiter():
    limiter = rate_limit("test_limit", limit=3, window_seconds=60)
    
    # Create mock request with unique IP
    unique_ip = f"192.168.1.{uuid.uuid4().hex[:4]}"
    scope = {"type": "http", "client": (unique_ip, 12345), "headers": []}
    request = Request(scope)
    
    # First 3 calls succeed
    await limiter(request)
    await limiter(request)
    await limiter(request)
    
    # 4th call raises HTTP 429
    with pytest.raises(HTTPException) as exc_info:
        await limiter(request)
    assert exc_info.value.status_code == 429

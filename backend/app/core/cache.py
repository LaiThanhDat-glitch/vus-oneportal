import json
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from typing import Any

from fastapi import Request
from redis.exceptions import RedisError


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    raise TypeError(f"Cannot cache {type(value).__name__}")


async def cached_payload(
    request: Request,
    key: str,
    loader: Callable[[], Awaitable[dict]],
    ttl_seconds: int = 120,
) -> dict:
    redis = getattr(request.app.state, "redis", None)
    if redis is not None:
        try:
            cached = await redis.get(key)
            if cached:
                return json.loads(cached)
        except (RedisError, json.JSONDecodeError):
            pass

    result = await loader()
    if redis is not None:
        try:
            await redis.set(key, json.dumps(result, default=_json_default), ex=ttl_seconds)
        except RedisError:
            pass
    return result

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.api import auth, payments, staff, student, teacher
from app.core.config import settings
from app.core.database import SessionLocal, engine, initialize_database
from app.seed import seed_demo_data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    if settings.app_env == "development":
        await initialize_database()
    if settings.demo_mode and settings.app_env == "development":
        async with SessionLocal() as session:
            await seed_demo_data(session)
    redis = Redis.from_url(settings.redis_url, decode_responses=True)
    try:
        await redis.ping()
        _app.state.redis = redis
    except Exception:
        await redis.aclose()
        _app.state.redis = None
    yield
    if getattr(_app.state, "redis", None) is not None:
        await _app.state.redis.aclose()
    await engine.dispose()


app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Webhook-Signature"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(student.router, prefix="/api/v1")
app.include_router(teacher.router, prefix="/api/v1")
app.include_router(staff.router, prefix="/api/v1")
app.include_router(payments.router, prefix="/api/v1")


@app.get("/health", tags=["health"])
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "vus-oneportal-api"}

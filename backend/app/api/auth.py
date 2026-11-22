from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import current_user, database_session
from app.core.security import create_access_token, verify_password
from app.models import User
from app.schemas import LoginInput, LoginOutput, UserView

router = APIRouter(prefix="/auth", tags=["authentication"])


@router.post("/login", response_model=LoginOutput)
async def login(body: LoginInput, db: AsyncSession = Depends(database_session)) -> LoginOutput:
    user = await db.scalar(select(User).where(User.email == body.email.lower().strip()))
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu chưa chính xác.")
    return LoginOutput(
        access_token=create_access_token(user.id, user.role),
        user=UserView.model_validate(user),
    )


@router.get("/me", response_model=UserView)
async def me(user: User = Depends(current_user)) -> User:
    return user

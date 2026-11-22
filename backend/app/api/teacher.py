import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cache import cached_payload
from app.core.dependencies import allow_roles, database_session
from app.core.security import create_attendance_token
from app.models import AttendanceRecord, CourseSession, FeedbackRecord, SessionEnrollment, User
from app.schemas import FeedbackSaveInput, FeedbackSuggestionInput

router = APIRouter(prefix="/teacher", tags=["teacher portal"])


@router.get("/sessions")
async def sessions(
    request: Request,
    user: User = Depends(allow_roles("teacher")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    async def load() -> dict:
        items = list(
            (
                await db.scalars(
                    select(CourseSession)
                    .where(CourseSession.teacher_id == user.id)
                    .order_by(CourseSession.starts_at)
                )
            ).all()
        )
        return {
            "sessions": [
                {
                    "id": item.id,
                    "title": item.title,
                    "class_name": item.class_name,
                    "room": item.room,
                    "starts_at": item.starts_at,
                    "duration_minutes": item.duration_minutes,
                    "enrolled_count": item.enrolled_count,
                    "capacity": item.capacity,
                }
                for item in items
            ]
        }

    return await cached_payload(request, f"teacher:sessions:{user.id}", load, ttl_seconds=120)


@router.get("/students")
async def students(
    session_id: str | None = None,
    _user: User = Depends(allow_roles("teacher")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    query = (
        select(User)
        .join(SessionEnrollment, SessionEnrollment.student_id == User.id)
        .join(CourseSession, CourseSession.id == SessionEnrollment.session_id)
        .where(User.role == "student", CourseSession.teacher_id == _user.id)
        .distinct()
        .order_by(User.full_name)
    )
    if session_id:
        course = await db.get(CourseSession, session_id)
        if course is None or course.teacher_id != _user.id:
            raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
        query = query.where(SessionEnrollment.session_id == course.id)
    items = list((await db.scalars(query)).all())
    return {"students": [{"id": item.id, "full_name": item.full_name} for item in items]}


@router.post("/sessions/{session_id}/qr")
async def issue_qr(
    session_id: str,
    user: User = Depends(allow_roles("teacher")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    item = await db.get(CourseSession, session_id)
    if item is None or item.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    return {
        "session_id": item.id,
        "token": create_attendance_token(item.id, user.id),
        "expires_in": 60,
        "refresh_after": 55,
    }


@router.get("/sessions/{session_id}/attendance")
async def session_attendance(
    session_id: str,
    user: User = Depends(allow_roles("teacher")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    course = await db.get(CourseSession, session_id)
    if course is None or course.teacher_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    rows = (await db.execute(
        select(AttendanceRecord, User)
        .join(User, AttendanceRecord.student_id == User.id)
        .where(AttendanceRecord.session_id == course.id)
        .order_by(AttendanceRecord.checked_in_at.desc())
    )).all()
    return {
        "attendance": [
            {
                "id": record.id,
                "student_name": student.full_name,
                "checked_in_at": record.checked_in_at,
            }
            for record, student in rows
        ]
    }


@router.post("/feedback/suggest")
async def suggest_feedback(
    body: FeedbackSuggestionInput,
    _user: User = Depends(allow_roles("teacher")),
) -> dict:
    strengths = ", ".join(body.strengths) or "participation and effort"
    focus = body.focus or "continue practicing clear, complete sentences"
    if settings.gemini_api_key:
        prompt = (
            "Write a warm, concise teacher feedback note for an English learner. "
            "Return exactly two labeled lines: EN: ... and VI: ... . "
            f"Strengths: {strengths}. Next focus: {focus}. Keep it under 60 words per language."
        )
        url = "https://generativelanguage.googleapis.com/v1beta/interactions"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                response = await client.post(
                    url,
                    headers={"x-goog-api-key": settings.gemini_api_key},
                    json={"model": settings.gemini_model, "input": prompt},
                )
                response.raise_for_status()
                steps = response.json().get("steps", [])
                outputs = [step for step in steps if step.get("type") == "model_output"]
                if not outputs:
                    raise ValueError("Gemini returned no model output")
                output = outputs[-1]
                text = "\n".join(part["text"] for part in output.get("content", []) if "text" in part)
                lines = [line.strip() for line in text.splitlines()]
                english = next((line[3:].strip() for line in lines if line.startswith("EN:")), "")
                vietnamese = next((line[3:].strip() for line in lines if line.startswith("VI:")), "")
                if not english or not vietnamese:
                    raise ValueError("Gemini response did not contain both language drafts")
                return {"english_text": english, "vietnamese_text": vietnamese, "provider": "gemini"}
        except (httpx.HTTPError, KeyError, IndexError, ValueError):
            pass

    strengths_vi = {
        "Active participation": "tinh thần tham gia tích cực",
        "Clear pronunciation": "phát âm rõ ràng",
        "Good vocabulary": "vốn từ vựng tốt",
        "Teamwork": "khả năng phối hợp tốt",
    }
    translated_strengths = ", ".join(strengths_vi.get(item, item) for item in body.strengths)
    if not translated_strengths:
        translated_strengths = "sự chăm chỉ và tinh thần học tập"
    return {
        "english_text": f"Great work showing {strengths}. For your next step, focus on {focus}. Keep it up!",
        "vietnamese_text": f"Con đã thể hiện tốt {translated_strengths}. Buổi tiếp theo, con hãy tiếp tục luyện tập để tự tin hơn. Cố gắng nhé!",
        "provider": "sample",
    }


@router.post("/feedback", status_code=201)
async def save_feedback(
    body: FeedbackSaveInput,
    user: User = Depends(allow_roles("teacher")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    course = await db.get(CourseSession, body.session_id)
    student = await db.get(User, body.student_id)
    if course is None or course.teacher_id != user.id or student is None or student.role != "student":
        raise HTTPException(status_code=404, detail="Buổi học hoặc học viên không hợp lệ.")
    enrollment = await db.scalar(
        select(SessionEnrollment.id).where(
            SessionEnrollment.session_id == course.id,
            SessionEnrollment.student_id == student.id,
        )
    )
    if enrollment is None:
        raise HTTPException(status_code=403, detail="Học viên không thuộc lớp do bạn phụ trách.")
    item = FeedbackRecord(
        session_id=course.id,
        student_id=student.id,
        teacher_id=user.id,
        english_text=body.english_text,
        vietnamese_text=body.vietnamese_text,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "created_at": item.created_at, "status": "saved"}

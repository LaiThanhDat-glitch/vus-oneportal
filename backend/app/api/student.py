from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.cache import cached_payload
from app.core.dependencies import allow_roles, database_session
from app.core.security import create_attendance_token, decode_token
from app.core.services import add_business_hours, remaining_sla_minutes
from app.models import AttendanceRecord, CourseSession, FeedbackRecord, HelpdeskTicket, Invoice, LeaveRequest, SessionEnrollment, User, utc_now
from app.schemas import LeaveInput, TicketCreateInput

router = APIRouter(prefix="/student", tags=["student & parent portal"])


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def session_view(item: CourseSession) -> dict:
    return {
        "id": item.id,
        "title": item.title,
        "class_name": item.class_name,
        "room": item.room,
        "starts_at": item.starts_at,
        "duration_minutes": item.duration_minutes,
        "enrolled_count": item.enrolled_count,
        "capacity": item.capacity,
    }


def invoice_view(item: Invoice) -> dict:
    return {
        "id": item.id,
        "reference": item.reference,
        "description": item.description,
        "amount_vnd": item.amount_vnd,
        "due_date": item.due_date,
        "status": item.status,
        "paid_at": item.paid_at,
    }


@router.get("/dashboard")
async def dashboard(
    user: User = Depends(allow_roles("student")), db: AsyncSession = Depends(database_session)
) -> dict:
    now = utc_now()
    sessions = list(
        (
            await db.scalars(
                select(CourseSession)
                .join(SessionEnrollment, SessionEnrollment.session_id == CourseSession.id)
                .where(SessionEnrollment.student_id == user.id)
                .where(CourseSession.starts_at >= now - timedelta(hours=2))
                .order_by(CourseSession.starts_at)
                .limit(6)
            )
        ).all()
    )
    invoices = list(
        (await db.scalars(select(Invoice).where(Invoice.student_id == user.id).order_by(Invoice.due_date))).all()
    )
    attendance = list(
        (
            await db.scalars(
                select(AttendanceRecord)
                .where(AttendanceRecord.student_id == user.id)
                .order_by(AttendanceRecord.checked_in_at.desc())
                .limit(5)
            )
        ).all()
    )
    return {
        "student_name": user.full_name,
        "class_name": sessions[0].class_name if sessions else "AV7-204",
        "next_session": session_view(sessions[0]) if sessions else None,
        "sessions": [session_view(item) for item in sessions],
        "attendance": [
            {"id": item.id, "session_id": item.session_id, "checked_in_at": item.checked_in_at}
            for item in attendance
        ],
        "invoices": [invoice_view(item) for item in invoices],
    }


@router.get("/schedule")
async def schedule(
    request: Request,
    _user: User = Depends(allow_roles("student")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    async def load() -> dict:
        sessions = list(
            (
                await db.scalars(
                    select(CourseSession)
                    .join(SessionEnrollment, SessionEnrollment.session_id == CourseSession.id)
                    .where(SessionEnrollment.student_id == _user.id)
                    .order_by(CourseSession.starts_at)
                )
            ).all()
        )
        return {"sessions": [session_view(item) for item in sessions]}

    return await cached_payload(request, f"student:schedule:{_user.id}:v1", load, ttl_seconds=120)


@router.get("/demo-qr")
async def demo_qr(
    _user: User = Depends(allow_roles("student")), db: AsyncSession = Depends(database_session)
) -> dict:
    if not settings.demo_mode:
        raise HTTPException(status_code=404, detail="Demo QR is disabled.")
    session = await db.scalar(
        select(CourseSession)
        .join(SessionEnrollment, SessionEnrollment.session_id == CourseSession.id)
        .where(SessionEnrollment.student_id == _user.id)
        .order_by(CourseSession.starts_at)
        .limit(1)
    )
    if session is None:
        raise HTTPException(status_code=404, detail="Chưa có buổi học để điểm danh.")
    return {
        "session_id": session.id,
        "token": create_attendance_token(session.id, session.teacher_id, demo=True),
        "expires_in": 60,
    }


@router.post("/attendance")
async def check_in(
    body: dict,
    user: User = Depends(allow_roles("student")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    token = body.get("token", "")
    try:
        claims = decode_token(token)
        if claims.get("purpose") != "attendance":
            raise ValueError("wrong token purpose")
        session_id = claims["session_id"]
    except (jwt.InvalidTokenError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Mã QR không hợp lệ hoặc đã hết hạn.") from None

    course = await db.get(CourseSession, session_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy buổi học.")
    if claims.get("sub") != course.teacher_id:
        raise HTTPException(status_code=400, detail="Mã QR không thuộc giáo viên phụ trách lớp này.")
    enrolled = await db.scalar(
        select(SessionEnrollment.id).where(
            SessionEnrollment.session_id == course.id,
            SessionEnrollment.student_id == user.id,
        )
    )
    if enrolled is None:
        raise HTTPException(status_code=403, detail="Bạn chưa được ghi danh vào buổi học này.")
    starts_at = as_utc(course.starts_at)
    now = datetime.now(timezone.utc)
    ends_at = starts_at + timedelta(minutes=course.duration_minutes)
    demo_check_in = settings.demo_mode and claims.get("demo") is True
    if not demo_check_in and (now < starts_at - timedelta(minutes=15) or now > ends_at + timedelta(minutes=15)):
        raise HTTPException(status_code=400, detail="Mã điểm danh chỉ dùng gần giờ học.")

    existing = await db.scalar(
        select(AttendanceRecord).where(
            AttendanceRecord.session_id == course.id,
            AttendanceRecord.student_id == user.id,
        )
    )
    if existing is not None:
        return {"status": "already_checked_in", "checked_in_at": existing.checked_in_at}

    record = AttendanceRecord(session_id=course.id, student_id=user.id)
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return {"status": "checked_in", "checked_in_at": record.checked_in_at}


@router.post("/leave-requests", status_code=201)
async def request_leave(
    body: LeaveInput,
    user: User = Depends(allow_roles("student")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    original = await db.get(CourseSession, body.session_id)
    makeup = await db.get(CourseSession, body.makeup_session_id)
    if original is None or makeup is None or original.id == makeup.id:
        raise HTTPException(status_code=404, detail="Buổi học hoặc lớp học bù không hợp lệ.")
    enrollment = await db.scalar(
        select(SessionEnrollment.id).where(
            SessionEnrollment.session_id == original.id,
            SessionEnrollment.student_id == user.id,
        )
    )
    if enrollment is None:
        raise HTTPException(status_code=403, detail="Bạn chưa được ghi danh vào buổi học này.")
    if as_utc(makeup.starts_at) <= as_utc(original.starts_at):
        raise HTTPException(status_code=400, detail="Lớp học bù phải diễn ra sau buổi học cần nghỉ.")
    if as_utc(original.starts_at) < datetime.now(timezone.utc) + timedelta(hours=4):
        raise HTTPException(status_code=400, detail="Đơn xin nghỉ cần gửi trước giờ học ít nhất 4 tiếng.")
    reserved_seats = await db.scalar(
        select(func.count(LeaveRequest.id)).where(
            LeaveRequest.makeup_session_id == makeup.id,
            LeaveRequest.status == "pending",
        )
    )
    seats = makeup.enrolled_count + (reserved_seats or 0)
    if seats >= makeup.capacity or seats >= 18:
        raise HTTPException(status_code=409, detail="Lớp học bù đã đủ 18 học viên.")
    pending = await db.scalar(
        select(LeaveRequest).where(
            LeaveRequest.student_id == user.id,
            LeaveRequest.session_id == original.id,
            LeaveRequest.status == "pending",
        )
    )
    if pending:
        raise HTTPException(status_code=409, detail="Bạn đã gửi đơn cho buổi học này.")

    request = LeaveRequest(
        student_id=user.id,
        session_id=original.id,
        makeup_session_id=makeup.id,
        reason=body.reason,
    )
    db.add(request)
    await db.commit()
    await db.refresh(request)
    return {"id": request.id, "status": request.status, "created_at": request.created_at}


@router.get("/invoices")
async def invoices(
    user: User = Depends(allow_roles("student")), db: AsyncSession = Depends(database_session)
) -> dict:
    records = list(
        (await db.scalars(select(Invoice).where(Invoice.student_id == user.id).order_by(Invoice.due_date))).all()
    )
    return {"invoices": [invoice_view(item) for item in records]}


@router.get("/feedback")
async def feedback(
    user: User = Depends(allow_roles("student")), db: AsyncSession = Depends(database_session)
) -> dict:
    rows = (
        await db.execute(
            select(FeedbackRecord, CourseSession)
            .join(CourseSession, FeedbackRecord.session_id == CourseSession.id)
            .where(FeedbackRecord.student_id == user.id)
            .order_by(FeedbackRecord.created_at.desc())
            .limit(10)
        )
    ).all()
    return {
        "feedback": [
            {
                "id": item.id,
                "session_title": course.title,
                "english_text": item.english_text,
                "vietnamese_text": item.vietnamese_text,
                "created_at": item.created_at,
            }
            for item, course in rows
        ]
    }


@router.get("/tickets")
async def my_tickets(
    user: User = Depends(allow_roles("student")), db: AsyncSession = Depends(database_session)
) -> dict:
    items = list(
        (
            await db.scalars(
                select(HelpdeskTicket)
                .where(HelpdeskTicket.requester_id == user.id)
                .order_by(HelpdeskTicket.created_at.desc())
            )
        ).all()
    )
    return {
        "tickets": [
            {
                "id": item.id,
                "title": item.title,
                "category": item.category,
                "description": item.description,
                "status": item.status,
                "created_at": item.created_at,
                "sla_due_at": item.sla_due_at,
                "sla_remaining_minutes": remaining_sla_minutes(item.sla_due_at),
            }
            for item in items
        ]
    }


@router.post("/tickets", status_code=201)
async def create_ticket(
    body: TicketCreateInput,
    user: User = Depends(allow_roles("student")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    created_at = utc_now()
    item = HelpdeskTicket(
        requester_id=user.id,
        title=body.title.strip(),
        category=body.category,
        description=body.description.strip(),
        status="new",
        created_at=created_at,
        sla_due_at=add_business_hours(created_at, 8),
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return {"id": item.id, "status": item.status, "created_at": item.created_at}


@router.post("/invoices/{invoice_id}/pay")
async def pay_invoice(
    invoice_id: str,
    user: User = Depends(allow_roles("student")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    invoice = await db.get(Invoice, invoice_id)
    if invoice is None or invoice.student_id != user.id:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn.")
    if invoice.status == "paid":
        return {"status": "paid", "reference": invoice.reference}
    if not settings.demo_mode:
        raise HTTPException(status_code=503, detail="Chưa cấu hình cổng thanh toán.")
    invoice.status = "paid"
    invoice.paid_at = utc_now()
    await db.commit()
    return {"status": "paid", "reference": invoice.reference, "demo": True}

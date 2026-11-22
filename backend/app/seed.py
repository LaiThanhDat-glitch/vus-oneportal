from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import encrypt_sensitive, hash_password
from app.core.services import add_business_hours
from app.models import CourseSession, HelpdeskTicket, Invoice, SessionEnrollment, User, utc_now

DEMO_PASSWORD = "Demo123!"


async def seed_demo_data(db: AsyncSession) -> None:
    users = {
        "parent@vus.vn": ("Nguyễn Minh Anh", "student", "+84901234567"),
        "teacher@vus.vn": ("Trần Hoàng Nam", "teacher", "+84907654321"),
        "staff@vus.vn": ("Lê Thu Hà", "staff", "+84908881234"),
    }
    records: dict[str, User] = {}
    for email, (name, role, phone) in users.items():
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            user = User(
                email=email,
                full_name=name,
                role=role,
                password_hash=hash_password(DEMO_PASSWORD),
                phone_encrypted=encrypt_sensitive(phone),
            )
            db.add(user)
            await db.flush()
        records[email] = user

    teacher = records["teacher@vus.vn"]
    student = records["parent@vus.vn"]
    sessions = list(
        (
            await db.scalars(
                select(CourseSession)
                .where(CourseSession.teacher_id == teacher.id)
                .order_by(CourseSession.starts_at)
            )
        ).all()
    )
    if not sessions:
        now = utc_now()
        sessions = [
            CourseSession(
                teacher_id=teacher.id,
                title="English Communication · Unit 5",
                class_name="AV7-204",
                room="NOVA-402",
                starts_at=now + timedelta(minutes=10),
                duration_minutes=90,
                enrolled_count=14,
                capacity=18,
            ),
            CourseSession(
                teacher_id=teacher.id,
                title="English Communication · Unit 6",
                class_name="AV7-204",
                room="NOVA-402",
                starts_at=now + timedelta(days=2),
                duration_minutes=90,
                enrolled_count=14,
                capacity=18,
            ),
            CourseSession(
                teacher_id=teacher.id,
                title="Make-up class · Speaking",
                class_name="AV7-204",
                room="NOVA-205",
                starts_at=now + timedelta(days=3),
                duration_minutes=90,
                enrolled_count=14,
                capacity=18,
            ),
        ]
        db.add_all(sessions)
        await db.flush()

    for course in sessions:
        enrollment = await db.scalar(
            select(SessionEnrollment).where(
                SessionEnrollment.session_id == course.id,
                SessionEnrollment.student_id == student.id,
            )
        )
        if enrollment is None:
            db.add(SessionEnrollment(session_id=course.id, student_id=student.id))

    invoice = await db.scalar(select(Invoice).where(Invoice.reference == "VUS-2026-00421"))
    if invoice is None:
        db.add(
            Invoice(
                student_id=student.id,
                reference="VUS-2026-00421",
                description="Học phí tháng 12 · AV7-204",
                amount_vnd=3_600_000,
                due_date=date.today() + timedelta(days=7),
                status="pending",
            )
        )

    ticket = await db.scalar(select(HelpdeskTicket).where(HelpdeskTicket.title == "Không nhận được email lịch học"))
    if ticket is None:
        created = utc_now() - timedelta(hours=3)
        db.add(
            HelpdeskTicket(
                requester_id=student.id,
                title="Không nhận được email lịch học",
                category="Tài khoản & thông báo",
                description="Phụ huynh chưa thấy email xác nhận lịch học tuần này.",
                status="in_progress",
                created_at=created,
                sla_due_at=add_business_hours(created, 8),
            )
        )

    await db.commit()

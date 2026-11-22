from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dependencies import allow_roles, database_session
from app.core.services import remaining_sla_minutes
from app.models import HelpdeskTicket, User
from app.schemas import TicketStatusInput

router = APIRouter(prefix="/staff", tags=["staff portal"])


def ticket_view(item: HelpdeskTicket, requester_name: str) -> dict:
    remaining = remaining_sla_minutes(item.sla_due_at)
    return {
        "id": item.id,
        "requester_name": requester_name,
        "title": item.title,
        "category": item.category,
        "description": item.description,
        "status": item.status,
        "created_at": item.created_at,
        "sla_due_at": item.sla_due_at,
        "sla_remaining_minutes": remaining,
        "sla_level": "red" if remaining < 60 else "yellow" if remaining < 240 else "green",
    }


@router.get("/tickets")
async def tickets(
    status: str | None = None,
    _user: User = Depends(allow_roles("staff")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    query = select(HelpdeskTicket, User).join(User, HelpdeskTicket.requester_id == User.id)
    query = query.order_by(HelpdeskTicket.created_at.desc())
    if status in {"new", "in_progress", "resolved"}:
        query = query.where(HelpdeskTicket.status == status)
    rows = (await db.execute(query)).all()
    return {"tickets": [ticket_view(item, requester.full_name) for item, requester in rows]}


@router.patch("/tickets/{ticket_id}")
async def update_ticket(
    ticket_id: str,
    body: TicketStatusInput,
    _user: User = Depends(allow_roles("staff")),
    db: AsyncSession = Depends(database_session),
) -> dict:
    item = await db.get(HelpdeskTicket, ticket_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy ticket.")
    item.status = body.status
    await db.commit()
    await db.refresh(item)
    requester = await db.get(User, item.requester_id)
    return ticket_view(item, requester.full_name if requester else "")

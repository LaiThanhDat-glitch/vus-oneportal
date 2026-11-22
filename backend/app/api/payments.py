import hashlib
import hmac

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.dependencies import database_session
from app.models import Invoice, utc_now
from app.schemas import PaymentWebhookInput

router = APIRouter(prefix="/payments", tags=["payments"])


@router.post("/webhook")
async def payment_webhook(
    body: PaymentWebhookInput, db: AsyncSession = Depends(database_session)
) -> dict:
    expected = hmac.new(
        settings.payment_webhook_secret.encode(),
        f"{body.reference}:{body.status}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, body.signature):
        raise HTTPException(status_code=401, detail="Chữ ký webhook không hợp lệ.")
    if body.status not in {"paid", "failed"}:
        raise HTTPException(status_code=400, detail="Trạng thái thanh toán không được hỗ trợ.")
    invoice = await db.scalar(select(Invoice).where(Invoice.reference == body.reference))
    if invoice is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy hóa đơn.")
    invoice.status = body.status
    invoice.paid_at = utc_now() if body.status == "paid" else None
    await db.commit()
    return {"reference": invoice.reference, "status": invoice.status}

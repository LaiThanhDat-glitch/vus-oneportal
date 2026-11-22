from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class UserView(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    email: str
    full_name: str
    role: str


class LoginInput(BaseModel):
    email: str
    password: str


class LoginOutput(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserView


class LeaveInput(BaseModel):
    session_id: str
    makeup_session_id: str
    reason: str = Field(min_length=5, max_length=500)


class FeedbackSuggestionInput(BaseModel):
    student_id: str
    strengths: list[str] = Field(default_factory=list, max_length=8)
    focus: str = Field(default="", max_length=300)


class FeedbackSaveInput(BaseModel):
    session_id: str
    student_id: str
    english_text: str = Field(min_length=10, max_length=3000)
    vietnamese_text: str = Field(min_length=10, max_length=3000)


class TicketStatusInput(BaseModel):
    status: str = Field(pattern="^(new|in_progress|resolved)$")


class TicketCreateInput(BaseModel):
    title: str = Field(min_length=5, max_length=180)
    category: str = Field(min_length=3, max_length=80)
    description: str = Field(min_length=10, max_length=3000)


class PaymentWebhookInput(BaseModel):
    reference: str
    status: str
    signature: str
    transaction_id: str | None = None


class InvoiceView(BaseModel):
    id: str
    reference: str
    description: str
    amount_vnd: int
    due_date: date
    status: str
    paid_at: datetime | None

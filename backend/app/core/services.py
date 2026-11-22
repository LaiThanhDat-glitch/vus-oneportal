from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

WORK_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
OPEN_TIME = time(9, 0)
CLOSE_TIME = time(18, 0)


def add_business_hours(start: datetime, hours: int) -> datetime:
    """Add working hours using a simple Monday-Friday, 09:00-18:00 SLA calendar."""
    current = start.astimezone(WORK_TIMEZONE)
    remaining = float(hours)
    while current.weekday() >= 5:
        current = (current + timedelta(days=1)).replace(hour=OPEN_TIME.hour, minute=OPEN_TIME.minute, second=0, microsecond=0)
    opening = current.replace(hour=OPEN_TIME.hour, minute=OPEN_TIME.minute, second=0, microsecond=0)
    closing = current.replace(hour=CLOSE_TIME.hour, minute=CLOSE_TIME.minute, second=0, microsecond=0)
    if current < opening:
        current = opening
    elif current >= closing:
        current = (current + timedelta(days=1)).replace(hour=OPEN_TIME.hour, minute=OPEN_TIME.minute, second=0, microsecond=0)
        while current.weekday() >= 5:
            current += timedelta(days=1)

    while remaining > 0:
        closing = current.replace(hour=CLOSE_TIME.hour, minute=CLOSE_TIME.minute, second=0, microsecond=0)
        available = (closing - current).total_seconds() / 3600
        if remaining <= available:
            current += timedelta(hours=remaining)
            remaining = 0
        else:
            remaining -= available
            current = (current + timedelta(days=1)).replace(hour=OPEN_TIME.hour, minute=OPEN_TIME.minute, second=0, microsecond=0)
            while current.weekday() >= 5:
                current += timedelta(days=1)
    return current.astimezone(timezone.utc)


def _working_minutes_between(start: datetime, end: datetime) -> int:
    if end <= start:
        return 0
    total = 0
    day = start.date()
    last_day = end.date()
    while day <= last_day:
        if day.weekday() < 5:
            opening = datetime.combine(day, OPEN_TIME, WORK_TIMEZONE)
            closing = datetime.combine(day, CLOSE_TIME, WORK_TIMEZONE)
            overlap_start = max(start, opening)
            overlap_end = min(end, closing)
            if overlap_end > overlap_start:
                total += int((overlap_end - overlap_start).total_seconds() // 60)
        day += timedelta(days=1)
    return total


def remaining_sla_minutes(due_at: datetime, now: datetime | None = None) -> int:
    current = (now or datetime.now(timezone.utc)).astimezone(WORK_TIMEZONE)
    if due_at.tzinfo is None:
        due_at = due_at.replace(tzinfo=timezone.utc)
    due_local = due_at.astimezone(WORK_TIMEZONE)
    if current <= due_local:
        return _working_minutes_between(current, due_local)
    return -_working_minutes_between(due_local, current)

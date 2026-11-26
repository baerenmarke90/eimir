"""Current delivery health shared by the overview, the monitoring page and alerts."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.engagement.models import (
    EmailDelivery,
    EmailDeliveryStatus,
    PushDelivery,
    PushDeliveryStatus,
)

DELIVERY_FAILURE_BURST = 5
"""More failed deliveries than this within an hour count as a problem."""


def failed_deliveries_since(session: Session, since: datetime) -> tuple[int, int]:
    """Return (failed emails, failed pushes) finished since ``since``."""
    emails = session.execute(
        select(func.count())
        .select_from(EmailDelivery)
        .where(
            EmailDelivery.status == EmailDeliveryStatus.FAILED.value,
            EmailDelivery.finished_at >= since,
        )
    ).scalar_one()
    pushes = session.execute(
        select(func.count())
        .select_from(PushDelivery)
        .where(
            PushDelivery.status == PushDeliveryStatus.FAILED.value,
            PushDelivery.finished_at >= since,
        )
    ).scalar_one()
    return int(emails), int(pushes)


def delivery_status(failures: int) -> str:
    return "problem" if failures > DELIVERY_FAILURE_BURST else "ok"

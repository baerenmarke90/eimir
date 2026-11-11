"""Scrub derived prose when a canonical source changes, then let it be rewritten."""

from __future__ import annotations

from datetime import timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.config import get_settings
from eimir.core.ids import new_id
from eimir.jobs import queue
from eimir.recaps.models import RecapEdition, RecapPayload, RecapSource

# Several edits in a row should cost one local inference, not one each.
REWRITE_DELAY = timedelta(minutes=10)


def _before_flush(session: Session, flush_context: Any, instances: Any) -> None:
    del flush_context, instances
    from eimir.recaps.service import GENERATE_JOB, MODELS

    kinds = {model: kind.value for kind, model in MODELS.items()}
    affected: set[UUID] = set()
    for source in set(session.dirty) | set(session.deleted):
        kind = kinds.get(type(source))
        if kind is None:
            continue
        history = inspect(source).attrs.privacy_class.history
        was_shared = (
            getattr(source, "privacy_class", None) == PrivacyClass.SPACE_SHARED.value
            or PrivacyClass.SPACE_SHARED.value in history.deleted
        )
        if was_shared:
            affected.update(
                session.scalars(
                    select(RecapSource.edition_id).where(
                        RecapSource.kind == kind, RecapSource.source_id == source.id
                    )
                )
            )
    if affected:
        for edition in session.scalars(select(RecapEdition).where(RecapEdition.id.in_(affected))):
            if edition.payload.headline or edition.payload.introduction:
                edition.payload = RecapPayload()
                edition.generated_by = "RULES"
                # The factual template shows at once; an automatic proposal is rewritten
                # later. Scrubbed prose cannot trigger this again, which debounces edits.
                if (
                    edition.saved_at is None
                    and not edition.customized
                    and get_settings().recap_ai_url
                ):
                    edition.request_token = new_id()
                    queue.enqueue(
                        session,
                        GENERATE_JOB,
                        {
                            "space_id": str(edition.space_id),
                            "edition_id": str(edition.id),
                            "request_token": str(edition.request_token),
                        },
                        delay=REWRITE_DELAY,
                        max_attempts=3,
                    )


event.listen(Session, "before_flush", _before_flush)

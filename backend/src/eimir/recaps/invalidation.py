"""Scrub derived prose when one of its canonical sources changes or disappears."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from sqlalchemy import event, inspect, select
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.recaps.models import RecapEdition, RecapPayload, RecapSource


def _before_flush(session: Session, flush_context: Any, instances: Any) -> None:
    del flush_context, instances
    from eimir.recaps.service import MODELS

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


event.listen(Session, "before_flush", _before_flush)

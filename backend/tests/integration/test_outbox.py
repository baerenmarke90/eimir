"""Transactional outbox tests.

The outbox guarantees that a business change and its event become effective
together or not at all. These tests verify that guarantee rather than merely
checking that a row can be written.
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy import Engine, select
from sqlalchemy.exc import StatementError
from sqlalchemy.orm import Session, sessionmaker

from eimir.core.clock import now
from eimir.core.ids import new_id
from eimir.domain.events import DomainEvent, EventType
from eimir.outbox import service
from eimir.outbox.models import OutboxEvent
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


def _event() -> DomainEvent:
    return DomainEvent(
        type=EventType.MEMORY_CREATED,
        space_id=new_id(),
        actor_id=new_id(),
        subject_type="memory",
        subject_id=new_id(),
        payload={"has_attachment": True},
    )


class TestWriting:
    def test_event_is_staged(self, session: Session) -> None:
        row = service.record(session, _event())
        session.flush()

        assert row.id is not None
        assert row.processed_at is None
        assert row.attempts == 0

    def test_rollback_removes_business_change_and_event(self, engine: Engine) -> None:
        """Rolling back the transaction must also remove the staged event."""
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        event = _event()

        session = factory()
        service.record(session, event)
        session.flush()
        session.rollback()
        session.close()

        verifier = factory()
        try:
            matches = (
                verifier.execute(
                    select(OutboxEvent).where(OutboxEvent.subject_id == event.subject_id)
                )
                .scalars()
                .all()
            )
            assert matches == []
        finally:
            verifier.close()


class TestClaiming:
    def test_returns_only_unprocessed(self, session: Session) -> None:
        pending = service.record(session, _event())
        processed = service.record(session, _event())
        service.mark_processed(processed)
        session.flush()

        ids = {row.id for row in service.claim_unprocessed(session)}
        assert pending.id in ids
        assert processed.id not in ids

    def test_order_matches_creation_order(self, session: Session) -> None:
        first = service.record(session, _event())
        second = service.record(session, _event())
        session.flush()

        claimed = list(service.claim_unprocessed(session))
        positions = {row.id: index for index, row in enumerate(claimed)}
        assert positions[first.id] < positions[second.id]


class TestFailure:
    def test_failure_does_not_complete_row(self, session: Session) -> None:
        """A failed event must remain available for a later attempt."""
        row = service.record(session, _event())
        session.flush()

        service.mark_failed(row, "Empfaenger nicht erreichbar")
        session.flush()

        assert row.processed_at is None
        assert row.attempts == 1

    def test_failed_event_backs_off_instead_of_being_reclaimed_immediately(
        self, session: Session
    ) -> None:
        """A permanently-failing event must not spin the worker at full speed.

        Without a backoff window, this row -- always the oldest unprocessed
        row -- would be reclaimed on the very next poll forever.
        """
        row = service.record(session, _event())
        session.flush()

        service.mark_failed(row, "Empfaenger nicht erreichbar")
        session.flush()

        assert row.next_attempt_at is not None
        assert row.next_attempt_at > now()
        assert row.id not in {candidate.id for candidate in service.claim_unprocessed(session)}

    def test_failed_event_is_claimable_again_once_backoff_elapses(self, session: Session) -> None:
        row = service.record(session, _event())
        session.flush()
        service.mark_failed(row, "Empfaenger nicht erreichbar")
        session.flush()

        row.next_attempt_at = now() - timedelta(seconds=1)
        session.flush()

        assert row.id in {candidate.id for candidate in service.claim_unprocessed(session)}

    def test_backed_off_event_does_not_starve_a_newer_eligible_event(
        self, session: Session
    ) -> None:
        """A stuck old event must not permanently occupy every claim slot."""
        stuck = service.record(session, _event())
        session.flush()
        service.mark_failed(stuck, "Empfaenger nicht erreichbar")
        session.flush()

        newer = service.record(session, _event())
        session.flush()

        claimed_ids = {candidate.id for candidate in service.claim_unprocessed(session)}
        assert stuck.id not in claimed_ids
        assert newer.id in claimed_ids

    def test_success_after_a_prior_failure_clears_the_backoff(self, session: Session) -> None:
        row = service.record(session, _event())
        session.flush()
        service.mark_failed(row, "Empfaenger nicht erreichbar")
        session.flush()

        service.mark_processed(row)

        assert row.next_attempt_at is None

    def test_long_error_message_is_truncated(self, session: Session) -> None:
        row = service.record(session, _event())
        session.flush()
        service.mark_failed(row, "x" * 5000)
        assert row.last_error is not None
        assert len(row.last_error) == 2000

    def test_mark_failed_reports_whether_this_attempt_became_terminal(
        self, session: Session
    ) -> None:
        row = service.record(session, _event())
        session.flush()

        for _ in range(service.MAX_ATTEMPTS - 1):
            assert service.mark_failed(row, "Empfaenger nicht erreichbar") is False
        assert service.mark_failed(row, "Empfaenger nicht erreichbar") is True

        assert row.attempts == service.MAX_ATTEMPTS

    def test_a_poison_event_is_marked_terminally_failed_after_max_attempts(
        self, session: Session
    ) -> None:
        """A permanently-broken event must eventually stop retrying and
        surface as a distinct, operator-visible terminal state -- not retry
        forever at the one-hour-capped cadence."""
        row = service.record(session, _event())
        session.flush()

        for _ in range(service.MAX_ATTEMPTS):
            service.mark_failed(row, "immer kaputt")
        session.flush()

        assert row.failed_at is not None
        assert row.processed_at is None
        assert row.attempts == service.MAX_ATTEMPTS

    def test_a_terminally_failed_event_is_never_reclaimed_even_once_its_backoff_elapses(
        self, session: Session
    ) -> None:
        row = service.record(session, _event())
        session.flush()
        for _ in range(service.MAX_ATTEMPTS):
            service.mark_failed(row, "immer kaputt")
        session.flush()

        # A retry-scheduled row would become claimable again once
        # next_attempt_at is in the past; a terminal one must not, regardless.
        row.next_attempt_at = now() - timedelta(seconds=1)
        session.flush()

        assert row.id not in {candidate.id for candidate in service.claim_unprocessed(session)}

    def test_a_terminally_failed_event_does_not_starve_a_newer_eligible_event(
        self, session: Session
    ) -> None:
        poison = service.record(session, _event())
        session.flush()
        for _ in range(service.MAX_ATTEMPTS):
            service.mark_failed(poison, "immer kaputt")
        session.flush()

        newer = service.record(session, _event())
        session.flush()

        claimed_ids = {candidate.id for candidate in service.claim_unprocessed(session)}
        assert poison.id not in claimed_ids
        assert newer.id in claimed_ids


class TestPayload:
    def test_carries_no_contents(self, session: Session) -> None:
        """Outbox payloads survive in storage and logs, so content must stay out."""
        row = service.record(session, _event())
        session.flush()
        assert set(row.payload.model_dump(exclude_none=True)) <= {"has_attachment"}

    def test_sensitive_plaintext_payload_is_rejected_before_persistence(self) -> None:
        with pytest.raises(ValidationError):
            DomainEvent.model_validate(
                {
                    "type": EventType.MEMORY_CREATED,
                    "space_id": new_id(),
                    "subject_type": "memory",
                    "subject_id": new_id(),
                    "payload": {"body": "privater Klartext"},
                }
            )

    def test_raw_dictionary_cannot_bypass_orm_boundary(self, session: Session) -> None:
        event = _event()
        row = OutboxEvent(
            event_type=event.type.value,
            space_id=event.space_id,
            actor_id=event.actor_id,
            subject_type=event.subject_type,
            subject_id=event.subject_id,
            payload={"body": "privater Klartext"},  # type: ignore[arg-type]
        )
        session.add(row)

        with pytest.raises(
            StatementError,
            match="PublicEventPayload required; raw outbox payload rejected",
        ):
            session.flush()

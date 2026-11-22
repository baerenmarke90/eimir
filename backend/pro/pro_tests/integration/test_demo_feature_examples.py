"""Canonical demo coverage for recently added couple features."""

from __future__ import annotations

from datetime import date, timedelta

import pytest
from eimir_pro.presence import service as presence_service
from eimir_pro.presence.models import SharingLevel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.collections import service as collection_service
from eimir.collections.models import Collection, CollectionItem, CollectionKind
from eimir.config import Environment
from eimir.demo import create_demo_space, reset_demo_space
from eimir.demo.feature_examples import (
    ANNIVERSARY_MEMORY_TITLE,
    BIRTHDAY_MEMORY_TITLE,
    MULTI_DAY_PLAN_TITLE,
    PROPOSAL_WISH_TITLE,
    SHARED_NOTE_EXAMPLES,
    SHOPPING_LIST_TITLE,
)
from eimir.identity.models import Account
from eimir.memories.models import Memory
from eimir.plans.models import Plan
from eimir.relationship import profile as relationship_profile
from eimir.shared_notes.models import SharedNote
from eimir.wishes import date_proposals
from eimir.wishes.models import Wish
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-feature-examples-test-password"


def _seed(session: Session):  # type: ignore[no-untyped-def]
    return create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )


def _memories(session: Session, space_id) -> dict[str, Memory]:  # type: ignore[no-untyped-def]
    return {
        memory.payload.title: memory
        for memory in session.scalars(select(Memory).where(Memory.space_id == space_id))
    }


def _count(session: Session, model: type, space_id) -> int:  # type: ignore[no-untyped-def]
    return int(
        session.execute(
            select(func.count()).select_from(model).where(model.space_id == space_id)
        ).scalar_one()
    )


def _assert_examples(session: Session, result) -> None:  # type: ignore[no-untyped-def]
    lea = session.get(Account, result.lea_id)
    alex = session.get(Account, result.alex_id)
    assert lea is not None and alex is not None
    assert lea.birthday is not None and alex.birthday is not None

    # Moments on occasions: the last anniversary and Alex's last birthday.
    memories = _memories(session, result.space_id)
    profile = relationship_profile.load(session, result.space_id)
    assert profile is not None and profile.relationship_started_on is not None
    anniversary = memories[ANNIVERSARY_MEMORY_TITLE].happened_on
    assert anniversary is not None and anniversary <= REFERENCE_DATE
    assert (anniversary.month, anniversary.day) == (
        profile.relationship_started_on.month,
        profile.relationship_started_on.day,
    )
    birthday_memory = memories[BIRTHDAY_MEMORY_TITLE].happened_on
    assert birthday_memory is not None and birthday_memory <= REFERENCE_DATE
    assert (birthday_memory.month, birthday_memory.day) == (alex.birthday.month, alex.birthday.day)

    # Both partners share distance and map with a published position.
    for account_id in (result.lea_id, result.alex_id):
        settings = presence_service.get_settings_view(
            session, AuthorizationContext(account_id=account_id, space_id=result.space_id)
        )
        assert settings.level is SharingLevel.DISTANCE_AND_MAP
        assert settings.last_published_at is not None

    # One shopping list with suggestions from a finished trip, open entries and a cart.
    shopping = session.scalars(
        select(Collection).where(
            Collection.space_id == result.space_id,
            Collection.kind == CollectionKind.SHOPPING.value,
        )
    ).all()
    assert [collection.payload.title for collection in shopping] == [SHOPPING_LIST_TITLE]
    lea_context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    assert collection_service.list_suggestions(session, lea_context, shopping[0].id)
    items = session.scalars(
        select(CollectionItem).where(CollectionItem.collection_id == shopping[0].id)
    ).all()
    assert any(item.completed for item in items)
    assert any(not item.completed for item in items)

    # A multi-day date-only Plan.
    plans = [
        plan
        for plan in session.scalars(select(Plan).where(Plan.space_id == result.space_id))
        if plan.payload.title == MULTI_DAY_PLAN_TITLE
    ]
    assert len(plans) == 1
    assert plans[0].planned_on is not None
    assert plans[0].planned_until == plans[0].planned_on + timedelta(days=2)

    # Alex proposed a date from his Wish; Lea has to answer.
    wish = next(
        wish
        for wish in session.scalars(select(Wish).where(Wish.space_id == result.space_id))
        if wish.payload.title == PROPOSAL_WISH_TITLE
    )
    state = date_proposals.get_state(session, lea_context, str(wish.id))
    assert state.proposal is not None
    assert state.proposal.proposed_by == result.alex_id
    assert state.proposal.recipient_id == result.lea_id

    # Shared notes: a pinned one, a pinned one that shows only its title on Wir,
    # and one with bullet entries, each written by the intended partner.
    notes = {
        note.payload.title: note
        for note in session.scalars(
            select(SharedNote).where(SharedNote.space_id == result.space_id)
        )
    }
    assert set(notes) == {example[1] for example in SHARED_NOTE_EXAMPLES}
    for by_lea, title, body, pinned, title_only in SHARED_NOTE_EXAMPLES:
        note = notes[title]
        assert note.owner_id == (result.lea_id if by_lea else result.alex_id)
        assert note.payload.body == body
        assert (note.pinned, note.wir_title_only) == (pinned, title_only)
    assert sum(note.pinned for note in notes.values()) == 2
    assert any(note.wir_title_only for note in notes.values())
    assert any("• " in note.payload.body for note in notes.values())


def test_canonical_demo_shows_recent_features_across_ensure_and_reset(session: Session) -> None:
    first = _seed(session)
    _assert_examples(session, first)
    memory_count = _count(session, Memory, first.space_id)
    plan_count = _count(session, Plan, first.space_id)
    note_count = _count(session, SharedNote, first.space_id)

    again = _seed(session)
    assert again.created is False
    _assert_examples(session, again)
    assert _count(session, Memory, again.space_id) == memory_count
    assert _count(session, Plan, again.space_id) == plan_count
    assert _count(session, SharedNote, again.space_id) == note_count

    reset = reset_demo_space(
        session,
        environment=Environment.TEST,
        reference_date=REFERENCE_DATE,
    )
    assert reset.space_id != first.space_id
    _assert_examples(session, reset)

"""Public-demo presentation coverage for the canonical seed."""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.config import Environment
from eimir.demo import create_demo_space
from eimir.demo.service import PRIVATE_CANARY_ALEX, PRIVATE_CANARY_LEA
from eimir.gift_ideas.models import GiftIdea
from eimir.heart_moments.models import HeartMoment
from eimir.people.models import ImportantDate, RelatedPerson
from eimir.private_collections.models import PrivateCollection
from eimir.private_notes.models import PrivateNote
from eimir.profiles.models import ProfilePreference
from eimir.search import service as search_service
from tests.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

REFERENCE_DATE = date(2026, 8, 24)
DEMO_PASSWORD = "canonical-demo-test-password"


def test_completed_demo_seed_hides_internal_privacy_canaries(session: Session) -> None:
    result = create_demo_space(
        session,
        environment=Environment.TEST,
        lea_password=DEMO_PASSWORD,
        alex_password=DEMO_PASSWORD,
        reference_date=REFERENCE_DATE,
    )

    payloads = [
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(ProfilePreference).where(ProfilePreference.space_id == result.space_id)
            ).scalars()
        ),
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(RelatedPerson).where(RelatedPerson.space_id == result.space_id)
            ).scalars()
        ),
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(ImportantDate).where(ImportantDate.space_id == result.space_id)
            ).scalars()
        ),
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(HeartMoment).where(HeartMoment.space_id == result.space_id)
            ).scalars()
        ),
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(PrivateNote).where(PrivateNote.space_id == result.space_id)
            ).scalars()
        ),
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(GiftIdea).where(GiftIdea.space_id == result.space_id)
            ).scalars()
        ),
        *(
            row.payload.model_dump_json()
            for row in session.execute(
                select(PrivateCollection).where(PrivateCollection.space_id == result.space_id)
            ).scalars()
        ),
    ]
    visible_text = " ".join(payloads)

    assert PRIVATE_CANARY_LEA not in visible_text
    assert PRIVATE_CANARY_ALEX not in visible_text

    lea_context = AuthorizationContext(account_id=result.lea_id, space_id=result.space_id)
    alex_context = AuthorizationContext(account_id=result.alex_id, space_id=result.space_id)
    assert search_service.search(session, lea_context, query="Fotostreifen").items
    assert search_service.search(session, alex_context, query="Fotostreifen").items == []

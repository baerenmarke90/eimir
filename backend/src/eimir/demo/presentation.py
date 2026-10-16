"""Normalize internal privacy fixtures into natural public-demo content.

The canonical seed deliberately uses unmistakable privacy canaries while it is
being assembled so isolation tests can prove that owner-only material never
leaks into shared read models. Those markers are an implementation detail, not
product copy. Public callers run this normalization before the completed demo
Space becomes available.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.demo.service import (
    PRIVATE_CANARY_ALEX,
    PRIVATE_CANARY_LEA,
    DemoSeedResult,
)
from eimir.gift_ideas.models import GiftIdea
from eimir.heart_moments.models import HeartMoment
from eimir.people.models import ImportantDate, RelatedPerson
from eimir.private_collections.models import PrivateCollection
from eimir.private_notes.models import PrivateNote
from eimir.profiles.models import ProfilePreference

LEA_PRIVATE_NOTE_BODY = "Den alten Fotostreifen rahmen lassen."
ALEX_PRIVATE_NOTE_BODY = "Frühstück und Spaziergang vorbereiten."


def normalize_demo_content(session: Session, result: DemoSeedResult) -> None:
    """Remove test-only canary tokens while preserving owner-only semantics."""
    preferences = session.execute(
        select(ProfilePreference).where(ProfilePreference.space_id == result.space_id)
    ).scalars()
    for preference in preferences:
        value = preference.payload.value
        if PRIVATE_CANARY_LEA in value:
            preference.payload = preference.payload.model_copy(
                update={"value": "Alex freut sich über handgeschriebene Karten."}
            )
        elif PRIVATE_CANARY_ALEX in value:
            preference.payload = preference.payload.model_copy(
                update={"value": "Lea mag Frühstück als kleine Überraschung."}
            )

    people = session.execute(
        select(RelatedPerson).where(RelatedPerson.space_id == result.space_id)
    ).scalars()
    for person in people:
        display_name = person.payload.display_name
        if PRIVATE_CANARY_LEA in display_name:
            person.payload = person.payload.model_copy(update={"display_name": "Jule"})
        elif PRIVATE_CANARY_ALEX in display_name:
            person.payload = person.payload.model_copy(update={"display_name": "Noah"})

    dates = session.execute(
        select(ImportantDate).where(ImportantDate.space_id == result.space_id)
    ).scalars()
    for important_date in dates:
        label = important_date.payload.label
        if PRIVATE_CANARY_LEA in label:
            important_date.payload = important_date.payload.model_copy(
                update={"label": "Geschenk für Alex abholen"}
            )
        elif PRIVATE_CANARY_ALEX in label:
            important_date.payload = important_date.payload.model_copy(
                update={"label": "Frühstück für Lea vorbereiten"}
            )

    heart_moments = session.execute(
        select(HeartMoment).where(HeartMoment.space_id == result.space_id)
    ).scalars()
    for heart_moment in heart_moments:
        if PRIVATE_CANARY_LEA in heart_moment.payload.text:
            heart_moment.payload = heart_moment.payload.model_copy(
                update={"text": "Vorfreude auf eine kleine Überraschung für Alex."}
            )
        elif PRIVATE_CANARY_ALEX in heart_moment.payload.text:
            heart_moment.payload = heart_moment.payload.model_copy(
                update={"text": "Vorfreude auf eine kleine Überraschung für Lea."}
            )

    private_notes = session.execute(
        select(PrivateNote).where(PrivateNote.space_id == result.space_id)
    ).scalars()
    for note in private_notes:
        if PRIVATE_CANARY_LEA in note.payload.body:
            note.payload = note.payload.model_copy(update={"body": LEA_PRIVATE_NOTE_BODY})
        elif PRIVATE_CANARY_ALEX in note.payload.body:
            note.payload = note.payload.model_copy(update={"body": ALEX_PRIVATE_NOTE_BODY})

    gift_ideas = session.execute(
        select(GiftIdea).where(GiftIdea.space_id == result.space_id)
    ).scalars()
    for gift_idea in gift_ideas:
        description = gift_idea.payload.description or ""
        if PRIVATE_CANARY_LEA in description:
            gift_idea.payload = gift_idea.payload.model_copy(
                update={"description": "Mit den Bildern vom See."}
            )
        elif PRIVATE_CANARY_ALEX in description:
            gift_idea.payload = gift_idea.payload.model_copy(
                update={"description": "Passend zum Sonntagskaffee."}
            )

    private_collections = session.execute(
        select(PrivateCollection).where(PrivateCollection.space_id == result.space_id)
    ).scalars()
    for collection in private_collections:
        title = collection.payload.title
        if PRIVATE_CANARY_LEA in title:
            collection.payload = collection.payload.model_copy(
                update={"title": "Überraschungen für Alex"}
            )
        elif PRIVATE_CANARY_ALEX in title:
            collection.payload = collection.payload.model_copy(
                update={"title": "Überraschungen für Lea"}
            )

    session.flush()

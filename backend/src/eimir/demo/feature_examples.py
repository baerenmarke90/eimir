"""Canonical demo examples for recently added couple features.

Each example uses the same domain service as product traffic, so the data stays
subject to normal authorization, privacy, activity and entitlement rules. The
examples are added when a canonical Space is created or reset, never by a later
``ensure``, so visitor changes survive redeploys. Each step also skips content
that already exists, so a repeated call adds nothing twice.

Covered features:

- occasions on moments (#1907 F2): both partners' birthdays plus one moment on
  the last relationship anniversary and one on Alex's birthday;
- partner distance and the map connection on Wir (#1907 H1): both partners
  share distance and map with a fictional position;
- shopping lists (#1808): a shopping list with a finished trip (suggestions),
  open entries and a filled cart;
- multi-day date-only Plans (#1895);
- a date proposal from a Wish (#1911) that Lea has not answered yet;
- shared notes (#1969): a pinned note, a pinned note whose Wir tile shows only
  the title, and a note with bullet entries.
"""

from __future__ import annotations

import calendar
from datetime import date, datetime, time, timedelta
from uuid import NAMESPACE_URL, UUID, uuid5
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext
from eimir.collections import service as collection_service
from eimir.collections.models import Collection, CollectionKind
from eimir.core import clock
from eimir.demo.service import DemoSeedResult
from eimir.identity.models import Account
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.plans import service as plan_service
from eimir.plans.models import Plan
from eimir.presence import service as presence_service
from eimir.presence.models import SharingLevel
from eimir.profiles import service as profile_service
from eimir.relationship import profile as relationship_profile
from eimir.shared_notes import service as shared_note_service
from eimir.shared_notes.models import SharedNote
from eimir.wishes import date_proposals
from eimir.wishes.models import Wish, WishStatus

DEMO_ZONE = ZoneInfo("Europe/Berlin")

LEA_BIRTH_YEAR = 1995
ALEX_BIRTH_YEAR = 1993
LEA_BIRTHDAY_DAYS_AHEAD = 17
ALEX_BIRTHDAY_DAYS_AGO = 43

ANNIVERSARY_MEMORY_TITLE = "Unser Jahrestag am Fluss"
BIRTHDAY_MEMORY_TITLE = "Geburtstagsfrühstück für Alex"

# Fictional positions in two neighboring cities (about 34 km apart).
LEA_POSITION = (50.9375, 6.9603)
ALEX_POSITION = (51.2277, 6.7735)
POSITION_ACCURACY_METERS = 25.0

SHOPPING_LIST_TITLE = "Wocheneinkauf"
SHOPPING_EARLIER_TRIP = (
    ("Kaffeebohnen", None),
    ("Haferflocken", None),
    ("Tomaten", "500 g"),
    ("Spülmittel", None),
)
# (author is Lea, title, quantity, already in the cart)
SHOPPING_CURRENT_ITEMS = (
    (True, "Hafermilch", "2", False),
    (True, "Äpfel", "6", False),
    (False, "Frisches Brot", None, False),
    (True, "Blumen für Mara", None, False),
    (True, "Basilikum", None, True),
    (False, "Parmesan", None, True),
)

MULTI_DAY_PLAN_TITLE = "Wochenende in Hamburg"
# (written by Lea, title, body, pinned to Wir, the Wir tile shows the title only)
SHARED_NOTE_EXAMPLES = (
    (
        False,
        "Wochenende am See",
        "Treffpunkt um neun am Parkplatz. "
        "Sonnencreme nicht vergessen, am Nachmittag soll es warm werden.",
        True,
        False,
    ),
    (
        True,
        "WLAN im Gästezimmer",
        "Netzwerk: Sofa-Café\nDer Zugang steht auf dem Zettel im Flur.",
        True,
        True,
    ),
    (
        True,
        "Herbstideen",
        "Dafür wollen wir uns Zeit nehmen:\n"
        "• Kürbissuppe kochen\n"
        "• Drachen steigen lassen am Waldsee\n"
        "• Das Sommer-Fotoalbum fertig machen",
        False,
        False,
    ),
)
PROPOSAL_WISH_TITLE = "Frühstück am See"
# Stable idempotency key so a repeated ensure resolves the same proposal.
_PROPOSAL_NAMESPACE = uuid5(NAMESPACE_URL, "urn:eimir:demo:wish-date-proposal")


def _same_day_in_year(day: date, year: int) -> date:
    """``day``'s month and day in ``year``; February 29 falls back to February 28."""
    last = calendar.monthrange(year, day.month)[1]
    return date(year, day.month, min(day.day, last))


def _last_occurrence(day: date, *, on_or_before: date) -> date:
    candidate = _same_day_in_year(day, on_or_before.year)
    if candidate > on_or_before:
        candidate = _same_day_in_year(day, on_or_before.year - 1)
    return candidate


def _context(result: DemoSeedResult, account_id: UUID) -> AuthorizationContext:
    return AuthorizationContext(account_id=account_id, space_id=result.space_id)


def _ensure_birthdays(session: Session, result: DemoSeedResult, *, reference_date: date) -> date:
    """Give both partners a birthday; return Alex's latest birthday on or before the reference."""
    birthdays = {
        result.lea_id: _same_day_in_year(
            reference_date + timedelta(days=LEA_BIRTHDAY_DAYS_AHEAD), LEA_BIRTH_YEAR
        ),
        result.alex_id: _same_day_in_year(
            reference_date - timedelta(days=ALEX_BIRTHDAY_DAYS_AGO), ALEX_BIRTH_YEAR
        ),
    }
    for account_id, birthday in birthdays.items():
        account = session.get(Account, account_id)
        assert account is not None
        if account.birthday == birthday:
            continue
        profile_service.update_profile_identity(
            session,
            _context(result, account_id),
            account_id,
            expected_version=account.version,
            changed_fields=frozenset({"birthday"}),
            display_name=None,
            profile_attachment_id=None,
            birthday=birthday,
        )
    return _last_occurrence(birthdays[result.alex_id], on_or_before=reference_date)


def _ensure_occasion_memories(
    session: Session, result: DemoSeedResult, *, reference_date: date
) -> None:
    alex_birthday = _ensure_birthdays(session, result, reference_date=reference_date)
    profile = relationship_profile.load(session, result.space_id)
    if profile is None or profile.relationship_started_on is None:
        raise RuntimeError("Canonical demo Space has no relationship start.")
    anniversary = _last_occurrence(profile.relationship_started_on, on_or_before=reference_date)

    existing = {
        memory.payload.title
        for memory in session.scalars(select(Memory).where(Memory.space_id == result.space_id))
    }
    examples = (
        (
            result.lea_id,
            ANNIVERSARY_MEMORY_TITLE,
            "Picknickdecke, unser erster gemeinsamer Song und viel zu viel Kuchen.",
            anniversary,
        ),
        (
            result.alex_id,
            BIRTHDAY_MEMORY_TITLE,
            "Kerzen auf den Pancakes und Kaffee im Bett. "
            "Alex hat so getan, als hätte er nichts geahnt.",
            alex_birthday,
        ),
    )
    for account_id, title, body, happened_on in examples:
        if title in existing:
            continue
        memory_service.create_memory(
            session,
            _context(result, account_id),
            title=title,
            body=body,
            happened_on=happened_on,
        )


def _ensure_partner_location(session: Session, result: DemoSeedResult) -> None:
    if not presence_service.feature_enabled():
        return
    captured_at = clock.now()
    for account_id, (latitude, longitude) in (
        (result.lea_id, LEA_POSITION),
        (result.alex_id, ALEX_POSITION),
    ):
        context = _context(result, account_id)
        settings = presence_service.get_settings_view(session, context)
        if not settings.available:
            return
        if settings.level is not SharingLevel.DISTANCE_AND_MAP or not settings.indefinite:
            settings = presence_service.update_settings(
                session,
                context,
                level=SharingLevel.DISTANCE_AND_MAP,
                indefinite=True,
                expires_at=None,
            )
        presence_service.publish_snapshot(
            session,
            context,
            latitude=latitude,
            longitude=longitude,
            accuracy_meters=POSITION_ACCURACY_METERS,
            captured_at=captured_at,
            consent_generation=settings.generation,
        )


def _ensure_shopping_list(session: Session, result: DemoSeedResult) -> None:
    exists = session.scalar(
        select(Collection.id).where(
            Collection.space_id == result.space_id,
            Collection.kind == CollectionKind.SHOPPING.value,
        )
    )
    if exists is not None:
        return

    lea = _context(result, result.lea_id)
    alex = _context(result, result.alex_id)
    shopping = collection_service.create_collection(
        session, lea, title=SHOPPING_LIST_TITLE, kind=CollectionKind.SHOPPING
    )
    earlier = [
        collection_service.create_item(
            session, alex, shopping.id, title=title, quantity=quantity, completed=True
        ).id
        for title, quantity in SHOPPING_EARLIER_TRIP
    ]
    collection_service.finish_shopping(session, alex, shopping.id, item_ids=earlier)
    for by_lea, title, quantity, in_cart in SHOPPING_CURRENT_ITEMS:
        collection_service.create_item(
            session,
            lea if by_lea else alex,
            shopping.id,
            title=title,
            quantity=quantity,
            completed=in_cart,
        )


def _ensure_multi_day_plan(
    session: Session, result: DemoSeedResult, *, reference_date: date
) -> None:
    exists = session.scalars(select(Plan).where(Plan.space_id == result.space_id)).all()
    if any(plan.payload.title == MULTI_DAY_PLAN_TITLE for plan in exists):
        return
    # The Friday two to three weeks after the reference date, through Sunday.
    first_day = reference_date + timedelta(days=(4 - reference_date.weekday()) % 7 + 14)
    plan_service.create_plan(
        session,
        _context(result, result.alex_id),
        title=MULTI_DAY_PLAN_TITLE,
        description="Hafen, Fischbrötchen und abends ins Musical.",
        place_id=None,
        planned_on=first_day,
        planned_until=first_day + timedelta(days=2),
    )


def _ensure_wish_date_proposal(
    session: Session, result: DemoSeedResult, *, reference_date: date
) -> None:
    wish = next(
        (
            wish
            for wish in session.scalars(
                select(Wish).where(
                    Wish.space_id == result.space_id,
                    Wish.status == WishStatus.OPEN.value,
                )
            )
            if wish.payload.title == PROPOSAL_WISH_TITLE
        ),
        None,
    )
    if wish is None:
        return
    proposer = _context(result, wish.owner_id)
    if date_proposals.get_state(session, proposer, str(wish.id)).proposal is not None:
        return
    # A proposal must lie in the future even when the reference date is in the past.
    anchor = max(reference_date, clock.today_in(DEMO_ZONE.key))
    saturday = anchor + timedelta(days=(5 - anchor.weekday()) % 7 + 7)
    planned_start = datetime.combine(saturday, time(9, 30), tzinfo=DEMO_ZONE)
    date_proposals.propose(
        session,
        proposer,
        str(wish.id),
        planned_start=planned_start,
        client_request_id=uuid5(_PROPOSAL_NAMESPACE, f"{wish.id}:{planned_start.isoformat()}"),
    )


def _ensure_shared_notes(session: Session, result: DemoSeedResult) -> None:
    existing = {
        note.payload.title
        for note in session.scalars(
            select(SharedNote).where(SharedNote.space_id == result.space_id)
        )
    }
    for by_lea, title, body, pinned, title_only in SHARED_NOTE_EXAMPLES:
        if title in existing:
            continue
        context = _context(result, result.lea_id if by_lea else result.alex_id)
        note = shared_note_service.create_note(session, context, title=title, body=body)
        if pinned or title_only:
            shared_note_service.set_presentation(
                session, context, note.id, pinned=pinned, wir_title_only=title_only
            )


def ensure_feature_examples(
    session: Session, result: DemoSeedResult, *, reference_date: date
) -> None:
    """Idempotently add the recent-feature examples to the canonical demo Space."""
    _ensure_occasion_memories(session, result, reference_date=reference_date)
    _ensure_partner_location(session, result)
    _ensure_shopping_list(session, result)
    _ensure_multi_day_plan(session, result, reference_date=reference_date)
    _ensure_wish_date_proposal(session, result, reference_date=reference_date)
    _ensure_shared_notes(session, result)

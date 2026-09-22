"""Create and reset the canonical eimir. demo space.

The demo is a development/QA facility, not a second domain implementation.
Every seeded resource is created through the same service boundary as normal
application traffic. The only destructive shortcut is deleting the already
verified demo Space during reset; media is detached and purged first so reset
does not leave provider objects behind.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from eimir.attachments import binding as attachment_binding
from eimir.attachments import service as attachment_service
from eimir.attachments.models import Attachment
from eimir.auth import passwords
from eimir.authorization import AuthorizationContext, ContentVisibility
from eimir.chapters import service as chapter_service
from eimir.collections import service as collection_service
from eimir.comments import service as comment_service
from eimir.comments.models import CommentTarget
from eimir.config import Environment
from eimir.db.locks import lock_subject
from eimir.db.mixins import INITIAL_VERSION
from eimir.daily_checkins import service as daily_checkin_service
from eimir.daily_checkins.models import DailyVibe
from eimir.dashboard import preferences as dashboard_preferences
from eimir.demo.assets import (
    DemoAssetCatalog,
    import_demo_asset,
    load_and_validate_assets,
)
from eimir.demo.canonical import (
    ALEX_EMAIL,
    ALEX_NAME,
    LEA_EMAIL,
    LEA_NAME,
    RESERVED_IDENTITIES,
    DemoPersona,
)
from eimir.demo.models import DemoCanonicalIdentity
from eimir.demo.story import CHAPTERS, MEMORIES
from eimir.engagement import service as engagement_service
from eimir.gift_ideas import service as gift_idea_service
from eimir.heart_moments import service as heart_moment_service
from eimir.heart_moments.models import HeartEmotion, HeartMoment
from eimir.identity import service as identity_service
from eimir.identity.models import Account
from eimir.memories import service as memory_service
from eimir.memories.models import Memory
from eimir.milestones import service as milestone_service
from eimir.people import service as people_service
from eimir.people.models import DateRepeat, ImportantDateType, PersonRelationship
from eimir.places import service as place_service
from eimir.plans import service as plan_service
from eimir.private_collections import service as private_collection_service
from eimir.private_notes import service as private_note_service
from eimir.profiles import service as profile_service
from eimir.profiles.models import (
    PreferenceCategory,
    PreferenceSentiment,
    ProfileVisibility,
)
from eimir.relationship import configuration as space_configuration_service
from eimir.relationship import profile as relationship_profile
from eimir.relationship import service as relationship_service
from eimir.relationship.models import (
    DailyCheckInVisibilityMode,
    DurationDisplayMode,
    Membership,
    MembershipStatus,
    Space,
)
from eimir.wishes import service as wish_service

PRIVATE_CANARY_LEA = "CANARY-PRIVATE-LEA-7421"
PRIVATE_CANARY_ALEX = "CANARY-PRIVATE-ALEX-9134"

_CANONICAL_DATASET_LOCK = "canonical_demo_dataset"
_CANONICAL_DATASET_SUBJECT = "canonical"
_DEMO_DAILY_CONTEXT_TIMEZONE = "Europe/Berlin"


def _lock_canonical_demo_dataset(session: Session) -> None:
    """Serialize canonical demo create/ensure/reset mutations until commit.

    Every supported entry point -- CLI ``create``/``ensure``/``reset`` and the
    periodic reset worker -- reaches the reserved Lea/Alex dataset only
    through :func:`create_demo_space` or :func:`reset_demo_space`. Acquiring
    the lock here, before either function reads the reserved accounts or
    their Space membership, is therefore enough to cover every caller: no
    individual caller has to remember to take it (#690).

    A PostgreSQL advisory transaction lock provides the cross-process
    boundary the previous scheduler-only advisory lock (``demo.reset``) did
    not: that lock only ever guarded *scheduling bookkeeping* (whether a
    pending/running reset Job already exists), not the dataset mutation
    itself, so a manual CLI reset could still race a scheduled one. Held for
    the rest of the transaction, this one also serializes the MediaStore
    side effects `_detach_and_purge_media` performs -- they are not
    transactional, so only mutual exclusion (not the DB transaction) keeps
    two overlapping resets from racing the same provider objects.

    Lock ordering matches ``auth.demo_authority``'s documented contract: the
    periodic reset acquires the auth authority lock first, then reaches this
    one through `reset_demo_space`, then the scheduler lock through
    `schedule_next` -- auth-authority -> dataset -> scheduler. The CLI only
    ever takes this lock, a strict subset of that same order, so no caller
    can form a cycle.
    """
    lock_subject(session, _CANONICAL_DATASET_LOCK, _CANONICAL_DATASET_SUBJECT)


@dataclass(frozen=True)
class DemoSeedResult:
    """Stable identifiers returned by create/reset without exposing credentials."""

    lea_id: UUID
    alex_id: UUID
    space_id: UUID
    reference_date: date
    created: bool


def _ensure_allowed(environment: Environment) -> None:
    if environment is Environment.PRODUCTION:
        raise RuntimeError("Canonical demo data must never be created in production.")


def _active_space_ids(session: Session, account: Account) -> set[UUID]:
    return set(
        session.execute(
            select(Membership.space_id).where(
                Membership.account_id == account.id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        ).scalars()
    )


def _verify_marker_if_present(
    session: Session, account: Account, *, persona: str, email: str
) -> None:
    """Refuse if ``persona``'s durable marker already points elsewhere.

    Read-only: a *missing* marker is not decided here at all. Whether a
    reserved-address Account without one yet may be adopted depends on
    whether an already-existing, already-verified canonical Space proves it
    -- see :func:`_backfill_missing_markers`, which runs only after that
    proof, never before it (#633 follow-up: owning the reserved address
    alone is not sufficient evidence to adopt).
    """
    existing = session.get(DemoCanonicalIdentity, persona)
    if existing is not None and existing.account_id != account.id:
        raise RuntimeError(
            f"Refusing demo operation: {email} does not resolve to the expected "
            "demo identity marker."
        )


def _resolve_reserved_account(session: Session, *, persona: str, email: str) -> Account | None:
    account = identity_service.find_by_email(session, email)
    if account is None:
        return None
    _verify_marker_if_present(session, account, persona=persona, email=email)
    return account


def _existing_accounts(session: Session) -> tuple[Account | None, Account | None]:
    """Resolve the reserved accounts by their durable technical identity.

    ``display_name`` is presentation state in the domain model and must never
    serve as durable demo identity (#633); it plays no part in this
    resolution. This performs no write: a reserved-address Account without a
    marker yet is returned as-is, neither adopted nor rejected here -- see
    :func:`_backfill_missing_markers` for when adopting it is actually safe.

    This stays fail-closed even though ``demo.canonical`` already prevents a
    public Demo visitor from renaming a persona through the profile API
    (#697): an operator or a direct database edit could still bind the
    reserved address or the marker to an unexpected Account, and a reset that
    guessed which Account was meant would be exactly the wrong response to
    that.
    """
    lea = _resolve_reserved_account(session, persona=DemoPersona.LEA, email=LEA_EMAIL)
    alex = _resolve_reserved_account(session, persona=DemoPersona.ALEX, email=ALEX_EMAIL)
    if (lea is None) != (alex is None):
        raise RuntimeError(
            "Refusing demo operation: only one reserved demo account exists. "
            "Resolve the partial state explicitly before retrying."
        )
    return lea, alex


def _missing_marker_personas(session: Session, lea: Account, alex: Account) -> list[str]:
    return [
        persona
        for persona, account in ((DemoPersona.LEA, lea), (DemoPersona.ALEX, alex))
        if session.get(DemoCanonicalIdentity, persona) is None
    ]


def _backfill_missing_markers(session: Session, lea: Account, alex: Account) -> None:
    """Adopt whichever persona still lacks a durable marker.

    Callers must only reach this once an already-existing, already-verified
    canonical Space unambiguously proves ``lea``/``alex`` are the existing
    canonical pair (`_shared_demo_space` succeeded) -- never merely because
    both reserved addresses resolve to *some* Account. Two reserved-address
    Accounts with no marker and no such Space are exactly the ambiguous case
    that must fail closed instead: see the callers in `create_demo_space` and
    `reset_demo_space`.

    Fail-closed stays intact even here: an Account that already carries a
    *different* persona's marker is never adopted into this one.
    """
    for persona, account, email in (
        (DemoPersona.LEA, lea, LEA_EMAIL),
        (DemoPersona.ALEX, alex, ALEX_EMAIL),
    ):
        if session.get(DemoCanonicalIdentity, persona) is not None:
            continue
        conflicting = session.execute(
            select(DemoCanonicalIdentity).where(DemoCanonicalIdentity.account_id == account.id)
        ).scalar_one_or_none()
        if conflicting is not None:
            raise RuntimeError(
                f"Refusing demo operation: {email} already carries the "
                f"{conflicting.persona} demo identity marker."
            )
        session.add(DemoCanonicalIdentity(persona=persona, account_id=account.id))
    session.flush()


def _restore_canonical_presentation(session: Session, lea: Account, alex: Account) -> None:
    """Restore the presentation state reset owns (#633).

    The durable identity marker means create/ensure/reset no longer depend on
    ``display_name`` to recognize a persona. Public Demo visitors are
    currently prevented from changing it at all through the normal API
    (#697), but legacy data, an operator edit, or a direct database change
    can still leave it drifted; a successful reset is what makes it
    recoverable rather than a permanent fail-closed condition.
    """
    if lea.display_name != RESERVED_IDENTITIES[LEA_EMAIL]:
        identity_service.update_display_name(session, lea, RESERVED_IDENTITIES[LEA_EMAIL])
    if alex.display_name != RESERVED_IDENTITIES[ALEX_EMAIL]:
        identity_service.update_display_name(session, alex, RESERVED_IDENTITIES[ALEX_EMAIL])


def _shared_demo_space(
    session: Session,
    lea: Account,
    alex: Account,
    *,
    required: bool,
) -> Space | None:
    lea_spaces = _active_space_ids(session, lea)
    alex_spaces = _active_space_ids(session, alex)
    shared = lea_spaces & alex_spaces

    if len(shared) > 1:
        raise RuntimeError("Refusing demo operation: demo accounts share multiple active Spaces.")
    if shared:
        space_id = next(iter(shared))
        if lea_spaces != {space_id} or alex_spaces != {space_id}:
            raise RuntimeError(
                "Refusing demo operation: a reserved demo account also belongs to "
                "another active Space."
            )
        space = session.get(Space, space_id)
        if space is None:
            raise RuntimeError("Demo membership references a missing Space.")
        return space

    if lea_spaces or alex_spaces:
        raise RuntimeError(
            "Refusing demo operation: reserved demo accounts are active in different Spaces."
        )
    if required:
        raise RuntimeError("Canonical demo Space does not exist; run the create command first.")
    return None


def _create_accounts(
    session: Session,
    *,
    lea_password: str,
    alex_password: str,
) -> tuple[Account, Account]:
    # Validate both before writing either account so bad input cannot create a
    # partial reserved identity even inside a manually managed transaction.
    passwords.validate(lea_password)
    passwords.validate(alex_password)
    lea = identity_service.create_account(
        session,
        display_name=LEA_NAME,
        email=LEA_EMAIL,
        password_hash=passwords.hash_password(lea_password),
    )
    alex = identity_service.create_account(
        session,
        display_name=ALEX_NAME,
        email=ALEX_EMAIL,
        password_hash=passwords.hash_password(alex_password),
    )
    session.add(DemoCanonicalIdentity(persona=DemoPersona.LEA, account_id=lea.id))
    session.add(DemoCanonicalIdentity(persona=DemoPersona.ALEX, account_id=alex.id))
    session.flush()
    return lea, alex


def _new_space(session: Session, lea: Account, alex: Account) -> Space:
    space = relationship_service.create_space(session, lea)
    relationship_service.add_member(session, space.id, alex)
    return space


def _context(account: Account, space: Space) -> AuthorizationContext:
    return AuthorizationContext(account_id=account.id, space_id=space.id)


def _ensure_demo_configuration(session: Session, space: Space, lea: Account) -> None:
    """Persist the deterministic #432 module configuration for the canonical Demo.

    This helper is only called after the reserved Lea/Alex dataset has been
    created or verified as canonical. Older Demo databases may have crossed
    migration 0062 as an already-two-member Space and therefore have no
    configuration manager; that generic migration correctly failed closed.
    The canonical Demo is different: its seed contract itself defines Lea as
    the founder, so repairing only this verified fixture does not infer
    authority for user Spaces.
    """
    manager_membership = session.execute(
        select(Membership)
        .where(
            Membership.space_id == space.id,
            Membership.account_id == lea.id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .with_for_update(read=True)
    ).scalar_one_or_none()
    if manager_membership is None:
        raise RuntimeError("Canonical demo founder has no active Membership.")

    if space.configuration_manager_account_id is None:
        # The generic domain primitive is now the single NULL -> active-member
        # authority transition. Canonical Demo verification above supplies the
        # fact that Lea is the known founder; no user-Space inference is added.
        space = relationship_service.reconcile_configuration_manager(
            session,
            space.id,
            lea.id,
        )
    elif space.configuration_manager_account_id != lea.id:
        raise RuntimeError(
            "Refusing demo configuration repair: canonical Demo has an unexpected "
            "configuration manager."
        )

    configuration = space_configuration_service.load(session, space.id)
    if configuration is not None and (
        configuration.vibe_check_enabled
        and configuration.energy_check_in_enabled
        and configuration.love_notes_enabled
        and configuration.support_gestures_enabled
        and configuration.shared_achievements_enabled
        and configuration.daily_questions_enabled
        and configuration.daily_context_timezone == _DEMO_DAILY_CONTEXT_TIMEZONE
        and configuration.vibe_visibility_mode == DailyCheckInVisibilityMode.MUTUAL_REVEAL.value
        and configuration.energy_visibility_mode == DailyCheckInVisibilityMode.MUTUAL_REVEAL.value
    ):
        return

    expected_version = INITIAL_VERSION
    if configuration is not None:
        expected_version = configuration.version
    space_configuration_service.update(
        session,
        space.id,
        manager_membership,
        expected_version=expected_version,
        vibe_check_enabled=True,
        energy_check_in_enabled=True,
        love_notes_enabled=True,
        support_gestures_enabled=True,
        shared_achievements_enabled=True,
        daily_questions_enabled=True,
        daily_context_timezone=_DEMO_DAILY_CONTEXT_TIMEZONE,
        vibe_visibility_mode=DailyCheckInVisibilityMode.MUTUAL_REVEAL,
        energy_visibility_mode=DailyCheckInVisibilityMode.MUTUAL_REVEAL,
    )


def _instant(day: date, hour: int) -> datetime:
    return datetime.combine(day, time(hour=hour, tzinfo=UTC))


def _seed_daily_check_ins(
    session: Session,
    lea_context: AuthorizationContext,
    alex_context: AuthorizationContext,
    *,
    reference_date: date,
) -> None:
    """Seed recent Daily Check-in history through the normal write boundary.

    The deliberately uneven rows make the Pro insights and Mutual Reveal
    states representative without turning the demo into a wall of perfect
    daily participation. Today's values exist for both personas so the public
    entry point opens with a useful, fully revealed example.
    """
    history: tuple[
        tuple[int, DailyVibe | None, int | None, DailyVibe | None, int | None],
        ...,
    ] = (
        (0, DailyVibe.GOOD, 80, DailyVibe.OKAY, 70),
        (1, DailyVibe.OKAY, 70, DailyVibe.GOOD, 80),
        (2, DailyVibe.STRESSED, 50, DailyVibe.OKAY, 60),
        (3, DailyVibe.GOOD, 90, DailyVibe.GOOD, 80),
        (4, DailyVibe.NEEDS_CONNECTION, 40, DailyVibe.OKAY, 60),
        (5, DailyVibe.GOOD, 60, None, 70),
        (6, DailyVibe.OKAY, 70, DailyVibe.STRESSED, 50),
        (7, DailyVibe.GOOD, 80, DailyVibe.GOOD, 90),
        (8, DailyVibe.NEEDS_SPACE, 40, DailyVibe.OKAY, 70),
        (9, None, None, DailyVibe.GOOD, 80),
        (10, DailyVibe.SAD, 40, None, None),
        (11, DailyVibe.OKAY, 60, DailyVibe.OKAY, 60),
        (12, DailyVibe.GOOD, 90, DailyVibe.NEEDS_CONNECTION, 50),
        (13, DailyVibe.GOOD, 80, DailyVibe.GOOD, 80),
    )

    def write(
        context: AuthorizationContext,
        checked_on: date,
        *,
        vibe: DailyVibe | None,
        energy: int | None,
    ) -> None:
        if vibe is None and energy is None:
            return
        daily_checkin_service.update_today(
            session,
            context,
            expected_token=daily_checkin_service.concurrency_token(None, checked_on),
            vibe=daily_checkin_service.DimensionUpdate(
                supplied=vibe is not None,
                value=vibe,
            ),
            energy=daily_checkin_service.DimensionUpdate(
                supplied=energy is not None,
                value=energy,
            ),
            at=_instant(checked_on, 12),
        )

    for days_ago, lea_vibe, lea_energy, alex_vibe, alex_energy in history:
        checked_on = reference_date - timedelta(days=days_ago)
        write(lea_context, checked_on, vibe=lea_vibe, energy=lea_energy)
        write(alex_context, checked_on, vibe=alex_vibe, energy=alex_energy)


def _seed_relationship(
    session: Session,
    space: Space,
    *,
    reference_date: date,
) -> None:
    profile = relationship_profile.load(session, space.id)
    if profile is None:
        raise RuntimeError("Fresh demo Space has no SpaceProfile.")
    relationship_profile.update(
        session,
        space.id,
        expected_version=profile.version,
        relationship_started_on=reference_date - timedelta(days=3 * 365 + 83),
        show_relationship_duration=True,
        duration_display_mode=DurationDisplayMode.YEARS_MONTHS,
        today=reference_date,
    )


def _seed_profiles(
    session: Session,
    lea: Account,
    alex: Account,
    lea_context: AuthorizationContext,
    alex_context: AuthorizationContext,
) -> None:
    profile_service.create_preference(
        session,
        lea_context,
        account_id=lea.id,
        visibility=ProfileVisibility.SELF_PROFILE,
        category=PreferenceCategory.FOOD,
        topic="Lieblingsessen",
        sentiment=PreferenceSentiment.LOVE,
        value="Pasta mit viel Parmesan",
    )
    profile_service.create_preference(
        session,
        lea_context,
        account_id=lea.id,
        visibility=ProfileVisibility.SELF_PROFILE,
        category=PreferenceCategory.ACTIVITIES,
        topic="Sonntag",
        sentiment=PreferenceSentiment.LIKE,
        value="Lange Spaziergänge und Kaffee danach",
    )
    profile_service.create_preference(
        session,
        alex_context,
        account_id=alex.id,
        visibility=ProfileVisibility.SELF_PROFILE,
        category=PreferenceCategory.MUSIC,
        topic="Unterwegs",
        sentiment=PreferenceSentiment.LOVE,
        value="Indie und ruhige elektronische Musik",
    )
    profile_service.create_preference(
        session,
        alex_context,
        account_id=alex.id,
        visibility=ProfileVisibility.SELF_PROFILE,
        category=PreferenceCategory.TRAVEL,
        topic="Kurzurlaub",
        sentiment=PreferenceSentiment.LIKE,
        value="Kleine Städte, Seen und gutes Frühstück",
    )
    profile_service.create_preference(
        session,
        lea_context,
        account_id=alex.id,
        visibility=ProfileVisibility.PRIVATE_PARTNER_NOTE,
        category=PreferenceCategory.OTHER,
        topic="Überraschung",
        sentiment=PreferenceSentiment.LOVE,
        value=f"{PRIVATE_CANARY_LEA} - Alex freut sich über handgeschriebene Karten.",
    )
    profile_service.create_preference(
        session,
        alex_context,
        account_id=lea.id,
        visibility=ProfileVisibility.PRIVATE_PARTNER_NOTE,
        category=PreferenceCategory.OTHER,
        topic="Überraschung",
        sentiment=PreferenceSentiment.LOVE,
        value=f"{PRIVATE_CANARY_ALEX} - Lea mag Frühstück als kleine Überraschung.",
    )


def _seed_people(
    session: Session,
    lea_context: AuthorizationContext,
    alex_context: AuthorizationContext,
    *,
    reference_date: date,
) -> None:
    shared_friend = people_service.create_person(
        session,
        lea_context,
        display_name="Mara",
        relationship=PersonRelationship.FRIEND,
        birthday=date(reference_date.year - 31, 5, 12),
        birthday_year_known=True,
        visibility=ContentVisibility.SHARED,
    )
    lea_private = people_service.create_person(
        session,
        lea_context,
        display_name=f"{PRIVATE_CANARY_LEA} Person",
        relationship=PersonRelationship.OTHER,
        birthday=None,
        birthday_year_known=False,
        visibility=ContentVisibility.PRIVATE,
    )
    alex_private = people_service.create_person(
        session,
        alex_context,
        display_name=f"{PRIVATE_CANARY_ALEX} Person",
        relationship=PersonRelationship.OTHER,
        birthday=None,
        birthday_year_known=False,
        visibility=ContentVisibility.PRIVATE,
    )
    people_service.create_date(
        session,
        lea_context,
        label="Mara hat Geburtstag",
        date_type=ImportantDateType.BIRTHDAY,
        day=date(reference_date.year, 10, 18),
        repeats=DateRepeat.ANNUALLY,
        visibility=ContentVisibility.SHARED,
        related_person_id=shared_friend.id,
    )
    people_service.create_date(
        session,
        lea_context,
        label=f"{PRIVATE_CANARY_LEA} privater Termin",
        date_type=ImportantDateType.CUSTOM,
        day=reference_date + timedelta(days=9),
        repeats=DateRepeat.NONE,
        visibility=ContentVisibility.PRIVATE,
        related_person_id=lea_private.id,
    )
    people_service.create_date(
        session,
        alex_context,
        label=f"{PRIVATE_CANARY_ALEX} privater Termin",
        date_type=ImportantDateType.CUSTOM,
        day=reference_date + timedelta(days=12),
        repeats=DateRepeat.NONE,
        visibility=ContentVisibility.PRIVATE,
        related_person_id=alex_private.id,
    )


def _seed_story(
    session: Session,
    lea_context: AuthorizationContext,
    alex_context: AuthorizationContext,
    *,
    assets: DemoAssetCatalog,
    reference_date: date,
) -> None:
    contexts = {"lea": lea_context, "alex": alex_context}
    memories: dict[str, Memory] = {}
    for story in MEMORIES:
        context = contexts[story.owner]
        memory = memory_service.create_memory(
            session,
            context,
            title=story.title,
            body=story.body,
            happened_on=reference_date - timedelta(days=story.days_ago),
        )
        memories[story.key] = memory
        attachments = [
            import_demo_asset(session, context, assets.require(asset_id))
            for asset_id in story.asset_ids
        ]
        memory_service.replace_attachments(
            session,
            context,
            memory.id,
            expected_version=memory.version,
            entries=[(attachment.id, index) for index, attachment in enumerate(attachments)],
        )

    shared_heart = heart_moment_service.create_heart_moment(
        session,
        alex_context,
        text="Danke, dass du heute einfach zugehört hast.",
        emotion=HeartEmotion.APPRECIATED,
        visibility=ContentVisibility.SHARED,
        happened_on=reference_date - timedelta(days=3),
    )
    private_image = import_demo_asset(session, lea_context, assets.require("private-flowers"))
    heart_moment_service.create_heart_moment(
        session,
        lea_context,
        text=PRIVATE_CANARY_LEA,
        emotion=HeartEmotion.GRATEFUL,
        visibility=ContentVisibility.PRIVATE,
        happened_on=reference_date - timedelta(days=2),
        attachment_id=private_image.id,
    )

    milestone_service.create_milestone(
        session,
        alex_context,
        title="Unser erster gemeinsamer Garten",
        body="Die ersten Kräuter haben tatsächlich überlebt.",
        happened_on=reference_date - timedelta(days=136),
    )
    milestone_service.create_milestone(
        session,
        lea_context,
        title="Ein Jahr in unserer Wohnung",
        body="Noch immer unser liebster Ort für einen ruhigen Sonntag.",
        happened_on=reference_date - timedelta(days=23),
    )
    milestone_service.create_milestone(
        session,
        alex_context,
        title="Drei Jahre wir",
        body="Kein großes Programm, nur unser Lieblingsessen und ein langer Spaziergang.",
        happened_on=reference_date - timedelta(days=83),
    )

    comment_service.create_comment(
        session,
        lea_context,
        target_type=CommentTarget.MEMORY,
        target_id=memories["lake-walk"].id,
        body="Nächstes Mal nehmen wir wieder Kaffee mit.",
    )
    comment_service.create_comment(
        session,
        alex_context,
        target_type=CommentTarget.MEMORY,
        target_id=memories["ravioli-evening"].id,
        body="Die krummen waren trotzdem die besten.",
    )
    comment_service.create_comment(
        session,
        lea_context,
        target_type=CommentTarget.MEMORY,
        target_id=memories["trier-weekend"].id,
        body="Da müssen wir nochmal hin, aber diesmal zwei Nächte.",
    )
    comment_service.create_comment(
        session,
        lea_context,
        target_type=CommentTarget.HEART_MOMENT,
        target_id=shared_heart.id,
        body="Das bedeutet mir viel.",
    )


def _seed_planning(
    session: Session,
    lea_context: AuthorizationContext,
    alex_context: AuthorizationContext,
    *,
    reference_date: date,
) -> None:
    cafe = place_service.create_place(
        session,
        lea_context,
        name="Café am Markt",
        description="Unser Treffpunkt für Kaffee und ein langes Frühstück.",
        address=None,
        latitude=None,
        longitude=None,
    )
    lake = place_service.create_place(
        session,
        alex_context,
        name="Waldsee",
        description="Ruhige Runde am Wasser für Spaziergänge und Picknick.",
        address=None,
        latitude=None,
        longitude=None,
    )

    wish_service.create_wish(session, lea_context, title="Zusammen einen Töpferkurs machen")
    planned_wish = wish_service.create_wish(session, alex_context, title="Herbstwanderung")
    planned = plan_service.convert_wish_to_plan(
        session,
        alex_context,
        planned_wish.id,
        expected_version=planned_wish.version,
        title=None,
        description="Wenn die Blätter bunt werden, einen ganzen Tag für den Wald freihalten.",
        place_id=lake.id,
    ).plan
    plan_service.schedule_plan(
        session,
        alex_context,
        planned.id,
        expected_version=planned.version,
        planned_start=_instant(reference_date + timedelta(days=18), 10),
        planned_end=_instant(reference_date + timedelta(days=18), 17),
    )

    completed_wish = wish_service.create_wish(
        session, lea_context, title="Gemeinsamer Tagesausflug"
    )
    completed = plan_service.convert_wish_to_plan(
        session,
        lea_context,
        completed_wish.id,
        expected_version=completed_wish.version,
        title=None,
        description="Morgens los und erst unterwegs entscheiden, wo wir landen.",
        place_id=lake.id,
    ).plan
    plan_service.complete_plan(
        session,
        lea_context,
        completed.id,
        expected_version=completed.version,
        experienced_on=reference_date - timedelta(days=43),
    )

    recent_completed = plan_service.create_plan(
        session,
        alex_context,
        title="Sonntag am See",
        description="Picknick einpacken, eine große Runde laufen und den Nachmittag draußen lassen.",
        place_id=lake.id,
    )
    plan_service.complete_plan(
        session,
        alex_context,
        recent_completed.id,
        expected_version=recent_completed.version,
        experienced_on=reference_date - timedelta(days=6),
    )

    plan_service.create_plan(
        session,
        alex_context,
        title="Wellness-Wochenende",
        description="Eine Nacht, Sauna und das Handy möglichst lange in der Tasche lassen.",
        place_id=None,
    )
    plan_service.create_plan(
        session,
        lea_context,
        title="Neues Rezept ausprobieren",
        description="Etwas kochen, das wir beide noch nie gemacht haben.",
        place_id=None,
    )
    concert = plan_service.create_plan(
        session,
        alex_context,
        title="Konzert im Herbst",
        description="Tickets liegen schon bereit.",
        place_id=None,
    )
    plan_service.schedule_plan(
        session,
        alex_context,
        concert.id,
        expected_version=concert.version,
        planned_start=_instant(reference_date + timedelta(days=34), 19),
        planned_end=_instant(reference_date + timedelta(days=34), 23),
    )
    flea_market = plan_service.create_plan(
        session,
        lea_context,
        title="Flohmarkt am Samstag",
        description="Früh los, danach Kaffee und schauen, was wir finden.",
        place_id=cafe.id,
    )
    plan_service.schedule_plan(
        session,
        lea_context,
        flea_market.id,
        expected_version=flea_market.version,
        planned_start=_instant(reference_date + timedelta(days=11), 9),
        planned_end=_instant(reference_date + timedelta(days=11), 13),
    )

    places = {"cafe": cafe, "lake": lake}
    for chapter in CHAPTERS:
        place = places.get(chapter.place) if chapter.place is not None else None
        chapter_service.create_chapter(
            session,
            lea_context if chapter.title in {"Unser Sommer", "Kochabende"} else alex_context,
            title=chapter.title,
            description=chapter.description,
            start_on=reference_date - timedelta(days=chapter.start_days_ago),
            end_on=(
                reference_date - timedelta(days=chapter.end_days_ago)
                if chapter.end_days_ago is not None
                else None
            ),
            place_id=place.id if place is not None else None,
        )

    shared_collection = collection_service.create_collection(
        session,
        lea_context,
        title="Filme für einen Regentag",
    )
    collection_service.create_item(
        session,
        alex_context,
        shared_collection.id,
        title="Den alten Lieblingsfilm nochmal sehen",
        completed=True,
    )
    collection_service.create_item(
        session,
        lea_context,
        shared_collection.id,
        title="Eine neue Komödie aussuchen",
        completed=False,
    )
    weekend = collection_service.create_collection(
        session,
        lea_context,
        title="Fürs Wochenende am See",
    )
    for title, completed in (
        ("Picknickdecke einpacken", True),
        ("Thermoskanne mitnehmen", True),
        ("Obst und Snacks vorbereiten", False),
        ("Kartenspiel einstecken", False),
        ("Powerbank laden", False),
    ):
        collection_service.create_item(
            session,
            lea_context,
            weekend.id,
            title=title,
            completed=completed,
        )
    for account_id in (lea_context.account_id, alex_context.account_id):
        dashboard_preferences.set_module_preference(
            session,
            account_id=account_id,
            space_id=lea_context.space_id,
            module_key=dashboard_preferences.DashboardModuleKey.PINNED_COLLECTION.value,
            visible=True,
            item_limit=None,
            selected_collection_id=weekend.id,
            selected_collection_id_changed=True,
        )

    recipes = collection_service.create_collection(
        session,
        alex_context,
        title="Rezepte für lange Abende",
    )
    collection_service.create_item(
        session,
        lea_context,
        recipes.id,
        title="Ravioli mit neuer Füllung",
        completed=False,
    )
    collection_service.create_item(
        session,
        alex_context,
        recipes.id,
        title="Ofengemüse mit Feta",
        completed=True,
    )


def _seed_private_area(
    session: Session,
    lea_context: AuthorizationContext,
    alex_context: AuthorizationContext,
    *,
    reference_date: date,
) -> None:
    private_note_service.create_note(
        session,
        lea_context,
        title="Idee für Alex",
        body=f"{PRIVATE_CANARY_LEA} - Den alten Fotostreifen rahmen lassen.",
        pinned=True,
    )
    private_note_service.create_note(
        session,
        alex_context,
        title="Idee für Lea",
        body=f"{PRIVATE_CANARY_ALEX} - Frühstück und Spaziergang vorbereiten.",
        pinned=False,
    )
    private_note_service.create_note(
        session,
        lea_context,
        title="Für den nächsten freien Sonntag",
        body="Kaffee holen, Handy zu Hause lassen und eine große Runde am See drehen.",
        pinned=False,
    )
    private_note_service.create_note(
        session,
        alex_context,
        title="Kleine Überraschung",
        body="Die Blumen vom Markt mitbringen, wenn Lea einen langen Tag hatte.",
        pinned=True,
    )

    gift_idea_service.create_idea(
        session,
        lea_context,
        title="Kleines Fotobuch",
        description=f"{PRIVATE_CANARY_LEA} - mit den Bildern vom See.",
        recipient=ALEX_NAME,
        occasion="Einfach so",
        target_on=reference_date + timedelta(days=45),
        price_text="ca. 25 €",
        url=None,
        pinned=True,
    )
    gift_idea_service.create_idea(
        session,
        alex_context,
        title="Keramikbecher",
        description=f"{PRIVATE_CANARY_ALEX} - passend zum Sonntagskaffee.",
        recipient=LEA_NAME,
        occasion=None,
        target_on=None,
        price_text=None,
        url=None,
        pinned=False,
    )
    gift_idea_service.create_idea(
        session,
        lea_context,
        title="Konzertposter rahmen",
        description="Eine schöne Erinnerung an unseren Konzertabend.",
        recipient=ALEX_NAME,
        occasion=None,
        target_on=None,
        price_text="ca. 20 €",
        url=None,
        pinned=False,
    )
    gift_idea_service.create_idea(
        session,
        alex_context,
        title="Frühstückskorb",
        description="Croissants, Marmelade und der Kaffee, den Lea am liebsten mag.",
        recipient=LEA_NAME,
        occasion="Freier Sonntag",
        target_on=reference_date + timedelta(days=26),
        price_text="ca. 30 €",
        url=None,
        pinned=True,
    )

    lea_collection = private_collection_service.create_collection(
        session,
        lea_context,
        title=f"{PRIVATE_CANARY_LEA} Überraschungen",
    )
    private_collection_service.create_item(
        session,
        lea_context,
        lea_collection.id,
        title="Fotobuch bestellen",
        completed=False,
    )
    private_collection_service.create_item(
        session,
        lea_context,
        lea_collection.id,
        title="Rahmen fürs Konzertposter aussuchen",
        completed=False,
    )
    alex_collection = private_collection_service.create_collection(
        session,
        alex_context,
        title=f"{PRIVATE_CANARY_ALEX} Überraschungen",
    )
    private_collection_service.create_item(
        session,
        alex_context,
        alex_collection.id,
        title="Tisch fürs Frühstück vorbereiten",
        completed=True,
    )
    private_collection_service.create_item(
        session,
        alex_context,
        alex_collection.id,
        title="Blumen auf dem Markt holen",
        completed=False,
    )


def _project_engagement(session: Session) -> None:
    # Drain the finite batch produced by the seed. A cap protects the demo
    # command from looping forever if a future projector starts producing new
    # unprocessed events recursively.
    for _ in range(20):
        if engagement_service.project_pending(session, limit=100) == 0:
            return
    raise RuntimeError("Demo outbox projection did not drain after 20 batches.")


def _seed(
    session: Session,
    lea: Account,
    alex: Account,
    space: Space,
    *,
    assets: DemoAssetCatalog,
    reference_date: date,
) -> None:
    lea_context = _context(lea, space)
    alex_context = _context(alex, space)
    _ensure_demo_configuration(session, space, lea)
    _seed_relationship(session, space, reference_date=reference_date)
    _seed_daily_check_ins(
        session,
        lea_context,
        alex_context,
        reference_date=reference_date,
    )
    _seed_profiles(session, lea, alex, lea_context, alex_context)
    _seed_people(
        session,
        lea_context,
        alex_context,
        reference_date=reference_date,
    )
    _seed_story(
        session,
        lea_context,
        alex_context,
        assets=assets,
        reference_date=reference_date,
    )
    _seed_planning(
        session,
        lea_context,
        alex_context,
        reference_date=reference_date,
    )
    _seed_private_area(
        session,
        lea_context,
        alex_context,
        reference_date=reference_date,
    )
    _project_engagement(session)


def create_demo_space(
    session: Session,
    *,
    environment: Environment,
    lea_password: str,
    alex_password: str,
    reference_date: date,
) -> DemoSeedResult:
    """Create the canonical demo dataset once; repeat calls are idempotent."""
    _ensure_allowed(environment)
    _lock_canonical_demo_dataset(session)
    assets = load_and_validate_assets()
    lea, alex = _existing_accounts(session)
    if lea is None or alex is None:
        lea, alex = _create_accounts(
            session,
            lea_password=lea_password,
            alex_password=alex_password,
        )

    existing = _shared_demo_space(session, lea, alex, required=False)
    if existing is not None:
        # Both reserved Accounts already share exactly one active Space, so
        # this *is* the pre-existing canonical demo, marker or not -- safe to
        # adopt a still-missing marker now that the Space itself proves it.
        _backfill_missing_markers(session, lea, alex)
        _ensure_demo_configuration(session, existing, lea)
        return DemoSeedResult(
            lea_id=lea.id,
            alex_id=alex.id,
            space_id=existing.id,
            reference_date=reference_date,
            created=False,
        )

    if _missing_marker_personas(session, lea, alex):
        # Both reserved addresses resolve to Accounts, but neither carries a
        # durable marker yet, and there is no existing shared canonical Space
        # to prove they are the legitimate demo pair rather than, say,
        # Accounts an operator pre-created for an unrelated purpose. Owning
        # the reserved `.invalid` address alone is not sufficient evidence to
        # adopt them and build a brand-new Space around them (#633 follow-up).
        raise RuntimeError(
            "Refusing demo operation: reserved demo accounts exist without a "
            "durable identity marker and without an existing canonical demo "
            "Space to verify them against. Resolve this ambiguous state "
            "explicitly; see docs/DEMO-SPACE.md."
        )

    space = _new_space(session, lea, alex)
    _seed(session, lea, alex, space, assets=assets, reference_date=reference_date)
    return DemoSeedResult(
        lea_id=lea.id,
        alex_id=alex.id,
        space_id=space.id,
        reference_date=reference_date,
        created=True,
    )


def _detach_and_purge_media(
    session: Session,
    space: Space,
    lea: Account,
    alex: Account,
) -> None:
    contexts = {
        lea.id: _context(lea, space),
        alex.id: _context(alex, space),
    }

    memories = list(session.execute(select(Memory).where(Memory.space_id == space.id)).scalars())
    for memory in memories:
        if not attachment_binding.attachments_of_memory(session, memory.id):
            continue
        context = contexts.get(memory.owner_id)
        if context is None:
            raise RuntimeError("Demo Space contains a Memory owned by a non-demo account.")
        memory_service.replace_attachments(
            session,
            context,
            memory.id,
            expected_version=memory.version,
            entries=[],
        )

    heart_moments = list(
        session.execute(
            select(HeartMoment).where(
                HeartMoment.space_id == space.id,
                HeartMoment.attachment_id.is_not(None),
            )
        ).scalars()
    )
    for heart_moment in heart_moments:
        context = contexts.get(heart_moment.owner_id)
        if context is None:
            raise RuntimeError("Demo Space contains a HeartMoment owned by a non-demo account.")
        heart_moment_service.delete_heart_moment(
            session,
            context,
            heart_moment.id,
            expected_version=heart_moment.version,
        )

    # Account-global profile media is owned by the Account, not by the demo
    # Space, so deleting the Space no longer removes it (#692). The reset is
    # the authority that rebuilds a persona's visitor-facing state, so it
    # detaches and purges the avatar explicitly instead of relying on a Space
    # cascade that no longer applies.
    for account in (lea, alex):
        profile_service.set_profile_attachment(
            session,
            contexts[account.id],
            None,
        )
    session.flush()

    attachments = list(
        session.execute(
            select(Attachment).where(
                or_(
                    Attachment.space_id == space.id,
                    and_(
                        Attachment.space_id.is_(None),
                        Attachment.owner_id.in_([lea.id, alex.id]),
                    ),
                )
            )
        ).scalars()
    )
    for attachment in attachments:
        attachment_service.mark_for_deletion(session, attachment)
        if not attachment_service.purge(session, attachment):
            raise RuntimeError(f"Could not purge demo attachment {attachment.id}; reset aborted.")
    session.flush()


def reset_demo_space(
    session: Session,
    *,
    environment: Environment,
    reference_date: date,
) -> DemoSeedResult:
    """Replace only the verified canonical demo Space with a fresh scenario."""
    _ensure_allowed(environment)
    _lock_canonical_demo_dataset(session)
    assets = load_and_validate_assets()
    lea, alex = _existing_accounts(session)
    if lea is None or alex is None:
        raise RuntimeError("Canonical demo accounts do not exist; run create first.")
    space = _shared_demo_space(session, lea, alex, required=True)
    assert space is not None

    # Both reserved Accounts share exactly one active, verified Space, so a
    # still-missing marker is safe to adopt now -- the same proof
    # `create_demo_space` requires (#633 follow-up).
    _backfill_missing_markers(session, lea, alex)
    _restore_canonical_presentation(session, lea, alex)
    _detach_and_purge_media(session, space, lea, alex)
    session.delete(space)
    session.flush()

    replacement = _new_space(session, lea, alex)
    _seed(session, lea, alex, replacement, assets=assets, reference_date=reference_date)
    return DemoSeedResult(
        lea_id=lea.id,
        alex_id=alex.id,
        space_id=replacement.id,
        reference_date=reference_date,
        created=True,
    )

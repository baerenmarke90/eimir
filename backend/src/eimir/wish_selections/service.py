"""Authoritative selection, deliberate intersection and bounded lifecycle.

Personal choices never enter event/activity projections. They are not shared
resources: only this bounded server calculation may read both protected sets,
and only its intersection is returned to either participant after publication.

Candidates are typed (#465 folded into #1535): ordinary Wishes stay Free/Core;
curated date ideas need the Space capability ``planning.date_inspiration`` to
be added, chosen or shown. Without it a round that contains date ideas pauses
instead of exposing catalog content, and a Wish-only replacement stays Free.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.core.errors import (
    ConflictError,
    ErrorCode,
    NotFoundError,
    PremiumEntitlementRequiredError,
    ValidationError,
)
from eimir.date_ideas.catalog import get_catalog
from eimir.domain.events import DomainEvent, EventType, PublicEventPayload
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import Capability
from eimir.identity.models import Account
from eimir.outbox import service as outbox_service
from eimir.plans.models import Plan
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus
from eimir.wish_selections.models import (
    WishSelection,
    WishSelectionCandidate,
    WishSelectionCandidateSource,
    WishSelectionPayload,
    WishSelectionRound,
    WishSelectionRoundPayload,
)
from eimir.wishes.models import Wish, WishStatus

ResultState = Literal["NO_ROUND", "CHOOSING", "WAITING", "READY", "NEEDS_IDEAS", "PAUSED"]

DATE_IDEAS_CAPABILITY = Capability.PLANNING_DATE_INSPIRATION.value


@dataclass(frozen=True)
class CandidateProjection:
    wish: Wish
    plan_id: UUID | None
    source_version: int


@dataclass(frozen=True)
class DateIdeaCandidateProjection:
    """Catalog reference only; content is resolved at the API boundary when allowed."""

    date_idea_id: str
    # False when the catalog no longer offers this entry or changed its content.
    current: bool


@dataclass(frozen=True)
class SelectionProjection:
    round: WishSelectionRound | None
    candidates: list[CandidateProjection]
    own: WishSelection | None
    common_wish_ids: list[UUID]
    result_state: ResultState
    date_idea_candidates: list[DateIdeaCandidateProjection] = field(default_factory=list)
    common_date_idea_ids: list[str] = field(default_factory=list)
    # Whether catalog content may be returned for this Space right now.
    date_ideas_allowed: bool = False

    @property
    def round_token(self) -> str:
        return f"{self.round.id}:{self.round.version}" if self.round else "absent"

    @property
    def selection_token(self) -> str | None:
        if self.round is None:
            return None
        return f"{self.round.id}:{self.round.version}:{self.own.version if self.own else 0}"


def _members(session: Session, context: AuthorizationContext) -> list[Membership]:
    members = list(
        session.scalars(
            select(Membership)
            .join(Account, Account.id == Membership.account_id)
            .where(
                Membership.space_id == context.space_id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Account.disabled_at.is_(None),
            )
            .order_by(Membership.id)
        )
    )
    if not any(member.account_id == context.account_id for member in members):
        raise NotFoundError("Space not found.", relationship.SpaceErrorCode.NOT_FOUND)
    return members


def _membership_context(members: list[Membership]) -> str:
    # This is a version identity, not encryption or an authentication secret.
    return sha256("|".join(str(member.id) for member in members).encode()).hexdigest()


def _current_round(
    session: Session, context: AuthorizationContext, members: list[Membership]
) -> WishSelectionRound | None:
    return session.scalar(
        readable(WishSelectionRound, context)
        .where(WishSelectionRound.membership_context == _membership_context(members))
        .execution_options(populate_existing=True)
    )


def _candidates(
    session: Session, context: AuthorizationContext, round_id: UUID
) -> list[CandidateProjection]:
    rows = session.execute(
        readable(Wish, context)
        .join(
            WishSelectionCandidate,
            (WishSelectionCandidate.wish_id == Wish.id)
            & (WishSelectionCandidate.space_id == Wish.space_id),
        )
        .outerjoin(Plan, (Plan.source_wish_id == Wish.id) & (Plan.space_id == Wish.space_id))
        .where(WishSelectionCandidate.round_id == round_id)
        .add_columns(Plan.id, WishSelectionCandidate.wish_version)
        .order_by(WishSelectionCandidate.position)
        .execution_options(populate_existing=True)
    ).all()
    return [CandidateProjection(row[0], row[1], row[2]) for row in rows]


def _date_idea_candidates(
    session: Session, context: AuthorizationContext, round_id: UUID
) -> list[DateIdeaCandidateProjection]:
    catalog = get_catalog()
    rows = session.execute(
        select(WishSelectionCandidate.date_idea_id, WishSelectionCandidate.date_idea_revision)
        .where(
            WishSelectionCandidate.round_id == round_id,
            WishSelectionCandidate.space_id == context.space_id,
            WishSelectionCandidate.source_type == WishSelectionCandidateSource.DATE_IDEA.value,
        )
        .order_by(WishSelectionCandidate.position)
    ).all()
    # A catalog revision never silently redirects a round to other content.
    return [
        DateIdeaCandidateProjection(idea_id, catalog.revision(idea_id) == revision)
        for idea_id, revision in rows
    ]


def _date_ideas_allowed(session: Session, context: AuthorizationContext, *, lock: bool) -> bool:
    return entitlements.has_capability(
        session, context.space_id, DATE_IDEAS_CAPABILITY, lock_grants=lock
    )


def _needs_review(
    round: WishSelectionRound,
    candidates: list[CandidateProjection],
    date_ideas: list[DateIdeaCandidateProjection],
) -> bool:
    return (
        len(candidates) + len(date_ideas) != round.candidate_count
        or any(
            candidate.plan_id is None
            and (
                candidate.wish.status != WishStatus.OPEN.value
                or candidate.wish.version != candidate.source_version
            )
            for candidate in candidates
        )
        or any(not idea.current for idea in date_ideas)
    )


def get_selection(
    session: Session, context: AuthorizationContext, *, lock_grants: bool = False
) -> SelectionProjection:
    members = _members(session, context)
    round = _current_round(session, context, members)
    if round is None:
        return SelectionProjection(None, [], None, [], "NO_ROUND")
    candidates = _candidates(session, context, round.id)
    date_ideas = _date_idea_candidates(session, context, round.id)
    allowed = bool(date_ideas) and _date_ideas_allowed(session, context, lock=lock_grants)
    own = session.scalar(
        readable(WishSelection, context)
        .where(WishSelection.round_id == round.id)
        .execution_options(populate_existing=True)
    )

    def projection(
        state: ResultState, common: list[UUID] | None = None, common_ideas: list[str] | None = None
    ) -> SelectionProjection:
        return SelectionProjection(
            round,
            candidates,
            own,
            common or [],
            state,
            date_idea_candidates=date_ideas,
            common_date_idea_ids=common_ideas or [],
            date_ideas_allowed=allowed,
        )

    if date_ideas and not allowed:
        # Downgrade: keep the round, its Wishes and own data, but reveal no
        # catalog content or result until Pro returns or a Free round replaces it.
        return projection("PAUSED")
    if _needs_review(round, candidates, date_ideas):
        return projection("NEEDS_IDEAS")
    if own is None or not own.published:
        return projection("CHOOSING")

    # Internal projection only. Never return these rows, their owner versions,
    # counts, timestamps or payloads through the API or portability boundary.
    selections = list(
        session.scalars(
            select(WishSelection)
            .where(
                WishSelection.space_id == context.space_id,
                WishSelection.round_id == round.id,
                WishSelection.owner_id.in_([member.account_id for member in members]),
                WishSelection.published.is_(True),
            )
            .execution_options(populate_existing=True)
        )
    )
    if len(members) != 2 or len(selections) != 2:
        return projection("WAITING")
    shared_ids = set(selections[0].payload.favorite_wish_ids).intersection(
        selections[1].payload.favorite_wish_ids
    )
    shared_ideas = set(selections[0].payload.favorite_date_idea_ids).intersection(
        selections[1].payload.favorite_date_idea_ids
    )
    common = [
        candidate.wish.id
        for candidate in candidates
        if candidate.wish.id in shared_ids and candidate.plan_id is None
    ]
    common_ideas = [idea.date_idea_id for idea in date_ideas if idea.date_idea_id in shared_ideas]
    return projection("READY", common, common_ideas)


def _conflict() -> ConflictError:
    return ConflictError(
        "The selection changed. Reload it before trying again.",
        ErrorCode.RESOURCE_VERSION_CONFLICT,
    )


def replace_round(
    session: Session,
    context: AuthorizationContext,
    *,
    expected_token: str,
    wish_ids: list[UUID],
    title: str | None,
    date_idea_ids: list[str] | None = None,
) -> SelectionProjection:
    relationship.lock_space(session, context.space_id)
    members = _members(session, context)
    current = _current_round(session, context, members)
    current_token = f"{current.id}:{current.version}" if current else "absent"
    if expected_token != current_token:
        raise _conflict()
    idea_ids = list(date_idea_ids or [])
    if (
        not 2 <= len(wish_ids) + len(idea_ids) <= 5
        or len(set(wish_ids)) != len(wish_ids)
        or len(set(idea_ids)) != len(idea_ids)
    ):
        raise ValidationError(
            "Choose two to five distinct ideas.", "WISH_SELECTION_CANDIDATES_INVALID"
        )
    catalog = get_catalog()
    revisions: dict[str, str] = {}
    if idea_ids:
        # Locked like other protected writes so a concurrent revocation cannot
        # race the authorization of this round.
        if not _date_ideas_allowed(session, context, lock=True):
            raise PremiumEntitlementRequiredError(DATE_IDEAS_CAPABILITY)
        for idea_id in idea_ids:
            revision = catalog.revision(idea_id)
            if revision is None:
                raise ValidationError(
                    "Some ideas are no longer available. Choose again.",
                    "WISH_SELECTION_CANDIDATES_INVALID",
                )
            revisions[idea_id] = revision
    normalized_title = title.strip() if title else None
    if normalized_title and len(normalized_title) > 60:
        raise ValidationError("The occasion is too long.", "WISH_SELECTION_TITLE_INVALID")
    sources = list(
        session.scalars(
            readable(Wish, context)
            .where(Wish.id.in_(wish_ids), Wish.status == WishStatus.OPEN.value)
            .order_by(Wish.id)
            .with_for_update(read=True)
            .execution_options(populate_existing=True)
        )
    )
    if len(sources) != len(wish_ids):
        raise ValidationError(
            "Some Wishes are no longer available. Choose again.",
            "WISH_SELECTION_CANDIDATES_INVALID",
        )
    by_id = {source.id: source for source in sources}
    if current is None:
        # Also remove any round from a former single-member context. Consent
        # and its optional occasion must not survive a participant change.
        purge_space(session, context.space_id)
        current = WishSelectionRound(
            space_id=context.space_id,
            owner_id=context.account_id,
            privacy_class=PrivacyClass.SPACE_SHARED.value,
            membership_context=_membership_context(members),
            candidate_count=len(wish_ids) + len(idea_ids),
            payload=WishSelectionRoundPayload(title=normalized_title or None),
        )
        session.add(current)
        session.flush()
    else:
        session.execute(delete(WishSelection).where(WishSelection.round_id == current.id))
        session.execute(
            delete(WishSelectionCandidate).where(WishSelectionCandidate.round_id == current.id)
        )
        current.version += 1
        current.candidate_count = len(wish_ids) + len(idea_ids)
        current.payload = WishSelectionRoundPayload(title=normalized_title or None)
        session.flush()
    for position, wish_id in enumerate(wish_ids):
        session.add(
            WishSelectionCandidate(
                round_id=current.id,
                space_id=context.space_id,
                source_type=WishSelectionCandidateSource.WISH.value,
                wish_id=wish_id,
                position=position,
                wish_version=by_id[wish_id].version,
            )
        )
    for offset, idea_id in enumerate(idea_ids):
        session.add(
            WishSelectionCandidate(
                round_id=current.id,
                space_id=context.space_id,
                source_type=WishSelectionCandidateSource.DATE_IDEA.value,
                date_idea_id=idea_id,
                date_idea_revision=revisions[idea_id],
                position=len(wish_ids) + offset,
            )
        )
    session.flush()
    _record_shared_action(session, context, current, EventType.WISH_SELECTION_SHARED)
    return get_selection(session, context)


def _record_shared_action(
    session: Session, context: AuthorizationContext, round: WishSelectionRound, kind: EventType
) -> None:
    """Publish only a shared round or a fully revealed result, never a vote."""
    for member in _members(session, context):
        if member.account_id != context.account_id:
            outbox_service.record(
                session,
                DomainEvent(
                    type=kind,
                    space_id=context.space_id,
                    actor_id=context.account_id,
                    subject_type="wish_selection",
                    subject_id=round.id,
                    resource_version=round.version,
                    payload=PublicEventPayload(recipient_id=member.account_id),
                ),
            )


def update_own_selection(
    session: Session,
    context: AuthorizationContext,
    *,
    expected_token: str,
    favorite_wish_ids: list[UUID],
    published: bool,
    favorite_date_idea_ids: list[str] | None = None,
) -> SelectionProjection:
    relationship.lock_space(session, context.space_id)
    current = get_selection(session, context, lock_grants=True)
    if current.round is None or current.selection_token != expected_token:
        raise _conflict()
    if current.result_state == "PAUSED":
        raise PremiumEntitlementRequiredError(DATE_IDEAS_CAPABILITY)
    if current.result_state == "NEEDS_IDEAS":
        raise ConflictError(
            "A source Wish changed. Review the round before sharing.",
            "WISH_SELECTION_SOURCES_CHANGED",
        )
    candidate_ids = {candidate.wish.id for candidate in current.candidates}
    idea_candidate_ids = {idea.date_idea_id for idea in current.date_idea_candidates}
    # A client that does not know typed candidates must not publish a decision
    # about date ideas it never showed; an omitted list is only valid without them.
    idea_favorites = list(favorite_date_idea_ids or [])
    if (
        (favorite_date_idea_ids is None and idea_candidate_ids)
        or len(favorite_wish_ids) + len(idea_favorites) > 5
        or len(set(favorite_wish_ids)) != len(favorite_wish_ids)
        or len(set(idea_favorites)) != len(idea_favorites)
        or not set(favorite_wish_ids).issubset(candidate_ids)
        or not set(idea_favorites).issubset(idea_candidate_ids)
    ):
        raise ValidationError(
            "Select only ideas from the current round.", "WISH_SELECTION_FAVORITES_INVALID"
        )
    payload = WishSelectionPayload(
        favorite_wish_ids=favorite_wish_ids, favorite_date_idea_ids=idea_favorites
    )
    own = current.own
    if own is None:
        own = WishSelection(
            round_id=current.round.id,
            space_id=context.space_id,
            owner_id=context.account_id,
            privacy_class=PrivacyClass.OWNER_ONLY.value,
            payload=payload,
            published=published,
        )
        session.add(own)
    else:
        own.payload = payload
        own.published = published
        # Also advance for an explicit repeated publication: a second device
        # must not overwrite the user's later deliberate decision.
        own.version += 1
    session.flush()
    result = get_selection(session, context, lock_grants=True)
    if result.result_state == "READY" and current.result_state != "READY":
        _record_shared_action(session, context, current.round, EventType.WISH_SELECTION_READY)
    return result


def close_round(session: Session, context: AuthorizationContext, *, expected_token: str) -> None:
    relationship.lock_space(session, context.space_id)
    current = get_selection(session, context)
    if current.round is None or current.round_token != expected_token:
        raise _conflict()
    session.delete(current.round)
    session.flush()


def purge_space(session: Session, space_id: UUID) -> None:
    """Remove temporary choices, preserving canonical Wishes and Plans."""
    session.execute(delete(WishSelectionRound).where(WishSelectionRound.space_id == space_id))
    session.flush()


def portable_snapshot(
    session: Session, context: AuthorizationContext, *, personal: bool
) -> dict[str, Any] | None:
    """Export-only authorized state; imported data must never recreate consent."""
    projection = get_selection(session, context)
    if projection.round is None:
        return None
    # Date ideas are exported as persistent catalog references only. The
    # protected catalog copy is never part of an export, entitled or not.
    result: dict[str, Any] = {
        "occasion": projection.round.payload.title,
        "wishIds": [str(candidate.wish.id) for candidate in projection.candidates],
        "commonWishIds": [str(item) for item in projection.common_wish_ids],
        "dateIdeaIds": [idea.date_idea_id for idea in projection.date_idea_candidates],
        "commonDateIdeaIds": list(projection.common_date_idea_ids),
    }
    if personal:
        result["resultState"] = projection.result_state
        eligible = {candidate.wish.id for candidate in projection.candidates}
        eligible_ideas = {idea.date_idea_id for idea in projection.date_idea_candidates}
        own = projection.own
        result["ownSelection"] = {
            "favoriteWishIds": [
                str(item) for item in own.payload.favorite_wish_ids if item in eligible
            ]
            if own
            else [],
            "favoriteDateIdeaIds": [
                item for item in own.payload.favorite_date_idea_ids if item in eligible_ideas
            ]
            if own
            else [],
            "published": own.published if own else False,
        }
    return result

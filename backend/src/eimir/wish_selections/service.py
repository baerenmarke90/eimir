"""Authoritative selection, deliberate intersection and bounded lifecycle.

Personal choices never enter event/activity projections. They are not shared
resources: only this bounded server calculation may read both protected sets,
and only its intersection is returned to either participant after publication.
"""

from __future__ import annotations

from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Literal
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass, readable
from eimir.core.errors import ConflictError, ErrorCode, NotFoundError, ValidationError
from eimir.identity.models import Account
from eimir.plans.models import Plan
from eimir.relationship import service as relationship
from eimir.relationship.models import Membership, MembershipStatus
from eimir.wish_selections.models import (
    WishSelection,
    WishSelectionCandidate,
    WishSelectionPayload,
    WishSelectionRound,
    WishSelectionRoundPayload,
)
from eimir.wishes.models import Wish, WishStatus

ResultState = Literal["NO_ROUND", "CHOOSING", "WAITING", "READY", "NEEDS_IDEAS"]


@dataclass(frozen=True)
class CandidateProjection:
    wish: Wish
    plan_id: UUID | None
    source_version: int


@dataclass(frozen=True)
class SelectionProjection:
    round: WishSelectionRound | None
    candidates: list[CandidateProjection]
    own: WishSelection | None
    common_wish_ids: list[UUID]
    result_state: ResultState

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


def _needs_review(round: WishSelectionRound, candidates: list[CandidateProjection]) -> bool:
    return len(candidates) != round.candidate_count or any(
        candidate.plan_id is None
        and (
            candidate.wish.status != WishStatus.OPEN.value
            or candidate.wish.version != candidate.source_version
        )
        for candidate in candidates
    )


def get_selection(session: Session, context: AuthorizationContext) -> SelectionProjection:
    members = _members(session, context)
    round = _current_round(session, context, members)
    if round is None:
        return SelectionProjection(None, [], None, [], "NO_ROUND")
    candidates = _candidates(session, context, round.id)
    own = session.scalar(
        readable(WishSelection, context)
        .where(WishSelection.round_id == round.id)
        .execution_options(populate_existing=True)
    )
    if _needs_review(round, candidates):
        return SelectionProjection(round, candidates, own, [], "NEEDS_IDEAS")
    if own is None or not own.published:
        return SelectionProjection(round, candidates, own, [], "CHOOSING")

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
        return SelectionProjection(round, candidates, own, [], "WAITING")
    shared_ids = set(selections[0].payload.favorite_wish_ids).intersection(
        selections[1].payload.favorite_wish_ids
    )
    common = [
        candidate.wish.id
        for candidate in candidates
        if candidate.wish.id in shared_ids and candidate.plan_id is None
    ]
    return SelectionProjection(round, candidates, own, common, "READY")


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
) -> SelectionProjection:
    relationship.lock_space(session, context.space_id)
    members = _members(session, context)
    current = _current_round(session, context, members)
    current_token = f"{current.id}:{current.version}" if current else "absent"
    if expected_token != current_token:
        raise _conflict()
    if not 2 <= len(wish_ids) <= 5 or len(set(wish_ids)) != len(wish_ids):
        raise ValidationError(
            "Choose two to five distinct Wishes.", "WISH_SELECTION_CANDIDATES_INVALID"
        )
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
            candidate_count=len(wish_ids),
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
        current.candidate_count = len(wish_ids)
        current.payload = WishSelectionRoundPayload(title=normalized_title or None)
        session.flush()
    for position, wish_id in enumerate(wish_ids):
        session.add(
            WishSelectionCandidate(
                round_id=current.id,
                space_id=context.space_id,
                wish_id=wish_id,
                position=position,
                wish_version=by_id[wish_id].version,
            )
        )
    session.flush()
    return get_selection(session, context)


def update_own_selection(
    session: Session,
    context: AuthorizationContext,
    *,
    expected_token: str,
    favorite_wish_ids: list[UUID],
    published: bool,
) -> SelectionProjection:
    relationship.lock_space(session, context.space_id)
    current = get_selection(session, context)
    if current.round is None or current.selection_token != expected_token:
        raise _conflict()
    if current.result_state == "NEEDS_IDEAS":
        raise ConflictError(
            "A source Wish changed. Review the round before sharing.",
            "WISH_SELECTION_SOURCES_CHANGED",
        )
    candidate_ids = {candidate.wish.id for candidate in current.candidates}
    if (
        len(favorite_wish_ids) > 5
        or len(set(favorite_wish_ids)) != len(favorite_wish_ids)
        or not set(favorite_wish_ids).issubset(candidate_ids)
    ):
        raise ValidationError(
            "Select only Wishes from the current round.", "WISH_SELECTION_FAVORITES_INVALID"
        )
    own = current.own
    if own is None:
        own = WishSelection(
            round_id=current.round.id,
            space_id=context.space_id,
            owner_id=context.account_id,
            privacy_class=PrivacyClass.OWNER_ONLY.value,
            payload=WishSelectionPayload(favorite_wish_ids=favorite_wish_ids),
            published=published,
        )
        session.add(own)
    else:
        own.payload = WishSelectionPayload(favorite_wish_ids=favorite_wish_ids)
        own.published = published
        # Also advance for an explicit repeated publication: a second device
        # must not overwrite the user's later deliberate decision.
        own.version += 1
    session.flush()
    return get_selection(session, context)


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
    result: dict[str, Any] = {
        "occasion": projection.round.payload.title,
        "wishIds": [str(candidate.wish.id) for candidate in projection.candidates],
        "commonWishIds": [str(item) for item in projection.common_wish_ids],
    }
    if personal:
        result["resultState"] = projection.result_state
        eligible = {candidate.wish.id for candidate in projection.candidates}
        own = projection.own
        result["ownSelection"] = {
            "favoriteWishIds": [
                str(item) for item in own.payload.favorite_wish_ids if item in eligible
            ]
            if own
            else [],
            "published": own.published if own else False,
        }
    return result

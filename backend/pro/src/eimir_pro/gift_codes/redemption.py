"""Couple side of gift codes: redeeming a code (ServerAdmin part 5, design sections 5.1, 5.4).

A code never costs a Space Pro time it already has: the new grant starts now
and ends ``duration`` months after the latest end of the Space's valid Premium
grants (or after now). A renewing Google Play subscription or Premium without
an end refuses the code and leaves it unused, so it can be passed on.

Redemption serializes per Space (advisory lock) before it locks the code row,
so two codes redeemed at once cannot both read the same end and lose months.
The batch row is only read, never locked: batch revocation locks the batch and
then its codes, and locking both here in the other order could deadlock.

The plain code goes into no problem detail, log line or grant row; the grant
names the code by its id and the batch in its metadata.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.auth import rate_limit
from eimir.core.errors import ConflictError, ValidationError
from eimir.db.locks import lock_subject
from eimir.entitlements import service as entitlements
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir_pro.gift_codes.codes import (
    GRANT_BATCH_METADATA_KEY,
    GRANT_REFERENCE_PREFIX,
    add_months,
    lookup_hash,
    normalize,
)
from eimir_pro.gift_codes.models import GiftCode, GiftCodeBatch
from eimir_pro.gift_codes.overview import auto_renewing, effective_premium
from eimir_pro.gift_codes.service import code_state

# Every attempt reserves a slot and a success clears both counters, so in
# effect only failures count (design section 5.4). The daily window equals the
# default cutoff of ``rate_limit.prune`` (one day); keep both in step.
GIFT_CODE_HOURLY = rate_limit.Limit(attempts=5, window=timedelta(hours=1))
"""Attempts per Account and hour."""
GIFT_CODE_DAILY = rate_limit.Limit(attempts=20, window=timedelta(days=1))
"""Attempts per Space and day."""
_ACCOUNT_ACTION = "gift-code-redeem-account"
_SPACE_ACTION = "gift-code-redeem-space"
_SPACE_LOCK = "gift-code-space"

_RENEWING_PLAY_STATUSES = (EntitlementStatus.ACTIVE.value, EntitlementStatus.TRIAL.value)


class RedemptionErrorCode:
    """Stable problem codes of the couple redemption route."""

    INVALID = "GIFT_CODE_INVALID"
    USED = "GIFT_CODE_USED"
    SUBSCRIPTION_ACTIVE = "GIFT_CODE_SUBSCRIPTION_ACTIVE"
    UNLIMITED = "GIFT_CODE_UNLIMITED"


@dataclass(frozen=True)
class Redemption:
    """The Space's new Pro end and whether it extends Pro the Space already had."""

    effective_until: datetime
    extended: bool


def _invalid() -> ValidationError:
    # One message for unknown, malformed, revoked and expired codes, so the
    # answer reveals nothing about which codes exist.
    return ValidationError("This code cannot be redeemed.", RedemptionErrorCode.INVALID)


def redeem(
    session: Session,
    *,
    space_id: UUID,
    account_id: UUID,
    raw_code: str,
    at: datetime,
) -> Redemption:
    """Redeem a typed code for a Space; the caller has checked membership.

    A replay of a code this Space already redeemed returns the stored end
    without touching the grant, so a lost response can be retried safely.
    """
    rate_limit.check(session, _ACCOUNT_ACTION, str(account_id), GIFT_CODE_HOURLY)
    rate_limit.check(session, _SPACE_ACTION, str(space_id), GIFT_CODE_DAILY)

    code_text = normalize(raw_code)
    if code_text is None:
        raise _invalid()

    lock_subject(session, _SPACE_LOCK, str(space_id))
    code = session.scalar(
        select(GiftCode)
        .where(GiftCode.lookup_hash == lookup_hash(code_text))
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if code is None:
        raise _invalid()
    batch = session.scalar(
        select(GiftCodeBatch)
        .where(GiftCodeBatch.id == code.batch_id)
        .execution_options(populate_existing=True)
    )
    if batch is None:  # pragma: no cover - the foreign key cascades
        raise _invalid()

    state = code_state(code, batch, at)
    if state == "redeemed":
        replayed = _replay(session, code, batch, space_id)
        if replayed is None:
            raise ConflictError("This code has already been redeemed.", RedemptionErrorCode.USED)
        _clear_attempts(session, account_id, space_id)
        return replayed
    if state not in ("open", "handed_out"):
        raise _invalid()

    latest_end = _latest_premium_end(session, space_id, at)
    start = max(at, latest_end) if latest_end is not None else at
    effective_until = add_months(start, batch.duration_months)
    grant = entitlements.record_grant(
        session,
        space_id=space_id,
        source_type=EntitlementSourceType.ADMIN_GRANT,
        status=EntitlementStatus.ACTIVE,
        tier=EntitlementTier.PREMIUM,
        effective_from=at,
        effective_until=effective_until,
        account_id=account_id,
        external_reference=f"{GRANT_REFERENCE_PREFIX}{code.id}",
        source_event_at=at,
        metadata={GRANT_BATCH_METADATA_KEY: str(batch.id)},
    )
    code.redeemed_at = at
    code.redeemed_space_id = space_id
    code.redeemed_grant_id = grant.id
    session.flush()
    _clear_attempts(session, account_id, space_id)
    return Redemption(effective_until=effective_until, extended=start > at)


def _replay(
    session: Session, code: GiftCode, batch: GiftCodeBatch, space_id: UUID
) -> Redemption | None:
    """The stored result when this Space redeemed the code; ``None`` otherwise."""
    if code.redeemed_space_id != space_id or code.redeemed_grant_id is None:
        return None
    grant = session.get(EntitlementGrant, code.redeemed_grant_id)
    if grant is None or grant.effective_until is None:
        return None
    # A first redemption ends exactly ``duration`` months after its start;
    # an appended one ends later.
    extended = grant.effective_until > add_months(grant.effective_from, batch.duration_months)
    return Redemption(effective_until=grant.effective_until, extended=extended)


def _latest_premium_end(session: Session, space_id: UUID, at: datetime) -> datetime | None:
    """The latest end of the Space's Premium grants valid at ``at``, or ``None`` without any.

    Raises when a renewing Google Play subscription or Premium without an end
    makes a gift pointless; the code then stays unused.
    """
    rows = session.execute(
        select(
            EntitlementGrant.source_type,
            EntitlementGrant.status,
            EntitlementGrant.effective_until,
            auto_renewing().label("auto_renewing"),
        ).where(EntitlementGrant.space_id == space_id, effective_premium(at))
    ).all()
    for row in rows:
        if row.source_type != EntitlementSourceType.GOOGLE_PLAY.value:
            continue
        # The store still tries to renew in a grace period, whatever the flag says.
        if row.status == EntitlementStatus.GRACE_PERIOD.value or (
            row.status in _RENEWING_PLAY_STATUSES and row.auto_renewing
        ):
            raise ConflictError(
                "A running subscription already renews Pro for this Space.",
                RedemptionErrorCode.SUBSCRIPTION_ACTIVE,
            )
    ends: list[datetime] = []
    for row in rows:
        if row.effective_until is None:
            raise ConflictError(
                "This Space already has Pro without an end.", RedemptionErrorCode.UNLIMITED
            )
        ends.append(row.effective_until)
    return max(ends, default=None)


def _clear_attempts(session: Session, account_id: UUID, space_id: UUID) -> None:
    rate_limit.clear(session, _ACCOUNT_ACTION, str(account_id))
    rate_limit.clear(session, _SPACE_ACTION, str(space_id))

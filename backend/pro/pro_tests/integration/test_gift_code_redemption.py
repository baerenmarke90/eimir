"""Couple redemption of gift codes (ServerAdmin part 5, design sections 5.1 and 5.4)."""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from threading import Barrier
from typing import Any
from uuid import UUID, uuid4

import pytest
from eimir_pro.gift_codes import redemption, service
from eimir_pro.gift_codes.codes import add_months
from eimir_pro.gift_codes.models import GiftCode, GiftCodeBatch
from eimir_pro.gift_codes.redemption import RedemptionErrorCode, redeem
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.core.errors import ConflictError, ErrorCode, RateLimitedError, ValidationError
from eimir.entitlements.models import (
    EntitlementGrant,
    EntitlementSourceType,
    EntitlementStatus,
    EntitlementTier,
)
from eimir.relationship import service as relationship_service
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]

AT = datetime(2026, 3, 10, 12, 0, tzinfo=UTC)
"""A fixed redemption instant on day 10, so month arithmetic never clamps."""


def _batch(session: Session, *, count: int = 2, duration_months: int = 3) -> GiftCodeBatch:
    operator = make_account(session, "Operator")
    return service.create_batch(
        session,
        actor_id=operator.id,
        count=count,
        duration_months=duration_months,
        redeemable_until=None,
        note="Promotion",
    )


def _codes(session: Session, batch: GiftCodeBatch) -> list[GiftCode]:
    return service.list_codes(session, batch.id)


def _couple(session: Session) -> tuple[UUID, UUID]:
    founder = make_account(session, "Founder")
    space = make_space(session, founder)
    return space.id, founder.id


def _grant(
    session: Session,
    space_id: UUID,
    *,
    source: EntitlementSourceType = EntitlementSourceType.ADMIN_GRANT,
    status: EntitlementStatus = EntitlementStatus.ACTIVE,
    effective_from: datetime | None = None,
    effective_until: datetime | None,
    metadata: dict[str, Any] | None = None,
) -> EntitlementGrant:
    grant = EntitlementGrant(
        space_id=space_id,
        source_type=source.value,
        external_reference=f"test:{uuid4()}",
        status=status.value,
        tier=EntitlementTier.PREMIUM.value,
        effective_from=effective_from or AT - timedelta(days=30),
        effective_until=effective_until,
        source_event_at=AT - timedelta(days=30),
        metadata_=metadata or {},
    )
    session.add(grant)
    session.flush()
    return grant


def _play(
    session: Session,
    space_id: UUID,
    status: EntitlementStatus,
    *,
    auto_renewing: bool,
    effective_until: datetime | None,
) -> EntitlementGrant:
    return _grant(
        session,
        space_id,
        source=EntitlementSourceType.GOOGLE_PLAY,
        status=status,
        effective_until=effective_until,
        metadata={"autoRenewing": auto_renewing},
    )


def _redeem(session: Session, space_id: UUID, account_id: UUID, code: GiftCode) -> Any:
    return redeem(
        session, space_id=space_id, account_id=account_id, raw_code=code.payload.code, at=AT
    )


def _grants(session: Session, space_id: UUID) -> list[EntitlementGrant]:
    return list(
        session.scalars(
            select(EntitlementGrant)
            .where(EntitlementGrant.space_id == space_id)
            .execution_options(populate_existing=True)
        )
    )


def test_a_space_without_premium_gets_pro_from_now(session: Session) -> None:
    batch = _batch(session)
    code = _codes(session, batch)[0]
    space_id, account_id = _couple(session)

    result = _redeem(session, space_id, account_id, code)

    assert result.effective_until == add_months(AT, 3)
    assert result.extended is False
    [grant] = _grants(session, space_id)
    assert grant.source_type == EntitlementSourceType.ADMIN_GRANT.value
    assert grant.status == EntitlementStatus.ACTIVE.value
    assert grant.tier == EntitlementTier.PREMIUM.value
    assert grant.effective_from == AT
    assert grant.effective_until == add_months(AT, 3)
    assert grant.external_reference == f"gift-code:{code.id}"
    assert grant.account_id == account_id
    assert grant.metadata_ == {"giftCodeBatchId": str(batch.id), "giftCodeExtended": False}
    plain = code.payload.code
    assert plain not in repr(grant.metadata_)
    assert plain not in (grant.external_reference or "")
    session.refresh(code)
    assert code.redeemed_at == AT
    assert code.redeemed_space_id == space_id
    assert code.redeemed_grant_id == grant.id


def test_a_running_gift_is_appended(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    running_end = AT + timedelta(days=20)
    _grant(session, space_id, effective_until=running_end)

    result = _redeem(session, space_id, account_id, code)

    assert result.effective_until == add_months(running_end, 3)
    assert result.extended is True


def test_the_latest_of_several_running_gifts_decides(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    _grant(session, space_id, effective_until=AT + timedelta(days=5))
    latest = AT + timedelta(days=40)
    _grant(session, space_id, effective_until=latest)

    assert _redeem(session, space_id, account_id, code).effective_until == add_months(latest, 3)


@pytest.mark.parametrize(
    ("status", "auto_renewing"),
    [
        (EntitlementStatus.ACTIVE, True),
        (EntitlementStatus.TRIAL, True),
        (EntitlementStatus.GRACE_PERIOD, True),
        (EntitlementStatus.GRACE_PERIOD, False),
    ],
)
def test_a_renewing_play_subscription_refuses_and_keeps_the_code_open(
    session: Session, status: EntitlementStatus, auto_renewing: bool
) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    _play(
        session,
        space_id,
        status,
        auto_renewing=auto_renewing,
        effective_until=AT + timedelta(days=10),
    )

    with pytest.raises(ConflictError) as raised:
        _redeem(session, space_id, account_id, code)

    assert raised.value.code == RedemptionErrorCode.SUBSCRIPTION_ACTIVE
    session.refresh(code)
    assert code.redeemed_at is None
    assert len(_grants(session, space_id)) == 1


def test_a_cancelled_but_running_play_subscription_is_appended(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    play_end = AT + timedelta(days=12)
    _play(
        session,
        space_id,
        EntitlementStatus.ACTIVE,
        auto_renewing=False,
        effective_until=play_end,
    )

    result = _redeem(session, space_id, account_id, code)

    assert result.effective_until == add_months(play_end, 3)
    assert result.extended is True


def test_an_expired_play_subscription_on_hold_or_paused_starts_now(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    _play(
        session,
        space_id,
        EntitlementStatus.EXPIRED,
        auto_renewing=True,
        effective_until=AT + timedelta(days=10),
    )

    result = _redeem(session, space_id, account_id, code)

    assert result.effective_until == add_months(AT, 3)
    assert result.extended is False


def test_premium_without_an_end_refuses(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    _grant(session, space_id, effective_until=None)

    with pytest.raises(ConflictError) as raised:
        _redeem(session, space_id, account_id, code)

    assert raised.value.code == RedemptionErrorCode.UNLIMITED
    session.refresh(code)
    assert code.redeemed_at is None


def test_only_ended_or_revoked_grants_start_now(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    _grant(session, space_id, status=EntitlementStatus.REVOKED, effective_until=None)
    _grant(
        session, space_id, status=EntitlementStatus.EXPIRED, effective_until=AT + timedelta(days=9)
    )
    _grant(session, space_id, effective_until=AT - timedelta(days=1))
    # A grant that starts only later is not valid now either.
    _grant(
        session,
        space_id,
        effective_from=AT + timedelta(days=1),
        effective_until=AT + timedelta(days=60),
    )

    result = _redeem(session, space_id, account_id, code)

    assert result.effective_until == add_months(AT, 3)
    assert result.extended is False


def _invalid_detail(session: Session, space_id: UUID, account_id: UUID, raw: str) -> str:
    with pytest.raises(ValidationError) as raised:
        redeem(session, space_id=space_id, account_id=account_id, raw_code=raw, at=AT)
    assert raised.value.code == RedemptionErrorCode.INVALID
    assert raw.strip() not in raised.value.detail
    return raised.value.detail


def test_unknown_revoked_expired_and_malformed_codes_are_alike_invalid(session: Session) -> None:
    space_id, account_id = _couple(session)
    revoked_code, _ = _codes(session, _batch(session))
    operator = make_account(session, "Revoker")
    service.revoke_code(session, revoked_code.id, operator.id)
    expired_batch = _batch(session)
    expired_batch.redeemable_until = AT - timedelta(seconds=1)
    session.flush()
    expired_code = _codes(session, expired_batch)[0]
    revoked_batch = _batch(session)
    service.revoke_batch(session, revoked_batch.id, operator.id)
    batch_revoked_code = _codes(session, revoked_batch)[0]

    details = {
        _invalid_detail(session, space_id, account_id, raw)
        for raw in (
            "EIMIR-ABCD-EFGH",
            revoked_code.payload.code,
            expired_code.payload.code,
        )
    }
    # The Account's hourly budget is five attempts; a second Account continues.
    other = make_account(session, "Partner")
    relationship_service.add_member(session, space_id, other)
    details |= {
        _invalid_detail(session, space_id, other.id, raw)
        for raw in (batch_revoked_code.payload.code, "not a code")
    }

    assert len(details) == 1
    assert _grants(session, space_id) == []


def test_a_code_used_by_another_space_is_used(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    first_space, first_account = _couple(session)
    _redeem(session, first_space, first_account, code)
    second_space, second_account = _couple(session)

    with pytest.raises(ConflictError) as raised:
        _redeem(session, second_space, second_account, code)

    assert raised.value.code == RedemptionErrorCode.USED
    assert _grants(session, second_space) == []


def test_a_replay_by_the_same_space_returns_the_stored_end(session: Session) -> None:
    first, second = _codes(session, _batch(session))
    space_id, account_id = _couple(session)
    _grant(session, space_id, effective_until=AT + timedelta(days=20))
    _redeem(session, space_id, account_id, first)
    original = _redeem(session, space_id, account_id, second)
    grants_before = len(_grants(session, space_id))
    [grant] = [
        g for g in _grants(session, space_id) if g.external_reference == f"gift-code:{second.id}"
    ]
    updated_before = grant.updated_at

    replay = redeem(
        session,
        space_id=space_id,
        account_id=account_id,
        raw_code=second.payload.code.lower(),
        at=AT + timedelta(minutes=5),
    )

    assert replay == original
    assert replay.extended is True
    assert len(_grants(session, space_id)) == grants_before
    session.refresh(grant)
    assert grant.updated_at == updated_before


@pytest.mark.parametrize("ending", ["revoked", "ended"])
def test_a_replay_of_a_revoked_or_ended_grant_is_used(session: Session, ending: str) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    result = _redeem(session, space_id, account_id, code)
    [grant] = _grants(session, space_id)
    replay_at = AT + timedelta(minutes=5)
    if ending == "revoked":
        grant.status = EntitlementStatus.REVOKED.value
    else:
        replay_at = result.effective_until + timedelta(seconds=1)
    session.flush()

    with pytest.raises(ConflictError) as raised:
        redeem(
            session,
            space_id=space_id,
            account_id=account_id,
            raw_code=code.payload.code,
            at=replay_at,
        )

    assert raised.value.code == RedemptionErrorCode.USED


def test_a_replay_keeps_the_extension_answer_under_month_clamping(session: Session) -> None:
    # 30 Jan + 1 month and 31 Jan + 1 month both end on 28 Feb, so the grant's
    # dates alone cannot tell that the Space already had Pro.
    at = datetime(2027, 1, 30, 12, 0, tzinfo=UTC)
    code = _codes(session, _batch(session, duration_months=1))[0]
    space_id, account_id = _couple(session)
    _grant(session, space_id, effective_until=datetime(2027, 1, 31, 12, 0, tzinfo=UTC))

    first = redeem(
        session, space_id=space_id, account_id=account_id, raw_code=code.payload.code, at=at
    )
    replay = redeem(
        session,
        space_id=space_id,
        account_id=account_id,
        raw_code=code.payload.code,
        at=at + timedelta(minutes=1),
    )

    assert first.effective_until == datetime(2027, 2, 28, 12, 0, tzinfo=UTC)
    assert first.extended is True
    assert replay == first


def test_a_handed_out_code_is_redeemable(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    service.set_handed_out(session, code.id, True)
    space_id, account_id = _couple(session)

    result = _redeem(session, space_id, account_id, code)

    assert result.effective_until == add_months(AT, 3)
    session.refresh(code)
    assert code.redeemed_space_id == space_id
    assert code.handed_out_at is not None


def test_five_failed_attempts_per_account_then_rate_limited(session: Session) -> None:
    space_id, account_id = _couple(session)
    for _ in range(redemption.GIFT_CODE_HOURLY.attempts):
        with pytest.raises(ValidationError):
            redeem(
                session,
                space_id=space_id,
                account_id=account_id,
                raw_code="EIMIR-ABCD-EFGH",
                at=AT,
            )

    with pytest.raises(RateLimitedError) as raised:
        redeem(session, space_id=space_id, account_id=account_id, raw_code="EIMIR-ABCD-EFGH", at=AT)
    assert raised.value.code == ErrorCode.RATE_LIMITED


def _fail(session: Session, space_id: UUID, account_id: UUID, times: int) -> None:
    for _ in range(times):
        with pytest.raises(ValidationError):
            redeem(
                session,
                space_id=space_id,
                account_id=account_id,
                raw_code="EIMIR-ABCD-EFGH",
                at=AT,
            )


def test_a_success_counts_against_the_account_limit(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    limit = redemption.GIFT_CODE_HOURLY.attempts
    _fail(session, space_id, account_id, limit - 1)
    _redeem(session, space_id, account_id, code)

    with pytest.raises(RateLimitedError):
        redeem(session, space_id=space_id, account_id=account_id, raw_code="EIMIR-ABCD-EFGH", at=AT)


def test_a_replay_does_not_reset_the_account_limit(session: Session) -> None:
    code = _codes(session, _batch(session))[0]
    space_id, account_id = _couple(session)
    partner = make_account(session, "Partner")
    relationship_service.add_member(session, space_id, partner)
    # The partner redeems, so the founder's own budget holds only their attempts.
    _redeem(session, space_id, partner.id, code)
    limit = redemption.GIFT_CODE_HOURLY.attempts
    _fail(session, space_id, account_id, limit - 1)
    _redeem(session, space_id, account_id, code)

    with pytest.raises(RateLimitedError):
        redeem(session, space_id=space_id, account_id=account_id, raw_code="EIMIR-ABCD-EFGH", at=AT)


def test_twenty_failed_attempts_per_space_a_day_then_rate_limited(session: Session) -> None:
    space_id, founder_id = _couple(session)
    hourly = redemption.GIFT_CODE_HOURLY.attempts
    daily = redemption.GIFT_CODE_DAILY.attempts
    members = [founder_id]
    # The limit counts attempts per Space whoever makes them, so the extra
    # Accounts need no membership here.
    while len(members) * hourly < daily:
        members.append(make_account(session, "Member").id)
    attempts = 0
    for member_id in members:
        for _ in range(hourly):
            if attempts == daily:
                break
            with pytest.raises(ValidationError):
                redeem(
                    session,
                    space_id=space_id,
                    account_id=member_id,
                    raw_code="EIMIR-ABCD-EFGH",
                    at=AT,
                )
            attempts += 1
    fresh = make_account(session, "Fresh")

    with pytest.raises(RateLimitedError):
        redeem(session, space_id=space_id, account_id=fresh.id, raw_code="EIMIR-ABCD-EFGH", at=AT)


def test_two_codes_redeemed_at_once_both_count(  # type: ignore[no-untyped-def]
    production_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _client, maker = production_client
    # Hold each redemption between reading the Space's end and writing its
    # grant, so without the per-Space lock both would read the same end.
    read_end = redemption._latest_premium_end

    def slow_read_end(session: Session, space_id: UUID, at: datetime) -> datetime | None:
        end = read_end(session, space_id, at)
        time.sleep(0.5)
        return end

    monkeypatch.setattr(redemption, "_latest_premium_end", slow_read_end)
    with maker.begin() as setup:
        batch = _batch(setup)
        raw_codes = [code.payload.code for code in _codes(setup, batch)]
        founder = make_account(setup, "Founder")
        partner = make_account(setup, "Partner")
        space = make_space(setup, founder)
        relationship_service.add_member(setup, space.id, partner)
        space_id, accounts = space.id, [founder.id, partner.id]

    gate = Barrier(2, timeout=10)

    def run(account_id: UUID, raw_code: str) -> datetime:
        with maker.begin() as worker:
            gate.wait()
            return redeem(
                worker, space_id=space_id, account_id=account_id, raw_code=raw_code, at=AT
            ).effective_until

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [
            pool.submit(run, account_id, raw_code)
            for account_id, raw_code in zip(accounts, raw_codes, strict=True)
        ]
        ends = sorted(future.result(timeout=20) for future in futures)

    assert ends == [add_months(AT, 3), add_months(AT, 6)]
    with maker() as check:
        latest = check.scalar(
            select(func.max(EntitlementGrant.effective_until)).where(
                EntitlementGrant.space_id == space_id
            )
        )
        redeemed = check.scalar(
            select(func.count())
            .select_from(GiftCode)
            .where(GiftCode.batch_id == batch.id, GiftCode.redeemed_space_id == space_id)
        )
    assert latest == add_months(AT, 6)
    assert redeemed == 2


def test_one_code_redeemed_by_two_spaces_at_once_works_once(  # type: ignore[no-untyped-def]
    production_client, monkeypatch: pytest.MonkeyPatch
) -> None:
    _client, maker = production_client
    # Two Spaces take two different per-Space locks, so only the code row
    # lock keeps them apart. Hold each redemption inside the critical section
    # so that, without that lock, both would read the code as open.
    read_end = redemption._latest_premium_end

    def slow_read_end(session: Session, space_id: UUID, at: datetime) -> datetime | None:
        end = read_end(session, space_id, at)
        time.sleep(0.5)
        return end

    monkeypatch.setattr(redemption, "_latest_premium_end", slow_read_end)
    with maker.begin() as setup:
        batch = _batch(setup, count=1)
        [code] = _codes(setup, batch)
        code_id, raw_code = code.id, code.payload.code
        couples = [_couple(setup), _couple(setup)]

    gate = Barrier(2, timeout=10)

    def run(space_id: UUID, account_id: UUID) -> tuple[UUID, str]:
        try:
            with maker.begin() as worker:
                gate.wait()
                redeem(worker, space_id=space_id, account_id=account_id, raw_code=raw_code, at=AT)
        except ConflictError as refused:
            return space_id, str(refused.code)
        return space_id, "redeemed"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, space_id, account_id) for space_id, account_id in couples]
        outcomes = [future.result(timeout=20) for future in futures]

    assert sorted(result for _space, result in outcomes) == sorted(
        ["redeemed", str(RedemptionErrorCode.USED)]
    )
    [winner] = [space_id for space_id, result in outcomes if result == "redeemed"]
    with maker() as check:
        grants = list(
            check.scalars(
                select(EntitlementGrant).where(
                    EntitlementGrant.external_reference == f"gift-code:{code_id}"
                )
            )
        )
        redeemed_space_id = check.scalar(
            select(GiftCode.redeemed_space_id).where(GiftCode.id == code_id)
        )
    assert [grant.space_id for grant in grants] == [winner]
    assert redeemed_space_id == winner

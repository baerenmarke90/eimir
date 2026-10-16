"""Device sessions.

The suite tests not only the happy path, but especially what happens with
expired, revoked, and copied tokens.
"""

from __future__ import annotations

from collections.abc import Callable
from datetime import datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from eimir.auth import rate_limit, sessions
from eimir.auth.tokens import (
    ACCESS_TOKEN_LIFETIME,
    REFRESH_TOKEN_LIFETIME,
    SESSION_ABSOLUTE_LIFETIME,
    hash_token,
)
from eimir.core.clock import now
from eimir.core.errors import RateLimitedError, UnauthenticatedError
from eimir.identity.models import ConsumedRefreshToken, DeviceSession, RateLimitEvent
from tests.conftest import make_account, requires_database

pytestmark = [pytest.mark.integration, requires_database]


class TestCreation:
    def test_session_returns_both_tokens(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account, device_name="Pixel")
        session.flush()

        assert tokens.access_token
        assert tokens.refresh_token
        assert tokens.access_token != tokens.refresh_token
        assert device.device_name == "Pixel"

    def test_plaintext_is_not_stored(self, session: Session) -> None:
        "Database read access must not provide reusable sign-in credentials."
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        assert device.refresh_token_hash == hash_token(tokens.refresh_token)
        assert device.access_token_hash == hash_token(tokens.access_token)
        assert tokens.access_token not in str(device.__dict__)
        assert tokens.refresh_token not in str(device.__dict__)

    def test_access_token_is_short_lived(self, session: Session) -> None:
        account = make_account(session)
        _, tokens = sessions.start_session(session, account)
        session.flush()
        assert tokens.access_expires_at - now() <= timedelta(minutes=15)


class TestAuthentication:
    def test_valid_token_returns_account(self, session: Session) -> None:
        account = make_account(session)
        _, tokens = sessions.start_session(session, account)
        session.flush()

        assert sessions.authenticate(session, tokens.access_token).id == account.id

    @pytest.mark.parametrize("malformed", ["", "   ", "nicht-echt", "a" * 200])
    def test_unknown_token_is_rejected(self, session: Session, malformed: str) -> None:
        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, malformed)

    def test_expired_token_is_rejected(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        device.access_expires_at = now() - timedelta(seconds=1)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, tokens.access_token)

    def test_revoked_session_is_rejected(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        sessions.revoke(device)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, tokens.access_token)

    def test_revocation_invalidates_access_token(self, session: Session) -> None:
        "Otherwise a stolen device would remain usable until token expiry."
        account = make_account(session)
        device, _ = sessions.start_session(session, account)
        session.flush()
        sessions.revoke(device)
        assert device.access_token_hash is None

    def test_disabled_account_cannot_sign_in(self, session: Session) -> None:
        account = make_account(session)
        _, tokens = sessions.start_session(session, account)
        account.disabled_at = now()
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, tokens.access_token)

    def test_error_does_not_reveal_reason(self, session: Session) -> None:
        """A caller must not distinguish unknown, expired, and revoked tokens.

        Distinguishing those cases would disclose information about valid tokens.
        """
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()
        sessions.revoke(device)
        session.flush()

        messages = set()
        for token in ["unbekannt", tokens.access_token]:
            with pytest.raises(UnauthenticatedError) as error:
                sessions.authenticate(session, token)
            messages.add(str(error.value))
        assert len(messages) == 1


class TestRefresh:
    def test_rotates_both_tokens(self, session: Session) -> None:
        account = make_account(session)
        _, first = sessions.start_session(session, account)
        session.flush()

        second = sessions.refresh_session(session, first.refresh_token)
        session.flush()

        assert second.refresh_token != first.refresh_token
        assert second.access_token != first.access_token
        assert sessions.authenticate(session, second.access_token).id == account.id

    def test_old_access_token_no_longer_works_after_refresh(self, session: Session) -> None:
        account = make_account(session)
        _, first = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, first.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, first.access_token)

    def test_expired_refresh_token_is_rejected(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        device.expires_at = now() - timedelta(seconds=1)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, tokens.refresh_token)

    def test_revoked_refresh_token_is_rejected(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        sessions.revoke(device)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, tokens.refresh_token)


class TestReplay:
    def test_reused_refresh_token_revokes_session(self, session: Session) -> None:
        """A refresh token that reappears after rotation has been copied.

        The legitimate client already holds the replacement token, so the whole
        session family is revoked rather than allowing either holder through.
        """
        account = make_account(session)
        device, first = sessions.start_session(session, account)
        session.flush()

        second = sessions.refresh_session(session, first.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, first.refresh_token)
        session.flush()

        assert device.revoked_at is not None
        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, second.access_token)

    def test_oldest_generation_is_detected_after_multiple_rotations(self, session: Session) -> None:
        """T0 -> T1 -> T2, then replay T0.

        A two-slot window containing only the current and previous token would
        lose T0 after the second rotation. T0 must remain attributable to its
        family so replay still revokes the compromised session.
        """
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()

        t1 = sessions.refresh_session(session, t0.refresh_token)
        session.flush()
        t2 = sessions.refresh_session(session, t1.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        assert device.revoked_at is not None
        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, t2.access_token)
        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, t2.refresh_token)

    def test_middle_generation_is_detected_after_next_rotation(self, session: Session) -> None:
        "Replay T1 after T2 has been issued."
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()

        t1 = sessions.refresh_session(session, t0.refresh_token)
        session.flush()
        t2 = sessions.refresh_session(session, t1.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, t1.refresh_token)
        session.flush()

        assert device.revoked_at is not None
        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, t2.access_token)

    def test_every_generation_remains_associated_with_family(self, session: Session) -> None:
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()

        t1 = sessions.refresh_session(session, t0.refresh_token)
        session.flush()
        sessions.refresh_session(session, t1.refresh_token)
        session.flush()

        consumed = (
            session.execute(
                select(ConsumedRefreshToken).where(
                    ConsumedRefreshToken.device_session_id == device.id
                )
            )
            .scalars()
            .all()
        )
        assert {entry.token_hash for entry in consumed} == {
            hash_token(t0.refresh_token),
            hash_token(t1.refresh_token),
        }

    def test_history_keeps_only_hashes(self, session: Session) -> None:
        "Replay history must not become a second source of sign-in credentials."
        account = make_account(session)
        _, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        entry = session.execute(select(ConsumedRefreshToken)).scalar_one()
        assert entry.token_hash == hash_token(t0.refresh_token)
        assert t0.refresh_token not in str(entry.__dict__)

    def test_replay_in_one_family_leaves_other_session_alive(self, session: Session) -> None:
        account = make_account(session)
        affected, t0 = sessions.start_session(session, account)
        unaffected, other = sessions.start_session(session, account)
        session.flush()

        sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        assert affected.revoked_at is not None
        assert unaffected.revoked_at is None
        assert sessions.authenticate(session, other.access_token).id == account.id

    def test_unknown_token_revokes_nothing(self, session: Session) -> None:
        """Only a genuine token from the family may trigger revocation.

        Otherwise arbitrary garbage sent to the refresh endpoint could revoke a
        foreign session.
        """
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, "gibt-es-nicht")
        session.flush()

        assert device.revoked_at is None
        assert sessions.authenticate(session, tokens.access_token).id == account.id

    def test_error_does_not_reveal_reason(self, session: Session) -> None:
        """Unknown, expired, and replayed tokens must look identical.

        A distinguishable error would disclose which token was once real.
        """
        account = make_account(session)
        _, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        expired_account = make_account(session, "Abgelaufen")
        expired_device, expired = sessions.start_session(session, expired_account)
        expired_device.expires_at = now() - timedelta(seconds=1)
        session.flush()

        messages = set()
        codes = set()
        for token in ["gibt-es-nicht", t0.refresh_token, expired.refresh_token]:
            with pytest.raises(UnauthenticatedError) as error:
                sessions.refresh_session(session, token)
            session.flush()
            messages.add(str(error.value))
            codes.add(error.value.code)
        assert len(messages) == 1
        assert len(codes) == 1


class TestAbsoluteLifetime:
    """A session family has a hard lifetime limit.

    Without it, regular refreshes could keep the sliding window open forever,
    and replay history would grow without a finite cleanup boundary.
    """

    @staticmethod
    def _clock(monkeypatch: pytest.MonkeyPatch, start: datetime) -> Callable[[datetime], None]:
        "A controllable clock for the session module."
        state = {"current": start}
        monkeypatch.setattr(sessions, "now", lambda: state["current"])

        def set_time(at: datetime) -> None:
            state["current"] = at

        return set_time

    @staticmethod
    def _keep_alive(
        session: Session,
        tokens: sessions.IssuedTokens,
        set_time: Callable[[datetime], None],
        *,
        starting_at: datetime,
        until: datetime,
        step: timedelta = timedelta(days=14),
    ) -> tuple[sessions.IssuedTokens, datetime]:
        """Keep the session alive through regular refreshes until just before `until`.

        Without those refreshes the sliding window would expire and the test
        would exercise the wrong boundary.
        """
        current_time = starting_at
        while current_time + step < until:
            current_time += step
            set_time(current_time)
            tokens = sessions.refresh_session(session, tokens.refresh_token)
            session.flush()
        return tokens, current_time

    def test_regular_refresh_does_not_move_boundary(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The family ages even while it is actively used.

        A client refreshing every two weeks keeps the sliding window open, but
        the absolute boundary must not move. Otherwise neither the session nor
        its replay history would have a finite upper lifetime.
        """
        start = now()
        set_time = self._clock(monkeypatch, start)

        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        boundary = device.absolute_expires_at
        assert boundary == start + SESSION_ABSOLUTE_LIFETIME

        step = timedelta(days=14)
        current_time = start
        while current_time + step < boundary:
            current_time += step
            set_time(current_time)
            tokens = sessions.refresh_session(session, tokens.refresh_token)
            session.flush()

            assert device.absolute_expires_at == boundary, "the boundary moved"
            assert device.expires_at > current_time

        # The session is still alive shortly before the absolute boundary.
        assert current_time > start + timedelta(days=150)
        assert sessions.authenticate(session, tokens.access_token).id == account.id

        set_time(boundary + timedelta(seconds=1))
        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, tokens.refresh_token)
        session.flush()

    def test_sliding_window_does_not_outlive_boundary(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        "Otherwise the response would advertise an expiry date that does not apply."
        start = now()
        set_time = self._clock(monkeypatch, start)

        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        shortly_before = device.absolute_expires_at - timedelta(hours=1)
        tokens, _ = self._keep_alive(
            session, tokens, set_time, starting_at=start, until=shortly_before
        )

        set_time(shortly_before)
        refreshed = sessions.refresh_session(session, tokens.refresh_token)
        session.flush()

        assert refreshed.refresh_expires_at == device.absolute_expires_at
        assert refreshed.refresh_expires_at < shortly_before + REFRESH_TOKEN_LIFETIME
        assert refreshed.access_expires_at <= device.absolute_expires_at

    def test_access_token_ends_with_family(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        "An access token issued shortly before the boundary may not outlive it."
        start = now()
        set_time = self._clock(monkeypatch, start)

        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        shortly_before = device.absolute_expires_at - timedelta(minutes=1)
        tokens, _ = self._keep_alive(
            session, tokens, set_time, starting_at=start, until=shortly_before
        )

        set_time(shortly_before)
        refreshed = sessions.refresh_session(session, tokens.refresh_token)
        session.flush()
        assert sessions.authenticate(session, refreshed.access_token).id == account.id

        set_time(device.absolute_expires_at + timedelta(seconds=1))
        assert refreshed.access_expires_at > start
        with pytest.raises(UnauthenticatedError):
            sessions.authenticate(session, refreshed.access_token)

    def test_history_of_permanently_used_family_is_finite(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """The absolute boundary makes replay history finite.

        Only when the family ends can all of its consumed-token history become
        eligible for cleanup.
        """
        start = now()
        set_time = self._clock(monkeypatch, start)

        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        current_time = start
        step = timedelta(days=14)
        while current_time + step < device.absolute_expires_at:
            current_time += step
            set_time(current_time)
            tokens = sessions.refresh_session(session, tokens.refresh_token)
            session.flush()

        collected = session.execute(select(ConsumedRefreshToken)).scalars().all()
        assert len(collected) > 1

        # While the family is alive, every generation remains attributable.
        assert sessions.prune_replay_history(session) == 0

        set_time(device.absolute_expires_at + sessions.REPLAY_HISTORY_RETENTION + timedelta(days=1))
        assert sessions.prune_replay_history(session) == len(collected)
        session.flush()
        assert session.execute(select(ConsumedRefreshToken)).scalars().all() == []

    def test_all_generations_remain_replay_detectable_until_boundary(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        "The absolute boundary must not become a hidden replay-history window."
        start = now()
        set_time = self._clock(monkeypatch, start)

        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()

        tokens = t0
        current_time = start
        for _ in range(10):
            current_time += timedelta(days=14)
            set_time(current_time)
            tokens = sessions.refresh_session(session, tokens.refresh_token)
            session.flush()

        # Replay the very first generation after many rotations and months.
        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        assert device.revoked_at is not None

    def test_new_sign_in_starts_new_family(
        self, session: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        "After the absolute boundary, only re-authentication can start a new family."
        start = now()
        set_time = self._clock(monkeypatch, start)

        account = make_account(session)
        old_device, old_tokens = sessions.start_session(session, account)
        session.flush()

        after_boundary = old_device.absolute_expires_at + timedelta(days=1)
        set_time(after_boundary)
        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, old_tokens.refresh_token)
        session.flush()

        new_device, new_tokens = sessions.start_session(session, account)
        session.flush()

        assert new_device.id != old_device.id
        assert new_device.absolute_expires_at == after_boundary + SESSION_ABSOLUTE_LIFETIME
        assert sessions.authenticate(session, new_tokens.access_token).id == account.id

    def test_fresh_session_keeps_sliding_and_absolute_windows_separate(
        self, session: Session
    ) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        assert device.expires_at < device.absolute_expires_at
        assert device.absolute_expires_at - device.expires_at == (
            SESSION_ABSOLUTE_LIFETIME - REFRESH_TOKEN_LIFETIME
        )
        assert tokens.access_expires_at - now() <= ACCESS_TOKEN_LIFETIME


class TestReplayHistoryCleanup:
    def test_active_session_keeps_history(self, session: Session) -> None:
        "History for a live family is required for replay detection."
        account = make_account(session)
        _, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        assert sessions.prune_replay_history(session) == 0
        session.flush()
        assert session.execute(select(ConsumedRefreshToken)).scalars().all()

    def test_ended_session_is_cleaned_after_retention_period(self, session: Session) -> None:
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        sessions.revoke(device)
        device.revoked_at = now() - sessions.REPLAY_HISTORY_RETENTION - timedelta(days=1)
        session.flush()

        assert sessions.prune_replay_history(session) == 1
        session.flush()
        assert session.execute(select(ConsumedRefreshToken)).scalars().all() == []

    def test_fresh_revoked_session_remains_initially(self, session: Session) -> None:
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        sessions.revoke(device)
        session.flush()

        assert sessions.prune_replay_history(session) == 0

    def test_expired_session_is_cleaned_without_revocation(self, session: Session) -> None:
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        device.expires_at = now() - sessions.REPLAY_HISTORY_RETENTION - timedelta(days=1)
        session.flush()

        assert sessions.prune_replay_history(session) == 1

    def test_deleted_session_removes_history(self, session: Session) -> None:
        "The foreign key removes replay history through cascading deletion."
        account = make_account(session)
        device, t0 = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, t0.refresh_token)
        session.flush()

        session.delete(device)
        session.flush()

        assert session.execute(select(ConsumedRefreshToken)).scalars().all() == []


class TestRevokeAll:
    def test_ends_every_open_session(self, session: Session) -> None:
        account = make_account(session)
        tokens = [sessions.start_session(session, account)[1] for _ in range(3)]
        session.flush()

        assert sessions.revoke_all(session, account) == 3
        session.flush()

        for token_set in tokens:
            with pytest.raises(UnauthenticatedError):
                sessions.authenticate(session, token_set.access_token)

    def test_leaves_foreign_sessions_untouched(self, session: Session) -> None:
        own_account = make_account(session, "Eigen")
        foreign = make_account(session, "Fremd")
        _, foreign_tokens = sessions.start_session(session, foreign)
        sessions.start_session(session, own_account)
        session.flush()

        sessions.revoke_all(session, own_account)
        session.flush()

        assert sessions.authenticate(session, foreign_tokens.access_token).id == foreign.id
        open_sessions = (
            session.execute(
                select(DeviceSession).where(
                    DeviceSession.account_id == foreign.id,
                    DeviceSession.revoked_at.is_(None),
                )
            )
            .scalars()
            .all()
        )
        assert len(open_sessions) == 1


class TestRotationFlood:
    """Successful rotations are themselves limited.

    Without this boundary, a client with a valid token could create arbitrarily
    many generations and replay-history rows in a tight loop. The absolute
    lifetime bounds total growth but does not bound its rate.
    """

    def test_budget_limits_rotations(self, session: Session) -> None:
        account = make_account(session)
        _, tokens = sessions.start_session(session, account)
        session.flush()

        token = tokens.refresh_token
        for _ in range(rate_limit.REFRESH.attempts):
            token = sessions.refresh_session(session, token).refresh_token
            session.flush()

        with pytest.raises(RateLimitedError):
            sessions.refresh_session(session, token)

    def test_boundary_belongs_to_session_not_token(self, session: Session) -> None:
        "The token value changes on each rotation; the counter does not."
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()

        token = tokens.refresh_token
        for _ in range(3):
            token = sessions.refresh_session(session, token).refresh_token
            session.flush()

        keys = (
            session.execute(
                select(RateLimitEvent.key_hash).where(RateLimitEvent.action == "refresh")
            )
            .scalars()
            .all()
        )
        assert len(keys) == 3
        assert set(keys) == {hash_token(str(device.id))}

    def test_other_session_of_same_account_remains_free(self, session: Session) -> None:
        account = make_account(session)
        _, first = sessions.start_session(session, account, device_name="Pixel")
        _, second = sessions.start_session(session, account, device_name="Laptop")
        session.flush()

        token = first.refresh_token
        for _ in range(rate_limit.REFRESH.attempts):
            token = sessions.refresh_session(session, token).refresh_token
            session.flush()
        with pytest.raises(RateLimitedError):
            sessions.refresh_session(session, token)

        assert sessions.refresh_session(session, second.refresh_token).refresh_token

    def test_unknown_token_remains_401_and_is_not_counted(self, session: Session) -> None:
        "A 429 must not disclose that a session exists."
        account = make_account(session)
        _, tokens = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, tokens.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, "voellig-unbekannt")

        attempts = session.execute(
            select(func.count())
            .select_from(RateLimitEvent)
            .where(RateLimitEvent.action == "refresh")
        ).scalar_one()
        assert attempts == 1

    def test_replay_remains_401_and_still_revokes(self, session: Session) -> None:
        account = make_account(session)
        device, tokens = sessions.start_session(session, account)
        session.flush()
        sessions.refresh_session(session, tokens.refresh_token)
        session.flush()

        with pytest.raises(UnauthenticatedError):
            sessions.refresh_session(session, tokens.refresh_token)
        assert device.revoked_at is not None

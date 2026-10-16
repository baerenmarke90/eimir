"""Absolute upload-claim lifetime regression for #713."""

from __future__ import annotations

from datetime import timedelta

import pytest

from eimir.attachments import service, upload_ownership
from eimir.attachments.models import Attachment, MediaType
from eimir.authorization import AuthorizationContext
from eimir.core.errors import DomainError
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_claim_renewal_never_exceeds_absolute_lifetime(
    production_client,
    monkeypatch,
) -> None:  # type: ignore[no-untyped-def]
    """Continuous activity cannot keep one claim generation alive forever."""
    _, maker = production_client
    with maker() as session:
        account = make_account(session, "Claim owner")
        space = make_space(session, account)
        context = AuthorizationContext(account_id=account.id, space_id=space.id)
        attachment = service.create_upload(
            session,
            context,
            media_type=MediaType.IMAGE,
            original_name="claim.jpg",
            expected_mime_type="image/jpeg",
            expected_size=3,
        )
        attachment_id = attachment.id
        session.commit()

    with maker() as source:
        claim = upload_ownership.claim_upload(source, context, attachment_id)

    start = claim.expires_at - upload_ownership.UPLOAD_CLAIM_MAX_LIFETIME
    renewed = claim
    # Each renewal happens before the current five-minute lease expires. The
    # final renewals approach the hard cap and must never move past it.
    for seconds in (270, 540, 810, 1080, 1350, 1620, 1770):
        current = start + timedelta(seconds=seconds)
        monkeypatch.setattr(upload_ownership, "now", lambda current=current: current)
        with maker() as source:
            renewed = upload_ownership.renew_upload_claim(source, renewed)
        assert renewed.lease_until <= claim.expires_at

    assert renewed.lease_until == claim.expires_at

    after_cap = claim.expires_at + timedelta(seconds=1)
    monkeypatch.setattr(upload_ownership, "now", lambda: after_cap)
    with maker() as source, pytest.raises(DomainError) as error:
        upload_ownership.renew_upload_claim(source, renewed)
    assert error.value.status == 409

    with maker() as session:
        stored = session.get(Attachment, attachment_id)
        assert stored is not None
        assert not upload_ownership.active_upload_claim(stored, current_time=after_cap)

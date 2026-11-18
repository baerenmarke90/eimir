"""Store-neutral purchase evidence shared by every app-store adapter.

A store adapter verifies a purchase with its store and returns
``VerifiedStoreSubscription``: the store's current state, already reduced to the
normalized entitlement lifecycle. The billing service maps it into the central
``EntitlementGrant``; no product code ever reads store identifiers.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime
from typing import Protocol, runtime_checkable
from uuid import UUID

from eimir.billing.models import StoreChannel
from eimir.entitlements.models import EntitlementStatus


class StoreProviderError(Exception):
    """A store could not be asked. ``retryable`` decides 503 versus a final error.

    The message is a fixed code; store responses are never quoted, because they
    may echo purchase tokens or order identifiers.
    """

    def __init__(self, code: str, *, retryable: bool = True) -> None:
        super().__init__(code)
        self.code = code
        self.retryable = retryable


class StorePurchaseInvalidError(Exception):
    """The store does not know the token, or it belongs to another app."""


@dataclass(frozen=True)
class VerifiedStoreSubscription:
    """The store's current view of one subscription purchase."""

    store: StoreChannel
    # Stable, non-secret identity of the purchase (a hash of the store token).
    reference: str
    # The opaque purchase reference eimir. handed to the store, if present.
    purchase_reference: UUID | None
    product_id: str
    plan_id: str | None
    # ``None`` while the payment is still pending: nothing may be granted yet.
    status: EntitlementStatus | None
    started_at: datetime | None
    expires_at: datetime | None
    auto_renewing: bool
    acknowledged: bool
    test_purchase: bool
    # The purchase this one replaced (upgrade, downgrade or resubscription).
    linked_reference: str | None = None


@runtime_checkable
class StoreAdapter(Protocol):
    store: StoreChannel

    def verify(self, purchase_token: str) -> VerifiedStoreSubscription: ...

    def acknowledge(self, purchase_token: str, product_id: str) -> None: ...


def token_reference(store: StoreChannel, purchase_token: str) -> str:
    """Hash the token so the grant row never stores the store credential itself."""
    digest = hashlib.sha256(purchase_token.encode()).hexdigest()
    prefix = {StoreChannel.GOOGLE_PLAY: "gp", StoreChannel.APP_STORE: "as"}[store]
    return f"{prefix}:{digest}"

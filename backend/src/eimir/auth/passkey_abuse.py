"""Abuse boundary for anonymous passkey authentication starts.

Starting WebAuthn authentication deliberately knows neither account nor
credential. The only available rate-limit key is therefore the client's
network identity after it has been resolved at the trusted HTTP boundary.

In production, ``request.client.host`` comes from the ASGI scope normalized by
Uvicorn. Forwarded headers are evaluated there only for explicitly configured
``FORWARDED_ALLOW_IPS``. This module deliberately parses neither ``Forwarded``
nor ``X-Forwarded-For`` itself.
"""

from __future__ import annotations

from datetime import timedelta
from ipaddress import IPv6Address, ip_address, ip_network

from sqlalchemy.orm import Session

from eimir.auth import rate_limit

ACTION_AUTHENTICATION_START = "passkey_auth_start"
AUTHENTICATION_START = rate_limit.Limit(attempts=30, window=timedelta(minutes=15))
"""Generous human budget with bounded challenge-write throughput.

Thirty starts in 15 minutes are well above a normal interactive login flow.
The limit is per network identity rather than global so one attacker cannot use
a single key to block all passkey sign-ins for the instance.
"""


def network_key(client_host: str | None) -> str:
    """Derive a stable non-account abuse key from the ASGI peer.

    IPv4 is limited per address. IPv6 is normalized to /64 so a client cannot
    evade the limit by rotating interface IDs within one network. IPv4-mapped
    IPv6 is handled as IPv4.

    The fallback for non-IP ASGI test/transport clients deliberately remains
    bound to their peer identifier. In a production TCP deployment Uvicorn
    provides an IP address here.
    """
    raw = (client_host or "unknown").strip().lower() or "unknown"
    try:
        address = ip_address(raw)
    except ValueError:
        return f"peer:{raw}"

    if isinstance(address, IPv6Address):
        if address.ipv4_mapped is not None:
            return f"ipv4:{address.ipv4_mapped.compressed}"
        network = ip_network((address, 64), strict=False)
        return f"ipv6:{network.network_address.compressed}/64"

    return f"ipv4:{address.compressed}"


def reserve_authentication_start(session: Session, client_host: str | None) -> None:
    """Atomically reserve a database-wide slot before each challenge write."""
    key = network_key(client_host)
    rate_limit.check(session, ACTION_AUTHENTICATION_START, key, AUTHENTICATION_START)
    # Preserve historical caller semantics. Since #60, ``record_attempt``
    # recognizes that ``check`` already persisted the slot and therefore does
    # not create a second event.
    rate_limit.record_attempt(session, ACTION_AUTHENTICATION_START, key)

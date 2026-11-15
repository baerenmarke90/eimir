"""A short-lived browser proof, independent of OAuth state and bearer auth."""

from __future__ import annotations

import re

from starlette.responses import Response

from eimir.auth.tokens import hash_token

# One cookie per transaction keeps two selections in the same browser independent.
# __Host- forbids Domain and requires Secure + Path=/ in supporting browsers.
_PREFIX = "__Host-eimir-photo-"
_TOKEN = re.compile(r"[A-Za-z0-9_-]{43}\Z")
MAX_AGE_SECONDS = 600


def valid_proof(value: str | None) -> bool:
    return isinstance(value, str) and _TOKEN.fullmatch(value) is not None


def cookie_name(state: str) -> str:
    # Neither raw OAuth state nor caller-controlled cookie syntax is reflected.
    return _PREFIX + hash_token(state)


def set_cookie(response: Response, state: str, proof: str) -> None:
    response.set_cookie(
        cookie_name(state),
        proof,
        max_age=MAX_AGE_SECONDS,
        secure=True,
        httponly=True,
        samesite="lax",
        path="/",
    )


def clear_cookie(response: Response, state: str) -> None:
    response.delete_cookie(cookie_name(state), secure=True, httponly=True, samesite="lax", path="/")

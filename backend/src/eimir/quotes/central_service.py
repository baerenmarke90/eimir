"""Operator-only ASGI entry point for the privately mounted Mentria catalog."""

from collections.abc import Iterator
from hashlib import sha256
from pathlib import Path
from re import fullmatch
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, HTTPException, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, ValidationError

from eimir.core import clock
from eimir.quotes.central_contract import (
    DAILY_QUOTE_PATH,
    TOKEN_PATTERN,
    CentralDailyQuote,
    MentriaId,
    QuoteLanguage,
    QuoteText,
)

DATA_DIR = Path("/run/eimir/quotes")
CATALOG_FILENAME = "eimir-pro-mentria-quotes.json"
TOKEN_DIGESTS_FILENAME = "tokens.sha256"
_bearer = HTTPBearer(auto_error=False)


class _Translations(BaseModel):
    de: QuoteText
    en: QuoteText

    def in_language(self, locale: QuoteLanguage) -> str:
        return self.de if locale == "de" else self.en


class _MentriaEntry(BaseModel):
    id: MentriaId
    collection: Literal["mentria"]
    texts: _Translations


class _CatalogLicense(BaseModel):
    spdx: Literal["Apache-2.0"]
    text: str = Field(min_length=1)


class _MentriaCatalog(BaseModel):
    entries: list[_MentriaEntry] = Field(min_length=1)
    license: _CatalogLicense
    license_notice: str = Field(min_length=1)


def _load_catalog(path: Path) -> list[_MentriaEntry]:
    try:
        data = _MentriaCatalog.model_validate_json(path.read_bytes())
    except (OSError, ValidationError):
        raise RuntimeError("The private Mentria catalog could not be loaded.") from None
    if len({entry.id for entry in data.entries}) != len(data.entries):
        raise RuntimeError("The private Mentria catalog contains duplicate IDs.")
    return sorted(data.entries, key=lambda entry: entry.id)


def _read_digests(path: Path) -> Iterator[bytes]:
    try:
        lines = path.read_text(encoding="ascii").splitlines()
    except (OSError, ValueError):
        raise RuntimeError("The quote service access file could not be loaded.") from None
    for line in lines:
        digest = line.strip()
        if not digest:
            continue
        if not fullmatch(r"[0-9a-f]{64}", digest):
            raise RuntimeError("The quote service access file contains an invalid SHA-256 digest.")
        yield bytes.fromhex(digest)


def create_app(data_dir: Path = DATA_DIR) -> FastAPI:
    """Start only with an operator-provided catalog and access file."""
    entries = _load_catalog(data_dir / CATALOG_FILENAME)
    allowed_digests = frozenset(_read_digests(data_dir / TOKEN_DIGESTS_FILENAME))
    app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)

    def require_client(
        auth: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
    ) -> None:
        if (
            auth is None
            or not fullmatch(TOKEN_PATTERN, auth.credentials)
            or sha256(auth.credentials.encode("ascii")).digest() not in allowed_digests
        ):
            raise HTTPException(
                status_code=401,
                detail="Quote service credentials required.",
                headers={"WWW-Authenticate": "Bearer", "Cache-Control": "no-store"},
            )

    @app.get(DAILY_QUOTE_PATH, dependencies=[Depends(require_client)])
    def daily_quote(locale: QuoteLanguage, response: Response) -> CentralDailyQuote:
        day = clock.now().date()
        entry = entries[day.toordinal() % len(entries)]
        response.headers["Cache-Control"] = "private, no-store"
        return CentralDailyQuote(
            checked_on=day,
            id=entry.id,
            locale=locale,
            text=entry.texts.in_language(locale),
        )

    return app

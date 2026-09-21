"""Authorized Search over decrypted content (M4-A, revised for issue #797).

Search is a derived read model. Tenant and privacy are constrained in SQL before
any content is loaded, and the result set contains only the fields needed for
Search presentation. No separate plaintext search document and no plaintext
database index exist.

Why this is not PostgreSQL full-text search any more: protected payloads are
stored as ciphertext, so the database cannot tokenize them, and a GIN index over
their text would be a plaintext copy defeating the encryption. Matching
therefore happens in the application, over the payloads of the rows the caller
is already authorized to see, after decryption. The cost is linear in the
caller's own content per query, which is bounded by the size of one relationship
space; see docs/ENCRYPTION-AT-REST.md for the limit and the follow-up.

Query language (a documented subset of ``websearch_to_tsquery``): words are
ANDed, ``"quoted words"`` must be adjacent, ``-word`` excludes, ``or`` separates
alternatives. Ranking weights title-like fields above body-like fields;
ordering, cursors and pagination keep the ``search-v1`` contract.
"""

from __future__ import annotations

import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from enum import StrEnum
from functools import cmp_to_key
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from eimir.authorization import AuthorizationContext, PrivacyClass
from eimir.chapters.models import Chapter
from eimir.collections.models import Collection, CollectionItem
from eimir.core import cursor as cursor_codec
from eimir.core.errors import ValidationError
from eimir.gift_ideas.models import GiftIdea
from eimir.heart_moments.models import HeartMoment
from eimir.memories.models import Memory
from eimir.milestones.models import Milestone
from eimir.places.models import Place
from eimir.plans.models import Plan
from eimir.private_collections.models import PrivateCollection, PrivateCollectionItem
from eimir.private_notes.models import PrivateNote
from eimir.wishes.models import Wish

DEFAULT_LIMIT = 25
MAX_LIMIT = 50
MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 200
_EXCERPT_LENGTH = 240
_RANK_SCALE = 1_000_000
_SORT_CONTRACT = "search-v1"
_WEIGHTS = {"A": 1.0, "B": 0.4}
_TOKEN = re.compile(r"[^\W_]+")
_QUERY_ITEM = re.compile(r'(-?)"([^"]*)"|(-?)(\S+)')


class SearchKind(StrEnum):
    MEMORY = "MEMORY"
    HEART_MOMENT = "HEART_MOMENT"
    MILESTONE = "MILESTONE"
    WISH = "WISH"
    PLAN = "PLAN"
    PLACE = "PLACE"
    CHAPTER = "CHAPTER"
    COLLECTION = "COLLECTION"
    COLLECTION_ITEM = "COLLECTION_ITEM"
    PRIVATE_NOTE = "PRIVATE_NOTE"
    GIFT_IDEA = "GIFT_IDEA"
    PRIVATE_COLLECTION = "PRIVATE_COLLECTION"
    PRIVATE_COLLECTION_ITEM = "PRIVATE_COLLECTION_ITEM"


class SearchScope(StrEnum):
    SHARED = "SHARED"
    PRIVATE = "PRIVATE"


@dataclass(frozen=True)
class SearchRow:
    kind: SearchKind
    id: UUID
    parent_id: UUID | None
    scope: SearchScope
    title: str | None
    excerpt: str | None
    occurred_on: date | None
    created_at: datetime
    rank_key: int


@dataclass(frozen=True)
class SearchPageResult:
    items: list[SearchRow]
    next_cursor: str | None


def normalize_query(value: str) -> str:
    """Return the canonical query used for Search and cursor binding."""
    normalized = unicodedata.normalize("NFC", value)
    normalized = " ".join(normalized.split())
    if not MIN_QUERY_LENGTH <= len(normalized) <= MAX_QUERY_LENGTH:
        raise ValidationError(
            "Search query must contain between 2 and 200 characters after normalization.",
            "SEARCH_QUERY_INVALID",
        )
    return normalized


def tokenize(text: str) -> list[str]:
    """Lower-cased word tokens (the equivalent of the ``simple`` text configuration)."""
    return _TOKEN.findall(unicodedata.normalize("NFC", text).casefold())


@dataclass(frozen=True)
class _Group:
    """One AND-group of an ``or``-separated query."""

    required: tuple[tuple[str, ...], ...]
    excluded: tuple[tuple[str, ...], ...]


def parse_query(query: str) -> tuple[_Group, ...]:
    groups: list[_Group] = []
    required: list[tuple[str, ...]] = []
    excluded: list[tuple[str, ...]] = []

    def close() -> None:
        nonlocal required, excluded
        if required:
            groups.append(_Group(tuple(required), tuple(excluded)))
        required, excluded = [], []

    for quoted_neg, quoted, bare_neg, bare in _QUERY_ITEM.findall(query):
        if bare and not bare_neg and bare.casefold() == "or":
            close()
            continue
        negated = bool(quoted_neg or bare_neg)
        tokens = tuple(tokenize(quoted if quoted or quoted_neg else bare))
        if not tokens:
            continue
        (excluded if negated else required).append(tokens)
    close()
    return tuple(groups)


def _occurrences(tokens: list[str], phrase: tuple[str, ...]) -> int:
    if len(phrase) == 1:
        return tokens.count(phrase[0])
    width = len(phrase)
    return sum(
        1
        for start in range(len(tokens) - width + 1)
        if tuple(tokens[start : start + width]) == phrase
    )


def score(groups: tuple[_Group, ...], fields: tuple[tuple[str | None, str], ...]) -> int | None:
    """Return the rank of a document, or ``None`` when it does not match.

    ``fields`` is ``(text, weight class)`` per searchable field.
    """
    tokenized = [(tokenize(text or ""), weight) for text, weight in fields]
    best: float | None = None
    for group in groups:
        if any(
            _occurrences(tokens, phrase) for phrase in group.excluded for tokens, _ in tokenized
        ):
            continue
        total = 0.0
        matched = True
        for phrase in group.required:
            phrase_score = sum(
                _occurrences(tokens, phrase) * _WEIGHTS[weight] for tokens, weight in tokenized
            )
            if phrase_score == 0:
                matched = False
                break
            total += phrase_score
        if matched and (best is None or total > best):
            best = total
    if best is None:
        return None
    return round(best * _RANK_SCALE)


def _bounded(value: str | None) -> str | None:
    return value[:_EXCERPT_LENGTH] if value else None


def _joined(*values: str | None) -> str | None:
    return _bounded(" \u00b7 ".join(value for value in values if value))


@dataclass(frozen=True)
class _Source:
    kind: SearchKind
    scope: SearchScope
    model: Any
    # Fields the query is matched against: payload attribute and weight class.
    fields: tuple[tuple[str, str], ...]
    title: Callable[[Any], str | None]
    excerpt: Callable[[Any], str | None]
    occurred_on: Callable[[Any], date | None] = lambda row: None
    owner_only: bool = False
    privacy: PrivacyClass = PrivacyClass.SPACE_SHARED
    parent: Any = None


def _none(_: Any) -> None:
    return None


_SOURCES: dict[SearchKind, tuple[_Source, ...]] = {
    SearchKind.MEMORY: (
        _Source(
            SearchKind.MEMORY,
            SearchScope.SHARED,
            Memory,
            (("title", "A"), ("body", "B")),
            lambda row: row.payload.title,
            lambda row: _bounded(row.payload.body),
            lambda row: row.happened_on,
        ),
    ),
    SearchKind.HEART_MOMENT: (
        _Source(
            SearchKind.HEART_MOMENT,
            SearchScope.SHARED,
            HeartMoment,
            (("text", "A"),),
            _none,
            lambda row: _bounded(row.payload.text),
            lambda row: row.happened_on,
        ),
        _Source(
            SearchKind.HEART_MOMENT,
            SearchScope.PRIVATE,
            HeartMoment,
            (("text", "A"),),
            _none,
            lambda row: _bounded(row.payload.text),
            lambda row: row.happened_on,
            owner_only=True,
            privacy=PrivacyClass.OWNER_ONLY,
        ),
    ),
    SearchKind.MILESTONE: (
        _Source(
            SearchKind.MILESTONE,
            SearchScope.SHARED,
            Milestone,
            (("title", "A"), ("body", "B")),
            lambda row: row.payload.title,
            lambda row: _bounded(row.payload.body),
            lambda row: row.happened_on,
        ),
    ),
    SearchKind.WISH: (
        _Source(
            SearchKind.WISH,
            SearchScope.SHARED,
            Wish,
            (("title", "A"),),
            lambda row: row.payload.title,
            _none,
        ),
    ),
    SearchKind.PLAN: (
        _Source(
            SearchKind.PLAN,
            SearchScope.SHARED,
            Plan,
            (("title", "A"), ("description", "B")),
            lambda row: row.payload.title,
            lambda row: _bounded(row.payload.description),
            lambda row: row.experienced_on,
        ),
    ),
    SearchKind.PLACE: (
        _Source(
            SearchKind.PLACE,
            SearchScope.SHARED,
            Place,
            (("name", "A"), ("description", "B"), ("address", "B")),
            lambda row: row.payload.name,
            lambda row: _joined(row.payload.description, row.payload.address),
        ),
    ),
    SearchKind.CHAPTER: (
        _Source(
            SearchKind.CHAPTER,
            SearchScope.SHARED,
            Chapter,
            (("title", "A"), ("description", "B")),
            lambda row: row.payload.title,
            lambda row: _bounded(row.payload.description),
            lambda row: row.start_on,
        ),
    ),
    SearchKind.COLLECTION: (
        _Source(
            SearchKind.COLLECTION,
            SearchScope.SHARED,
            Collection,
            (("title", "A"),),
            lambda row: row.payload.title,
            _none,
        ),
    ),
    SearchKind.COLLECTION_ITEM: (
        _Source(
            SearchKind.COLLECTION_ITEM,
            SearchScope.SHARED,
            CollectionItem,
            (("title", "A"),),
            lambda row: row.payload.title,
            _none,
            parent=Collection,
        ),
    ),
    SearchKind.PRIVATE_NOTE: (
        _Source(
            SearchKind.PRIVATE_NOTE,
            SearchScope.PRIVATE,
            PrivateNote,
            (("title", "A"), ("body", "B")),
            lambda row: row.payload.title,
            lambda row: _bounded(row.payload.body),
            owner_only=True,
            privacy=PrivacyClass.OWNER_ONLY,
        ),
    ),
    SearchKind.GIFT_IDEA: (
        _Source(
            SearchKind.GIFT_IDEA,
            SearchScope.PRIVATE,
            GiftIdea,
            (
                ("title", "A"),
                ("description", "B"),
                ("recipient", "B"),
                ("occasion", "B"),
                ("price_text", "B"),
            ),
            lambda row: row.payload.title,
            lambda row: _joined(
                row.payload.description,
                row.payload.recipient,
                row.payload.occasion,
                row.payload.price_text,
            ),
            owner_only=True,
            privacy=PrivacyClass.OWNER_ONLY,
        ),
    ),
    SearchKind.PRIVATE_COLLECTION: (
        _Source(
            SearchKind.PRIVATE_COLLECTION,
            SearchScope.PRIVATE,
            PrivateCollection,
            (("title", "A"),),
            lambda row: row.payload.title,
            _none,
            owner_only=True,
            privacy=PrivacyClass.OWNER_ONLY,
        ),
    ),
    SearchKind.PRIVATE_COLLECTION_ITEM: (
        _Source(
            SearchKind.PRIVATE_COLLECTION_ITEM,
            SearchScope.PRIVATE,
            PrivateCollectionItem,
            (("title", "A"),),
            lambda row: row.payload.title,
            _none,
            owner_only=True,
            privacy=PrivacyClass.OWNER_ONLY,
            parent=PrivateCollection,
        ),
    ),
}


def _authorized_rows(
    session: Session, context: AuthorizationContext, source: _Source
) -> list[tuple[Any, UUID | None]]:
    """Load the rows this caller may search. Authorization is decided here, in SQL.

    Nothing outside this query is ever decrypted, so a row the caller may not
    see is never exposed to ranking, excerpting or logging.
    """
    model = source.model
    if source.parent is not None:
        parent = source.parent
        statement = (
            select(model, parent.id)
            .join(parent, parent.id == model.collection_id)
            .where(
                parent.space_id == context.space_id, parent.privacy_class == source.privacy.value
            )
        )
        if source.owner_only:
            statement = statement.where(parent.owner_id == context.account_id)
        return [(row, parent_id) for row, parent_id in session.execute(statement).all()]
    statement = select(model).where(
        model.space_id == context.space_id, model.privacy_class == source.privacy.value
    )
    if source.owner_only:
        statement = statement.where(model.owner_id == context.account_id)
    return [(row, None) for row in session.execute(statement).scalars()]


def _compare(left: SearchRow, right: SearchRow) -> int:
    if left.rank_key != right.rank_key:
        return -1 if left.rank_key > right.rank_key else 1
    if left.created_at != right.created_at:
        return -1 if left.created_at > right.created_at else 1
    if left.kind.value != right.kind.value:
        return -1 if left.kind.value < right.kind.value else 1
    if left.id != right.id:
        return -1 if str(left.id) < str(right.id) else 1
    return 0


def _canonical_kinds(kinds: tuple[SearchKind, ...]) -> tuple[SearchKind, ...]:
    selected = kinds or tuple(SearchKind)
    return tuple(sorted(set(selected), key=lambda kind: kind.value))


def _cursor_binding(
    context: AuthorizationContext,
    *,
    query: str,
    kinds: tuple[SearchKind, ...],
) -> dict[str, Any]:
    return {
        "collection": "search",
        "accountId": str(context.account_id),
        "spaceId": str(context.space_id),
        "query": query,
        "types": [kind.value for kind in kinds],
        "sort": _SORT_CONTRACT,
    }


def _encode_cursor(
    context: AuthorizationContext,
    *,
    query: str,
    kinds: tuple[SearchKind, ...],
    item: SearchRow,
) -> str:
    return cursor_codec.encode(
        binding=_cursor_binding(context, query=query, kinds=kinds),
        position={
            "rank": item.rank_key,
            "createdAt": item.created_at.astimezone(UTC).isoformat().replace("+00:00", "Z"),
            "type": item.kind.value,
            "id": str(item.id),
        },
    )


def _decode_cursor(
    token: str,
    context: AuthorizationContext,
    *,
    query: str,
    kinds: tuple[SearchKind, ...],
) -> tuple[int, datetime, SearchKind, UUID]:
    position = cursor_codec.decode(
        token,
        binding=_cursor_binding(context, query=query, kinds=kinds),
    )
    rank_raw = position.get("rank")
    created_at_raw = position.get("createdAt")
    kind_raw = position.get("type")
    id_raw = position.get("id")
    if isinstance(rank_raw, bool) or not isinstance(rank_raw, int):
        raise cursor_codec.invalid_cursor()
    if not all(isinstance(value, str) for value in (created_at_raw, kind_raw, id_raw)):
        raise cursor_codec.invalid_cursor()
    try:
        created_at = datetime.fromisoformat(str(created_at_raw).replace("Z", "+00:00"))
        kind = SearchKind(str(kind_raw))
        item_id = UUID(str(id_raw))
    except ValueError as error:
        raise cursor_codec.invalid_cursor() from error
    if created_at.tzinfo is None:
        raise cursor_codec.invalid_cursor()
    return rank_raw, created_at.astimezone(UTC), kind, item_id


def _is_after(item: SearchRow, position: tuple[int, datetime, SearchKind, UUID]) -> bool:
    rank_key, created_at, kind, item_id = position
    return (
        item.rank_key < rank_key
        or (item.rank_key == rank_key and item.created_at < created_at)
        or (
            item.rank_key == rank_key
            and item.created_at == created_at
            and item.kind.value > kind.value
        )
        or (
            item.rank_key == rank_key
            and item.created_at == created_at
            and item.kind is kind
            and str(item.id) > str(item_id)
        )
    )


def search(
    session: Session,
    context: AuthorizationContext,
    *,
    query: str,
    kinds: tuple[SearchKind, ...] = (),
    cursor: str | None = None,
    limit: int = DEFAULT_LIMIT,
) -> SearchPageResult:
    """Return one authorized global Search page."""
    normalized_query = normalize_query(query)
    selected = _canonical_kinds(kinds)
    position = (
        _decode_cursor(cursor, context, query=normalized_query, kinds=selected)
        if cursor is not None
        else None
    )

    groups = parse_query(normalized_query)
    matches: list[SearchRow] = []
    if groups:
        for kind in selected:
            for source in _SOURCES[kind]:
                for row, parent_id in _authorized_rows(session, context, source):
                    rank = score(
                        groups,
                        tuple(
                            (getattr(row.payload, name), weight) for name, weight in source.fields
                        ),
                    )
                    if rank is None:
                        continue
                    matches.append(
                        SearchRow(
                            kind=source.kind,
                            id=row.id,
                            parent_id=parent_id,
                            scope=source.scope,
                            title=source.title(row),
                            excerpt=source.excerpt(row),
                            occurred_on=source.occurred_on(row),
                            created_at=row.created_at,
                            rank_key=rank,
                        )
                    )

    matches.sort(key=cmp_to_key(_compare))
    if position is not None:
        matches = [item for item in matches if _is_after(item, position)]
    has_more = len(matches) > limit
    items = matches[:limit]
    next_cursor = None
    if has_more and items:
        next_cursor = _encode_cursor(
            context,
            query=normalized_query,
            kinds=selected,
            item=items[-1],
        )
    return SearchPageResult(items=items, next_cursor=next_cursor)

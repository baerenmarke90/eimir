"""Unit coverage for batch author resolution in shared collections."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from eimir.api.schema import AuthorSummary
from eimir.api.v1.collections import collection_detail, collection_item_detail
from eimir.collections.models import (
    Collection,
    CollectionItem,
    CollectionItemPayload,
    CollectionPayload,
)


def test_collection_item_detail_uses_provided_author() -> None:
    creator_id = uuid4()
    item = CollectionItem(
        id=uuid4(),
        collection_id=uuid4(),
        created_by=creator_id,
        completed=False,
        position=0,
        version=1,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        payload=CollectionItemPayload(title="Test Item"),
    )
    author = AuthorSummary(
        id=creator_id,
        display_name="Pre-resolved Author",
        profile_attachment_id=None,
    )

    detail = collection_item_detail(
        session=None,  # type: ignore[arg-type]
        item=item,
        authors={creator_id: author},
    )

    assert detail.creator.id == creator_id
    assert detail.creator.display_name == "Pre-resolved Author"


def test_collection_detail_reuses_items_and_batch_authors() -> None:
    owner_id = uuid4()
    item_author_id = uuid4()
    collection_id = uuid4()
    space_id = uuid4()
    now = datetime.now(UTC)

    collection = Collection(
        id=collection_id,
        space_id=space_id,
        owner_id=owner_id,
        version=1,
        created_at=now,
        updated_at=now,
        payload=CollectionPayload(title="Shared List"),
    )
    item = CollectionItem(
        id=uuid4(),
        collection_id=collection_id,
        created_by=item_author_id,
        completed=True,
        position=0,
        version=1,
        created_at=now,
        updated_at=now,
        payload=CollectionItemPayload(title="Sub-item"),
    )

    authors = {
        owner_id: AuthorSummary(
            id=owner_id,
            display_name="Owner Person",
            profile_attachment_id=None,
        ),
        item_author_id: AuthorSummary(
            id=item_author_id,
            display_name="Item Contributor",
            profile_attachment_id=None,
        ),
    }

    detail = collection_detail(
        session=None,  # type: ignore[arg-type]
        collection=collection,
        items=[item],
        authors=authors,
    )

    assert detail.creator.display_name == "Owner Person"
    assert len(detail.items) == 1
    assert detail.items[0].creator.display_name == "Item Contributor"
    assert detail.items[0].completed is True

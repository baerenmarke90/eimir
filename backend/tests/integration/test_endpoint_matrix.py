"""Cross-cutting endpoint invariants.

Domain-specific visibility rules live with their domain. This matrix covers
the complementary guarantee that every endpoint enforces tenant isolation.

The distinction is completeness: a gap can exist because an endpoint is
missing from the matrix entirely. `test_contract_is_completely_covered`
therefore compares the table below with the OpenAPI contract. A new operation
without an entry makes the suite fail before it reaches production.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

import pytest
from sqlalchemy.orm import Session

from eimir.dashboard.preferences import CATALOG as DASHBOARD_CATALOG
from eimir.engagement.models import Notification, NotificationKind
from eimir.main import create_app
from eimir.relationship import service as relationship_service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]

SPACE_ABSENCE = "SPACE_NOT_FOUND"


@dataclass(frozen=True)
class Endpoint:
    "An endpoint and the requirements for a request to it."

    method: str
    template: str
    body: dict[str, Any] | None = None
    if_match: bool = False
    resource_absence: str | None = None
    """The code this endpoint uses to deny an unknown resource.

    Only set for endpoints with their own resource ID in the path.
    """

    placeholders: tuple[str, ...] = field(default=())
    fixture_aliases: dict[str, str] = field(default_factory=dict)
    query: dict[str, str] = field(default_factory=dict)

    def __str__(self) -> str:
        return f"{self.method} {self.template}"


PERSON = {
    "displayName": "Lisa",
    "relationship": "CHILD",
    "birthday": None,
    "birthdayYearKnown": False,
    "visibility": "SHARED",
}
IMPORTANT_DATE = {
    "label": "Jahrestag",
    "type": "ANNIVERSARY",
    "date": "2020-06-13",
    "repeats": "ANNUALLY",
    "visibility": "SHARED",
}
PREFERENCE = {
    "category": "DRINK",
    "topic": "lieblingsgetraenk",
    "sentiment": "LOVE",
    "value": "Wasser",
}
PROFILE = {
    "relationshipStartedOn": "2020-06-13",
    "showRelationshipDuration": True,
    "durationDisplayMode": "YEARS_MONTHS",
}
MEMORY = {
    "title": "Matrix Memory",
    "body": "Gemeinsame Erinnerung fuer die Endpoint-Matrix.",
    "happenedOn": "2025-06-13",
}
HEART_MOMENT = {
    "text": "Matrix HeartMoment",
    "emotion": "LOVED",
    "visibility": "SHARED",
    "happenedOn": "2025-06-13",
}
ATTACHMENT = {
    "mediaType": "IMAGE",
    "originalName": "matrix.jpg",
    "expectedMimeType": "image/jpeg",
    "expectedSize": 2048,
}
MILESTONE = {
    "title": "Matrix Milestone",
    "body": "Text",
    "happenedOn": "2025-06-13",
}
COMMENT = {"body": "Matrix Comment"}
WISH = {"title": "Matrix Wish"}
PLAN = {"title": "Matrix Plan", "description": "Text"}
REMINDER = {
    "title": "Matrix Reminder",
    "description": "Text",
    "schedule": {
        "type": "ANNUAL",
        "month": 6,
        "day": 13,
        "localTime": "09:00:00",
    },
    "offsets": [7, 1],
}
RULE_PREFERENCE = {
    "enabled": True,
    "parameters": {"daysBefore": [7, 1], "localTime": "09:00:00"},
}
PLACE = {"name": "Matrix Place", "latitude": 52.520008, "longitude": 13.404954}
CHAPTER = {"title": "Matrix Chapter", "description": "Text"}
COLLECTION = {"title": "Matrix Collection"}
COLLECTION_ITEM = {"title": "Matrix Collection Item"}
STORY_VIEW = {"kind": "MEMORY", "itemId": str(uuid4())}
PRIVATE_NOTE = {"title": "Matrix Private Note", "body": "Private body"}
GIFT_IDEA = {"title": "Matrix Gift Idea"}
PRIVATE_COLLECTION = {"title": "Matrix Private Collection"}
PRIVATE_COLLECTION_ITEM = {"title": "Matrix Private Collection Item"}
PRIVATE_COLLECTION_FIXTURES = {
    "collectionId": "privateCollectionId",
    "itemId": "privateCollectionItemId",
}

SPACE_ENDPOINTS: tuple[Endpoint, ...] = (
    Endpoint("GET", "/api/v1/spaces/{spaceId}"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/presence"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/presence"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/membership/leave"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/entitlements"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/configuration"),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/configuration",
        body={"loveNotesEnabled": True},
        if_match=True,
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/daily-check-in/today"),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/daily-check-in/today",
        body={"energyLevel": 50},
        if_match=True,
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/daily-check-in/insights"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/daily-quote"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/daily-quote/catalog"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/daily-quote/preferences"),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/daily-quote/preferences",
        body={"enabled": True},
        if_match=True,
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/games/moments/candidates"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/games/wishes/candidates"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/profile"),
    Endpoint("PUT", "/api/v1/spaces/{spaceId}/profile", body=PROFILE, if_match=True),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/invitations"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/invitations", body={}),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/invitations/{invitationId}",
        resource_absence="INVITATION_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/profiles/{accountId}",
        resource_absence="PARTNER_PROFILE_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/profiles/{accountId}",
        body={"displayName": "Matrix Name"},
        if_match=True,
        resource_absence="PARTNER_PROFILE_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/profiles/{accountId}/avatar/content",
        resource_absence="PARTNER_PROFILE_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/profile-preferences"),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/profile-preferences",
        body={**PREFERENCE, "accountId": str(uuid4()), "visibility": "SELF_PROFILE"},
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/profile-preferences/{preferenceId}",
        resource_absence="PROFILE_PREFERENCE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/profile-preferences/{preferenceId}",
        body=PREFERENCE,
        if_match=True,
        resource_absence="PROFILE_PREFERENCE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/profile-preferences/{preferenceId}",
        if_match=True,
        resource_absence="PROFILE_PREFERENCE_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/related-persons"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/related-persons", body=PERSON),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/related-persons/{personId}",
        resource_absence="RELATED_PERSON_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/related-persons/{personId}",
        body=PERSON,
        if_match=True,
        resource_absence="RELATED_PERSON_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/related-persons/{personId}",
        if_match=True,
        resource_absence="RELATED_PERSON_NOT_FOUND",
        query={"deletePolicy": "preserve"},
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/important-dates"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/important-dates", body=IMPORTANT_DATE),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/important-dates/{dateId}",
        resource_absence="IMPORTANT_DATE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/important-dates/{dateId}",
        body=IMPORTANT_DATE,
        if_match=True,
        resource_absence="IMPORTANT_DATE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/important-dates/{dateId}",
        if_match=True,
        resource_absence="IMPORTANT_DATE_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/memories"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/memories", body=MEMORY),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/memories/{memoryId}",
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/memories/{memoryId}",
        body={"title": "Matrix Memory aktualisiert"},
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/memories/{memoryId}",
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/memories/{memoryId}/attachments",
        body={"attachments": []},
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/heart-moments"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/heart-moments", body=HEART_MOMENT),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}",
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}",
        body={"text": "Matrix HeartMoment aktualisiert"},
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/visibility",
        body={"visibility": "PRIVATE"},
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}",
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/timeline"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/discover"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/story-views", body=STORY_VIEW),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/search",
        query={"q": "Matrix"},
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/dashboard"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/dashboard/preferences"),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/dashboard/preferences/order",
        body={"moduleKeys": [definition.key.value for definition in DASHBOARD_CATALOG]},
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/dashboard/preferences/{moduleKey}",
        body={"itemLimit": 2},
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/activity"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/notifications"),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/notifications/unread-count"),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/notifications/{notificationId}/read",
        resource_absence="NOTIFICATION_NOT_FOUND",
    ),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/notifications/read-all"),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/thinking-of-you",
        body={"clientRequestId": str(uuid4())},
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/partner-quick-actions",
        body={"kind": "KISS", "clientRequestId": str(uuid4())},
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/reminders"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/reminders", body=REMINDER),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/reminders/{reminderId}",
        resource_absence="REMINDER_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/reminders/{reminderId}",
        body=REMINDER,
        if_match=True,
        resource_absence="REMINDER_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/reminders/{reminderId}",
        if_match=True,
        resource_absence="REMINDER_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/reminders/{reminderId}/preference",
        body={"muted": True},
        resource_absence="REMINDER_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/rules"),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/rules/{ruleKey}/preference",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/rules/{ruleKey}/preference",
        body=RULE_PREFERENCE,
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/milestones"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/milestones", body=MILESTONE),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}",
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}",
        body={"title": "Matrix Milestone aktualisiert"},
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}",
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/memories/{memoryId}/comments",
        body=COMMENT,
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/memories/{memoryId}/comments",
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/comments",
        body=COMMENT,
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/heart-moments/{heartMomentId}/comments",
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}/comments",
        body=COMMENT,
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/milestones/{milestoneId}/comments",
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/comments/{commentId}",
        body=COMMENT,
        if_match=True,
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/comments/{commentId}",
        if_match=True,
        resource_absence="COMMENT_TARGET_NOT_AVAILABLE",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/wishes"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/wishes", body=WISH),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/wishes/{wishId}",
        resource_absence="WISH_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/wishes/{wishId}",
        body={"title": "Matrix Wish aktualisiert"},
        if_match=True,
        resource_absence="WISH_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/wishes/{wishId}",
        if_match=True,
        resource_absence="WISH_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/wishes/{wishId}/complete",
        if_match=True,
        resource_absence="WISH_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/wishes/{wishId}/plan",
        body={},
        if_match=True,
        resource_absence="WISH_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/places"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/places", body=PLACE),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/places/{placeId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/places/{placeId}",
        body={"name": "Matrix Place aktualisiert"},
        if_match=True,
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/places/{placeId}",
        if_match=True,
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/places/{placeId}/memories",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/places/{placeId}/memories/{targetId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/places/{placeId}/memories/{targetId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/places/{placeId}/heart-moments",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/places/{placeId}/heart-moments/{targetId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/places/{placeId}/heart-moments/{targetId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/places/{placeId}/milestones",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/places/{placeId}/milestones/{targetId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/places/{placeId}/milestones/{targetId}",
        resource_absence="PLACE_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/chapters"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/chapters", body=CHAPTER),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}",
        body={"title": "Matrix Chapter updated"},
        if_match=True,
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}",
        if_match=True,
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/content",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/memories",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{targetId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/memories/{targetId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments/{targetId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/heart-moments/{targetId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones/{targetId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/chapters/{chapterId}/milestones/{targetId}",
        resource_absence="CHAPTER_NOT_FOUND",
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/collections"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/collections", body=COLLECTION),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}",
        resource_absence="COLLECTION_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}",
        body={"title": "Matrix Collection updated"},
        if_match=True,
        resource_absence="COLLECTION_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}",
        if_match=True,
        resource_absence="COLLECTION_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}/items",
        body=COLLECTION_ITEM,
        resource_absence="COLLECTION_NOT_FOUND",
        placeholders=("collectionId",),
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}/items/{itemId}",
        body={"completed": True},
        if_match=True,
        resource_absence="COLLECTION_ITEM_NOT_FOUND",
        placeholders=("itemId",),
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}/items/{itemId}",
        if_match=True,
        resource_absence="COLLECTION_ITEM_NOT_FOUND",
        placeholders=("itemId",),
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/collections/{collectionId}/order",
        body={"itemIds": []},
        if_match=True,
        resource_absence="COLLECTION_NOT_FOUND",
        placeholders=("collectionId",),
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/private/collections"),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/private/collections",
        body=PRIVATE_COLLECTION,
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}",
        resource_absence="PRIVATE_COLLECTION_NOT_FOUND",
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}",
        body={"title": "Matrix Private Collection updated"},
        if_match=True,
        resource_absence="PRIVATE_COLLECTION_NOT_FOUND",
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}",
        if_match=True,
        resource_absence="PRIVATE_COLLECTION_NOT_FOUND",
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}/items",
        body=PRIVATE_COLLECTION_ITEM,
        resource_absence="PRIVATE_COLLECTION_NOT_FOUND",
        placeholders=("collectionId",),
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId}",
        resource_absence="PRIVATE_COLLECTION_ITEM_NOT_FOUND",
        placeholders=("itemId",),
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId}",
        body={"completed": True},
        if_match=True,
        resource_absence="PRIVATE_COLLECTION_ITEM_NOT_FOUND",
        placeholders=("itemId",),
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}/items/{itemId}",
        if_match=True,
        resource_absence="PRIVATE_COLLECTION_ITEM_NOT_FOUND",
        placeholders=("itemId",),
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/private/collections/{collectionId}/order",
        body={"itemIds": []},
        if_match=True,
        resource_absence="PRIVATE_COLLECTION_NOT_FOUND",
        placeholders=("collectionId",),
        fixture_aliases=PRIVATE_COLLECTION_FIXTURES,
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/private/notes"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/private/notes", body=PRIVATE_NOTE),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/private/notes/{noteId}",
        resource_absence="PRIVATE_NOTE_NOT_FOUND",
        placeholders=("noteId",),
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/private/notes/{noteId}",
        body={"pinned": True},
        if_match=True,
        resource_absence="PRIVATE_NOTE_NOT_FOUND",
        placeholders=("noteId",),
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/private/notes/{noteId}",
        if_match=True,
        resource_absence="PRIVATE_NOTE_NOT_FOUND",
        placeholders=("noteId",),
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/private/gift-ideas"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/private/gift-ideas", body=GIFT_IDEA),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}",
        resource_absence="GIFT_IDEA_NOT_FOUND",
        placeholders=("giftIdeaId",),
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}",
        body={"pinned": True},
        if_match=True,
        resource_absence="GIFT_IDEA_NOT_FOUND",
        placeholders=("giftIdeaId",),
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/private/gift-ideas/{giftIdeaId}",
        if_match=True,
        resource_absence="GIFT_IDEA_NOT_FOUND",
        placeholders=("giftIdeaId",),
    ),
    Endpoint("GET", "/api/v1/spaces/{spaceId}/plans"),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/plans", body=PLAN),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/plans/{planId}",
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "PATCH",
        "/api/v1/spaces/{spaceId}/plans/{planId}",
        body={"title": "Matrix Plan aktualisiert"},
        if_match=True,
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/plans/{planId}",
        if_match=True,
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/plans/{planId}/schedule",
        body={"plannedStart": "2026-09-01T18:00:00Z"},
        if_match=True,
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/plans/{planId}/unschedule",
        body={},
        if_match=True,
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/plans/{planId}/complete",
        body={"experiencedOn": "2026-08-20"},
        if_match=True,
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/plans/{planId}/return-to-wish",
        body={},
        if_match=True,
        resource_absence="PLAN_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/transfer/exports",
        body={"scope": "SHARED"},
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/transfer/exports/{exportId}",
        resource_absence="TRANSFER_NOT_FOUND",
        placeholders=("exportId",),
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/transfer/exports/{exportId}/download",
        resource_absence="TRANSFER_NOT_FOUND",
        placeholders=("exportId",),
    ),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/transfer/imports"),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/transfer/imports/{importId}",
        resource_absence="TRANSFER_NOT_FOUND",
        placeholders=("importId",),
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/transfer/imports/{importId}/apply",
        resource_absence="TRANSFER_NOT_FOUND",
        placeholders=("importId",),
    ),
    Endpoint("POST", "/api/v1/spaces/{spaceId}/attachments", body=ATTACHMENT),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/attachments/{attachmentId}",
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "PUT",
        "/api/v1/spaces/{spaceId}/attachments/{attachmentId}/content",
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "GET",
        "/api/v1/spaces/{spaceId}/attachments/{attachmentId}/content",
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/attachments/{attachmentId}/finalize",
        body={},
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "POST",
        "/api/v1/spaces/{spaceId}/attachments/{attachmentId}/read-access",
        body={"parentType": "NONE"},
        resource_absence="RESOURCE_NOT_FOUND",
    ),
    Endpoint(
        "DELETE",
        "/api/v1/spaces/{spaceId}/attachments/{attachmentId}",
        if_match=True,
        resource_absence="RESOURCE_NOT_FOUND",
    ),
)

AUTHENTICATED_ONLY: tuple[tuple[str, str], ...] = (
    ("GET", "/api/v1/auth/me"),
    ("GET", "/api/v1/auth/capabilities"),
    ("GET", "/api/v1/auth/memberships"),
    ("GET", "/api/v1/auth/recent-authentication/account-deletion"),
    ("POST", "/api/v1/auth/recent-authentication/account-deletion/password"),
    ("POST", "/api/v1/auth/recent-authentication/account-deletion/passkeys/start"),
    ("POST", "/api/v1/auth/recent-authentication/account-deletion/passkeys/finish"),
    ("POST", "/api/v1/auth/recent-authentication/account-deletion/oidc/{connectionId}/start"),
    ("POST", "/api/v1/auth/recent-authentication/account-deletion/oidc/{connectionId}/callback"),
    ("POST", "/api/v1/account/deletion"),
    ("GET", "/api/v1/notification-preferences"),
    ("PATCH", "/api/v1/notification-preferences/quiet-hours"),
    ("PATCH", "/api/v1/notification-preferences/{kind}/{channel}"),
    ("GET", "/api/v1/push-endpoints/unifiedpush-configuration"),
    ("POST", "/api/v1/push-endpoints"),
    ("DELETE", "/api/v1/push-endpoints/{endpointId}"),
    ("POST", "/api/v1/auth/sign-out"),
    ("POST", "/api/v1/auth/password"),
    ("POST", "/api/v1/auth/email/verification/request"),
    # Linking requires an existing signed-in account, which distinguishes it
    # from sign-in through the same provider.
    ("POST", "/api/v1/auth/oidc/{connectionId}/link"),
    # A passkey is an additional access method for an existing account and is
    # registered from an authenticated session.
    ("POST", "/api/v1/auth/passkeys/registration/start"),
    ("POST", "/api/v1/auth/passkeys/registration/finish"),
    # Founding a Space has no Space yet to be scoped by; the founder is always
    # the authenticated Account.
    ("POST", "/api/v1/spaces"),
)
"""Account-scoped but not space-scoped. Anonymous requests receive 401."""

SERVER_ADMIN_ONLY: tuple[tuple[str, str], ...] = (
    ("GET", "/api/v1/auth/recent-authentication/server-admin"),
    ("GET", "/api/v1/auth/recent-authentication/server-admin/capabilities"),
    ("POST", "/api/v1/auth/recent-authentication/server-admin/password"),
    ("POST", "/api/v1/auth/recent-authentication/server-admin/passkeys/start"),
    ("POST", "/api/v1/auth/recent-authentication/server-admin/passkeys/finish"),
    ("POST", "/api/v1/auth/recent-authentication/server-admin/oidc/{connectionId}/start"),
    ("POST", "/api/v1/auth/recent-authentication/server-admin/oidc/{connectionId}/callback"),
    ("GET", "/api/v1/server-admin/overview"),
    ("GET", "/api/v1/server-admin/spaces"),
    ("GET", "/api/v1/server-admin/spaces/{space_id}"),
    ("POST", "/api/v1/server-admin/spaces/{space_id}/configuration-manager/reconcile"),
    ("GET", "/api/v1/server-admin/spaces/{space_id}/entitlement"),
    ("POST", "/api/v1/server-admin/spaces/{space_id}/entitlement/grants"),
    ("POST", "/api/v1/server-admin/spaces/{space_id}/entitlement/grants/{grant_id}/revoke"),
    ("GET", "/api/v1/server-admin/settings"),
    ("PUT", "/api/v1/server-admin/settings/registration"),
    ("PUT", "/api/v1/server-admin/settings/maintenance"),
    ("GET", "/api/v1/server-admin/activity"),
    ("GET", "/api/v1/server-admin/activity/actions"),
    ("GET", "/api/v1/server-admin/activity/privileged"),
    ("GET", "/api/v1/server-admin/jobs"),
    ("GET", "/api/v1/server-admin/storage"),
    ("GET", "/api/v1/server-admin/accounts"),
    ("GET", "/api/v1/server-admin/accounts/{accountId}"),
    ("PUT", "/api/v1/server-admin/accounts/{accountId}/suspension"),
    ("POST", "/api/v1/server-admin/accounts/{accountId}/sessions/revoke"),
    ("POST", "/api/v1/server-admin/accounts/{accountId}/email-verification/request"),
    ("POST", "/api/v1/server-admin/accounts/{accountId}/recovery/email"),
    ("POST", "/api/v1/server-admin/accounts/{accountId}/recovery/operator"),
    ("POST", "/api/v1/server-admin/accounts/{accountId}/emails/{accountEmailId}/verify"),
    ("POST", "/api/v1/server-admin/accounts/{accountId}/deletion"),
)
"""Instance-scoped operations that require authenticated ServerAdmin authority."""

PUBLIC_ENDPOINTS: tuple[tuple[str, str], ...] = (
    ("GET", "/api/v1/health"),
    ("GET", "/api/v1/health/ready"),
    ("GET", "/api/v1/instance/status"),
    ("POST", "/api/v1/auth/register"),
    ("POST", "/api/v1/auth/sign-in"),
    ("POST", "/api/v1/auth/refresh"),
    ("POST", "/api/v1/invitations/accept"),
    # These paths lead back into an account. They start without a session and
    # use the single-use token delivered by mail as their proof.
    ("POST", "/api/v1/auth/magic-link/request"),
    ("POST", "/api/v1/auth/magic-link/consume"),
    ("POST", "/api/v1/auth/signup/request"),
    ("POST", "/api/v1/auth/signup/consume"),
    ("POST", "/api/v1/auth/email/verification/confirm"),
    ("POST", "/api/v1/auth/recovery/request"),
    ("POST", "/api/v1/auth/recovery/consume"),
    ("POST", "/api/v1/auth/oidc/{connectionId}/start"),
    ("POST", "/api/v1/auth/oidc/{connectionId}/callback"),
    ("POST", "/api/v1/auth/passkeys/authentication/start"),
    ("POST", "/api/v1/auth/passkeys/authentication/finish"),
)
"""Intentionally reachable without a bearer token because they lead to a token.

Their abuse protection is provided by rate limits and single-use tokens, as
covered in `test_auth_flows` and `test_invitations`.
"""


@pytest.fixture
def scenario(client, session: Session):  # type: ignore[no-untyped-def]
    "A couple with one real resource per domain, plus a foreign one."
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    foreign = make_account(session, "Fremde Person")

    space = make_space(session, anna)
    make_space(session, foreign)
    session.flush()

    token_a = sign_in(session, anna)
    headers = auth(token_a)
    base_path = f"/api/v1/spaces/{space.id}"

    # Create the invitation while the couple still has a free member slot. A
    # full couple space issues no new invitation, so Ben joins afterwards.
    invitation = client.post(f"{base_path}/invitations", json={}, headers=headers).json()

    relationship_service.add_member(session, space.id, ben)
    session.flush()
    preference = client.post(
        f"{base_path}/profile-preferences",
        json={**PREFERENCE, "accountId": str(anna.id), "visibility": "SELF_PROFILE"},
        headers=headers,
    ).json()
    person = client.post(f"{base_path}/related-persons", json=PERSON, headers=headers).json()
    important_date = client.post(
        f"{base_path}/important-dates", json=IMPORTANT_DATE, headers=headers
    ).json()
    memory = client.post(f"{base_path}/memories", json=MEMORY, headers=headers).json()
    notification = Notification(
        space_id=space.id,
        recipient_account_id=anna.id,
        source_event_id=uuid4(),
        kind=NotificationKind.COMMENT_CREATED.value,
        actor_id=ben.id,
        target_type="MEMORY",
        target_id=UUID(memory["id"]),
    )
    session.add(notification)
    session.flush()
    heart_moment = client.post(
        f"{base_path}/heart-moments", json=HEART_MOMENT, headers=headers
    ).json()
    milestone = client.post(f"{base_path}/milestones", json=MILESTONE, headers=headers).json()
    comment = client.post(
        f"{base_path}/memories/{memory['id']}/comments", json=COMMENT, headers=headers
    ).json()
    wish = client.post(f"{base_path}/wishes", json=WISH, headers=headers).json()
    place = client.post(f"{base_path}/places", json=PLACE, headers=headers).json()
    plan = client.post(f"{base_path}/plans", json=PLAN, headers=headers).json()
    reminder = client.post(f"{base_path}/reminders", json=REMINDER, headers=headers).json()
    chapter = client.post(f"{base_path}/chapters", json=CHAPTER, headers=headers).json()
    collection = client.post(f"{base_path}/collections", json=COLLECTION, headers=headers).json()
    collection_item = client.post(
        f"{base_path}/collections/{collection['id']}/items",
        json=COLLECTION_ITEM,
        headers=headers,
    ).json()
    private_collection = client.post(
        f"{base_path}/private/collections",
        json=PRIVATE_COLLECTION,
        headers=headers,
    ).json()
    private_collection_item = client.post(
        f"{base_path}/private/collections/{private_collection['id']}/items",
        json=PRIVATE_COLLECTION_ITEM,
        headers=headers,
    ).json()
    private_note = client.post(
        f"{base_path}/private/notes", json=PRIVATE_NOTE, headers=headers
    ).json()
    gift_idea = client.post(
        f"{base_path}/private/gift-ideas", json=GIFT_IDEA, headers=headers
    ).json()
    attachment = client.post(f"{base_path}/attachments", json=ATTACHMENT, headers=headers).json()

    return {
        "client": client,
        "space": space,
        "owner_headers": headers,
        "foreign_headers": auth(sign_in(session, foreign)),
        "ids": {
            "spaceId": str(space.id),
            "accountId": str(ben.id),
            "invitationId": invitation["id"],
            "preferenceId": preference["id"],
            "personId": person["id"],
            "dateId": important_date["id"],
            "memoryId": memory["id"],
            "notificationId": str(notification.id),
            "heartMomentId": heart_moment["id"],
            "milestoneId": milestone["id"],
            "commentId": comment["id"],
            "wishId": wish["id"],
            "planId": plan["id"],
            "reminderId": reminder["id"],
            "ruleKey": "important_date_reminder",
            "moduleKey": "upcoming",
            "placeId": place["id"],
            "chapterId": chapter["id"],
            "collectionId": collection["id"],
            "itemId": collection_item["id"],
            "privateCollectionId": private_collection["id"],
            "privateCollectionItemId": private_collection_item["id"],
            "noteId": private_note["id"],
            "giftIdeaId": gift_idea["id"],
            "exportId": str(uuid4()),
            "importId": str(uuid4()),
            # The target is a typed relation. A memory is enough for all three
            # relation types because this matrix checks occur before target resolution.
            "targetId": memory["id"],
            "attachmentId": attachment["attachment"]["id"],
        },
    }


def _path(endpoint: Endpoint, ids: dict[str, str], **replacements: str) -> str:
    values = dict(ids)
    for placeholder, fixture_id in endpoint.fixture_aliases.items():
        values[placeholder] = ids[fixture_id]
    values.update(replacements)
    return endpoint.template.format(**values)


def _send(scenario, endpoint: Endpoint, path: str, headers: dict[str, str] | None):  # type: ignore[no-untyped-def]
    headers = dict(headers or {})
    if endpoint.if_match:
        # Conflict protection is mandatory. Supplying the header ensures these
        # tests exercise tenant/resource isolation rather than header absence.
        headers["If-Match"] = '"1"'

    request_kwargs: dict[str, Any] = {}
    if endpoint.body is not None:
        request_kwargs["json"] = endpoint.body
    if endpoint.query:
        request_kwargs["params"] = endpoint.query
    return scenario["client"].request(endpoint.method, path, headers=headers, **request_kwargs)


@pytest.mark.parametrize("endpoint", SPACE_ENDPOINTS, ids=str)
class TestEverySpaceEndpoint:
    "Four tenant-isolation questions for every endpoint scoped to a space."

    def test_anonymous_remains_401(self, scenario, endpoint: Endpoint) -> None:  # type: ignore[no-untyped-def]
        response = _send(scenario, endpoint, _path(endpoint, scenario["ids"]), None)
        assert response.status_code == 401
        assert response.json()["code"] == "AUTHENTICATION_REQUIRED"

    def test_foreign_actor_gets_404_not_403(self, scenario, endpoint: Endpoint) -> None:  # type: ignore[no-untyped-def]
        "A 403 would confirm that the space exists."
        response = _send(
            scenario,
            endpoint,
            _path(endpoint, scenario["ids"]),
            scenario["foreign_headers"],
        )
        assert response.status_code == 404
        assert response.json()["code"] == SPACE_ABSENCE

    def test_foreign_space_and_invented_space_are_indistinguishable(
        self, scenario, endpoint: Endpoint
    ) -> None:  # type: ignore[no-untyped-def]
        real = _send(
            scenario, endpoint, _path(endpoint, scenario["ids"]), scenario["foreign_headers"]
        )
        invented = _send(
            scenario,
            endpoint,
            _path(endpoint, scenario["ids"], spaceId=str(uuid4())),
            scenario["foreign_headers"],
        )
        assert real.status_code == invented.status_code == 404
        assert real.json() == invented.json()

    def test_malformed_space_id_remains_same_404(self, scenario, endpoint: Endpoint) -> None:  # type: ignore[no-untyped-def]
        response = _send(
            scenario,
            endpoint,
            _path(endpoint, scenario["ids"], spaceId="' OR 1=1 --"),
            scenario["owner_headers"],
        )
        assert response.status_code == 404
        assert response.json()["code"] == SPACE_ABSENCE


DETAIL_ENDPOINTS = tuple(
    endpoint for endpoint in SPACE_ENDPOINTS if endpoint.resource_absence is not None
)


@pytest.mark.parametrize("endpoint", DETAIL_ENDPOINTS, ids=str)
class TestEveryResourceId:
    "Within the actor's own space, the resource ID decides and reveals nothing."

    def test_unknown_resource_remains_404(self, scenario, endpoint: Endpoint) -> None:  # type: ignore[no-untyped-def]
        path = _path(
            endpoint,
            scenario["ids"],
            **dict.fromkeys(_resource_placeholders(endpoint), str(uuid4())),
        )
        response = _send(scenario, endpoint, path, scenario["owner_headers"])
        assert response.status_code == 404
        assert response.json()["code"] == endpoint.resource_absence

    def test_malformed_resource_id_remains_same_404(self, scenario, endpoint: Endpoint) -> None:  # type: ignore[no-untyped-def]
        "Well-formedness must not disclose existence."
        unknown = _path(
            endpoint,
            scenario["ids"],
            **dict.fromkeys(_resource_placeholders(endpoint), str(uuid4())),
        )
        malformed = _path(
            endpoint,
            scenario["ids"],
            **dict.fromkeys(_resource_placeholders(endpoint), "nicht-echt"),
        )
        first = _send(scenario, endpoint, unknown, scenario["owner_headers"])
        second = _send(scenario, endpoint, malformed, scenario["owner_headers"])
        assert first.status_code == second.status_code == 404
        assert first.json() == second.json()


def _resource_placeholders(endpoint: Endpoint) -> tuple[str, ...]:
    if endpoint.placeholders:
        return endpoint.placeholders
    return tuple(
        name
        for name in (
            "invitationId",
            "preferenceId",
            "personId",
            "dateId",
            "accountId",
            "memoryId",
            "notificationId",
            "heartMomentId",
            "attachmentId",
            "milestoneId",
            "commentId",
            "wishId",
            "planId",
            "reminderId",
            "placeId",
            "chapterId",
            "collectionId",
            "itemId",
            "targetId",
        )
        if "{" + name + "}" in endpoint.template
    )


WRITING_ENDPOINTS = tuple(endpoint for endpoint in SPACE_ENDPOINTS if endpoint.if_match)


@pytest.mark.parametrize("endpoint", WRITING_ENDPOINTS, ids=str)
def test_without_if_match_does_not_write(scenario, endpoint: Endpoint) -> None:  # type: ignore[no-untyped-def]
    "A missing header is the silent path to disabling conflict protection."
    path = _path(endpoint, scenario["ids"])
    request_kwargs: dict[str, Any] = {"json": endpoint.body} if endpoint.body is not None else {}
    if endpoint.query:
        request_kwargs["params"] = endpoint.query
    response = scenario["client"].request(
        endpoint.method, path, headers=scenario["owner_headers"], **request_kwargs
    )
    assert response.status_code == 422

    # Verify that a DELETE without the required header did not remove the resource.
    if endpoint.method == "DELETE":
        if "{commentId}" in endpoint.template:
            afterwards = scenario["client"].patch(
                path,
                json=COMMENT,
                headers={**scenario["owner_headers"], "If-Match": '"1"'},
            )
            assert afterwards.status_code == 200
        elif "{itemId}" in endpoint.template:
            afterwards = scenario["client"].patch(
                path,
                json={"completed": True},
                headers={**scenario["owner_headers"], "If-Match": '"1"'},
            )
            assert afterwards.status_code == 200
        else:
            afterwards = scenario["client"].get(path, headers=scenario["owner_headers"])
            assert afterwards.status_code == 200


def test_contract_is_completely_covered() -> None:
    """A new operation without an entry in this file makes the suite fail.

    This is the matrix's primary purpose. A rule that developers must remember
    to copy to every new endpoint will eventually be forgotten; a missing tenant
    guard can otherwise remain invisible until production.
    """
    schema = create_app().openapi()
    contract = {
        (method.upper(), path)
        for path, operations in schema["paths"].items()
        for method in operations
    }
    covered = (
        {(endpoint.method, endpoint.template) for endpoint in SPACE_ENDPOINTS}
        | set(AUTHENTICATED_ONLY)
        | set(SERVER_ADMIN_ONLY)
        | set(PUBLIC_ENDPOINTS)
    )
    assert contract == covered


@pytest.mark.parametrize(("method", "path"), AUTHENTICATED_ONLY, ids=str)
def test_account_scoped_endpoints_remain_closed_to_anonymous(
    scenario, method: str, path: str
) -> None:  # type: ignore[no-untyped-def]
    response = scenario["client"].request(method, path, json={})
    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


@pytest.mark.parametrize(("method", "path"), SERVER_ADMIN_ONLY, ids=str)
def test_server_admin_endpoints_remain_closed_to_anonymous(
    scenario, method: str, path: str
) -> None:  # type: ignore[no-untyped-def]
    response = scenario["client"].request(method, path, json={})
    assert response.status_code == 401
    assert response.json()["code"] == "AUTHENTICATION_REQUIRED"


def test_public_endpoints_require_no_token(scenario) -> None:  # type: ignore[no-untyped-def]
    "The countercheck: these endpoints lead to a token and remain public."
    for path in (
        "/api/v1/health",
        "/api/v1/health/ready",
        "/api/v1/instance/status",
    ):
        assert scenario["client"].get(path).status_code == 200

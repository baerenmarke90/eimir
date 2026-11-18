"""API serialization boundary.

Externally the API uses camelCase; internally Python uses snake_case. The
conversion is centralized here instead of renaming domain identifiers, so the
domain model does not carry a presentation decision.
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

if TYPE_CHECKING:
    from eimir.authorization import PrivateResourceMixin

from pydantic import BaseModel, ConfigDict, Field
from pydantic.json_schema import SkipJsonSchema


def to_camel(value: str) -> str:
    head, *rest = value.split("_")
    return head + "".join(part.capitalize() for part in rest)


class ApiModel(BaseModel):
    """Base model for values entering or leaving the API boundary."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


class AuthorSummary(ApiModel):
    id: UUID
    display_name: str
    is_former_member: bool = False
    profile_attachment_id: UUID | SkipJsonSchema[None] = Field(
        default=None,
        exclude_if=lambda value: value is None,
    )


class ResourceCapabilities(ApiModel):
    can_edit: bool
    can_delete: bool
    can_comment: bool


def story_resource_capabilities(
    resource: PrivateResourceMixin, account_id: UUID, *, can_comment: bool = True
) -> ResourceCapabilities:
    """Project authorized Story rights; endpoint guards remain authoritative."""
    from eimir.authorization import PrivacyClass

    author = resource.owner_id == account_id
    authored_experience = getattr(resource, "experience_kind", None) is not None
    return ResourceCapabilities(
        can_edit=author
        or (
            resource.shared_edit
            and not authored_experience
            and resource.privacy_class == PrivacyClass.SPACE_SHARED.value
        ),
        can_delete=author,
        can_comment=can_comment,
    )

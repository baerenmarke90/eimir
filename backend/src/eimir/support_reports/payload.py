"""Strict allow-list payloads of a support report and its reply (#2189).

Every model forbids unknown fields, so a future client cannot store tokens,
URLs with ids, file names, content or device identifiers by accident. Length
limits count characters (code points), not bytes.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from eimir.domain.payload import ProtectedPayload

NOTE_MAX_CHARACTERS = 2000
REPLY_MAX_CHARACTERS = 500


class FailureReference(BaseModel):
    """The generalized tester reference of a failure, never a raw URL."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    reference: str = Field(max_length=200)
    """Method class, route template without ids, outcome, problem code and surface."""
    request_id: str | None = Field(default=None, max_length=128)
    """The ``x-request-id`` of the failing response."""


class ClientContext(BaseModel):
    """App and device context that helps reproduce a report."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    app_version: str = Field(max_length=32)
    build: str = Field(max_length=32)
    platform: Literal["app", "web"]
    os: str = Field(max_length=64)
    engine: str = Field(max_length=64)
    locale: str = Field(max_length=35)
    theme: str = Field(max_length=16)
    online: bool
    local_time: str = Field(max_length=40)
    time_zone: str = Field(max_length=64)


class SupportReportPayload(ProtectedPayload):
    """Protected content of one support report."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    note: str | None = Field(default=None, max_length=NOTE_MAX_CHARACTERS)
    failure: FailureReference | None = None
    client: ClientContext


class SupportReportReply(ProtectedPayload):
    """Protected operator reply; shown to the reporter as plain text only."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    text: str = Field(max_length=REPLY_MAX_CHARACTERS)
    replied_at: datetime

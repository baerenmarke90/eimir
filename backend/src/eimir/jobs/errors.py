"""Controlled background-job outcomes that may safely retain state."""

from __future__ import annotations

from datetime import datetime, timedelta


class RetryableJobError(Exception):
    """Request queue backoff without rolling back safe handler metadata."""

    def __init__(
        self,
        code: str,
        *,
        retry_not_before: datetime | None = None,
        retry_base: timedelta | None = None,
    ) -> None:
        super().__init__(code)
        self.code = code
        self.retry_not_before = retry_not_before
        self.retry_base = retry_base


class DeferredJobError(Exception):
    """Reschedule the same job without spending a provider retry attempt."""

    def __init__(self, until: datetime) -> None:
        super().__init__("DEFERRED")
        self.until = until

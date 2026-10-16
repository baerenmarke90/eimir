"""Controlled background-job outcomes that may safely retain state."""

from __future__ import annotations

from datetime import datetime


class RetryableJobError(Exception):
    """Request queue backoff without rolling back safe handler metadata."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code


class DeferredJobError(Exception):
    """Reschedule the same job without spending a provider retry attempt."""

    def __init__(self, until: datetime) -> None:
        super().__init__("DEFERRED")
        self.until = until

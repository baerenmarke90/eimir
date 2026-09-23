"""Domain errors and their path to HTTP responses.

Every error that terminates a request carries a stable code. The code is part
of the API contract: clients may branch on it while the human-readable text
may change and be localized.

The HTTP mapping lives here rather than in routes so the same condition always
produces the same response.
"""

from __future__ import annotations

from http import HTTPStatus


class DomainError(Exception):
    """Base class for domain errors.

    `type` is a machine-readable short name for the error class; `code` is the
    precise cause. Both appear in the response.
    """

    status: int = HTTPStatus.INTERNAL_SERVER_ERROR
    type: str = "internal_error"
    title: str = "Internal error"

    def __init__(
        self,
        detail: str,
        code: str,
        *,
        retry_after_seconds: int | None = None,
    ) -> None:
        super().__init__(detail)
        self.detail = detail
        self.code = code
        # Optional, standard-HTTP-header-only signal (RFC 9110 Retry-After):
        # never part of the ProblemDetails JSON body, so the response shape
        # stays the single uniform format documented in api/errors.py.
        self.retry_after_seconds = retry_after_seconds


class BadRequestError(DomainError):
    status = HTTPStatus.BAD_REQUEST
    type = "bad_request"
    title = "Bad request"


class ValidationError(DomainError):
    status = HTTPStatus.UNPROCESSABLE_ENTITY
    type = "validation_error"
    title = "Invalid request"


class UnauthenticatedError(DomainError):
    status = HTTPStatus.UNAUTHORIZED
    type = "unauthenticated"
    title = "Authentication required"


class ForbiddenError(DomainError):
    status = HTTPStatus.FORBIDDEN
    type = "forbidden"
    title = "Not allowed"


class NotFoundError(DomainError):
    """Not found, or deliberately not visible.

    For privacy-sensitive resources this error is intentionally also used in
    cases where a 403 would otherwise be semantically appropriate. A 403 would
    confirm existence; callers probing foreign IDs must not learn which ones
    exist. See docs/SECURITY.md.
    """

    status = HTTPStatus.NOT_FOUND
    type = "not_found"
    title = "Not found"


class ConflictError(DomainError):
    """The state changed since it was read.

    Returned for a failed version check under optimistic concurrency.
    """

    status = HTTPStatus.CONFLICT
    type = "conflict"
    title = "Conflict"


class UnsupportedMediaTypeError(DomainError):
    status = HTTPStatus.UNSUPPORTED_MEDIA_TYPE
    type = "unsupported_media_type"
    title = "Unsupported media type"


class PayloadTooLargeError(DomainError):
    status = HTTPStatus.REQUEST_ENTITY_TOO_LARGE
    type = "payload_too_large"
    title = "Payload too large"


class RateLimitedError(DomainError):
    status = HTTPStatus.TOO_MANY_REQUESTS
    type = "rate_limited"
    title = "Too many requests"


class ServiceUnavailableError(DomainError):
    status = HTTPStatus.SERVICE_UNAVAILABLE
    type = "service_unavailable"
    title = "Service unavailable"


class AuthMethodDisabledError(ForbiddenError):
    def __init__(
        self,
        detail: str = "This authentication method is not supported on this deployment.",
        code: str | None = None,
    ) -> None:
        super().__init__(
            detail=detail,
            code=ErrorCode.AUTH_METHOD_DISABLED if code is None else code,
        )


class PremiumEntitlementRequiredError(ForbiddenError):
    def __init__(self, capability: str) -> None:
        super().__init__(
            detail=f"This operation requires the '{capability}' commercial capability.",
            code=ErrorCode.PREMIUM_ENTITLEMENT_REQUIRED,
        )


class ErrorCode:
    """Stable error codes.

    A code is not renamed after release because clients branch on it. New
    causes receive new codes.
    """

    INTERNAL = "INTERNAL_ERROR"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    MALFORMED_ID = "MALFORMED_ID"
    AUTHENTICATION_REQUIRED = "AUTHENTICATION_REQUIRED"
    AUTH_METHOD_DISABLED = "AUTH_METHOD_DISABLED"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    RESOURCE_VERSION_CONFLICT = "RESOURCE_VERSION_CONFLICT"
    INVALID_CURSOR = "INVALID_CURSOR"
    SEARCH_QUERY_INVALID = "SEARCH_QUERY_INVALID"
    IF_MATCH_MALFORMED = "IF_MATCH_MALFORMED"
    IDEMPOTENCY_KEY_MALFORMED = "IDEMPOTENCY_KEY_MALFORMED"
    IDEMPOTENCY_KEY_REUSED = "IDEMPOTENCY_KEY_REUSED"
    MEMORY_CREATE_RESULT_DELETED = "MEMORY_CREATE_RESULT_DELETED"
    COMMENT_CREATE_RESULT_DELETED = "COMMENT_CREATE_RESULT_DELETED"
    WISH_CREATE_RESULT_DELETED = "WISH_CREATE_RESULT_DELETED"
    PLAN_CREATE_RESULT_DELETED = "PLAN_CREATE_RESULT_DELETED"
    MILESTONE_CREATE_RESULT_DELETED = "MILESTONE_CREATE_RESULT_DELETED"
    HEART_MOMENT_CREATE_RESULT_DELETED = "HEART_MOMENT_CREATE_RESULT_DELETED"
    REGISTRATION_DISABLED = "REGISTRATION_DISABLED"
    MAINTENANCE_MODE = "MAINTENANCE_MODE"
    PREMIUM_ENTITLEMENT_REQUIRED = "PREMIUM_ENTITLEMENT_REQUIRED"
    ATTACHMENT_TYPE_NOT_ALLOWED = "ATTACHMENT_TYPE_NOT_ALLOWED"
    ATTACHMENT_TOO_LARGE = "ATTACHMENT_TOO_LARGE"
    ATTACHMENT_VALIDATION_FAILED = "ATTACHMENT_VALIDATION_FAILED"
    ATTACHMENT_NOT_READY = "ATTACHMENT_NOT_READY"
    ATTACHMENT_ALREADY_LINKED = "ATTACHMENT_ALREADY_LINKED"
    ATTACHMENT_LIMIT_EXCEEDED = "ATTACHMENT_LIMIT_EXCEEDED"
    COMMENT_TARGET_NOT_AVAILABLE = "COMMENT_TARGET_NOT_AVAILABLE"
    NOTIFICATION_NOT_FOUND = "NOTIFICATION_NOT_FOUND"
    RATE_LIMITED = "RATE_LIMITED"
    REQUEST_BODY_TOO_LARGE = "REQUEST_BODY_TOO_LARGE"
    TRANSFER_FORMAT_UNSUPPORTED = "TRANSFER_FORMAT_UNSUPPORTED"
    TRANSFER_MANIFEST_INVALID = "TRANSFER_MANIFEST_INVALID"
    TRANSFER_ARCHIVE_UNSAFE = "TRANSFER_ARCHIVE_UNSAFE"
    TRANSFER_CHECKSUM_MISMATCH = "TRANSFER_CHECKSUM_MISMATCH"
    TRANSFER_TOO_LARGE = "TRANSFER_TOO_LARGE"
    TRANSFER_RELATION_INVALID = "TRANSFER_RELATION_INVALID"
    TRANSFER_MEMBER_MAPPING_REQUIRED = "TRANSFER_MEMBER_MAPPING_REQUIRED"
    TRANSFER_MEMBER_MAPPING_INVALID = "TRANSFER_MEMBER_MAPPING_INVALID"
    TRANSFER_PRIVACY_SCOPE_INVALID = "TRANSFER_PRIVACY_SCOPE_INVALID"
    TRANSFER_NOT_READY = "TRANSFER_NOT_READY"
    TRANSFER_EXPIRED = "TRANSFER_EXPIRED"
    TRANSFER_ALREADY_APPLIED = "TRANSFER_ALREADY_APPLIED"
    TRANSFER_IMPORT_FAILED = "TRANSFER_IMPORT_FAILED"
    TRANSFER_EXPORT_FAILED = "TRANSFER_EXPORT_FAILED"

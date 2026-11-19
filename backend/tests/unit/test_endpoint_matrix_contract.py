"""Check complete tenant-matrix ownership without requiring PostgreSQL."""

from eimir.main import create_app
from tests.integration.test_endpoint_matrix import (
    AUTHENTICATED_ONLY,
    PLAYBACK_ENDPOINTS,
    PRESENCE_DEVICE_ENDPOINTS,
    PUBLIC_ENDPOINTS,
    SERVER_ADMIN_ONLY,
    SPACE_ENDPOINTS,
)


def test_contract_is_completely_covered() -> None:
    """Every operation must declare its authentication and tenant test ownership."""
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
        | set(PLAYBACK_ENDPOINTS)
        | set(PRESENCE_DEVICE_ENDPOINTS)
        | set(PUBLIC_ENDPOINTS)
    )
    assert contract == covered

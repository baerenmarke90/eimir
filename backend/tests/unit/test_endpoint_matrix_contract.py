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
from tests.support.plugins import is_admin_operation, is_pro_operation, plugins_loaded


def test_contract_is_completely_covered() -> None:
    """Every operation must declare its authentication and tenant test ownership."""
    schema = create_app().openapi()
    contract = {
        (method.upper(), path)
        for path, operations in schema["paths"].items()
        for method in operations
        # The operator plugin's routes are covered by ``admin/admin_tests``.
        if not is_admin_operation(method, path)
    }
    covered = (
        {(endpoint.method, endpoint.template) for endpoint in SPACE_ENDPOINTS}
        | set(AUTHENTICATED_ONLY)
        | set(SERVER_ADMIN_ONLY)
        | set(PLAYBACK_ENDPOINTS)
        | set(PRESENCE_DEVICE_ENDPOINTS)
        | set(PUBLIC_ENDPOINTS)
    )
    if not plugins_loaded():
        # Core-only: the plugin's operations do not exist.
        covered = {operation for operation in covered if not is_pro_operation(*operation)}
    assert contract == covered

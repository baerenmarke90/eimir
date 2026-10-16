"""Identity domain package.

Import the Account-deletion persistence alongside the package so Alembic,
tests, and runtime metadata all see the same lifecycle table whenever the
Identity domain is registered.
"""

from eimir.identity import deletion_models as _deletion_models  # noqa: F401

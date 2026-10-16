# Alembic Code Policy

Alembic migrations are executable parts of the database history. New
migrations therefore follow the same Ruff linting and formatting policy as
the rest of the Python code, while already-applied historical migrations are
not rewritten retrospectively for style-only changes.

## Historical migrations

Migrations `0001` through `0007` were created before this policy was
introduced. They are therefore **individually and explicitly listed** as Ruff
exclusions in `pyproject.toml`. The list deliberately is not a wildcard, so a
new migration cannot accidentally fall under the exception.

In particular, `0005_auth_architecture.py` remains unchanged despite its
different Ruff formatting. This is a deliberate grandfathering decision for
an already-applied migration, not a general Alembic exception.

Historical migrations are changed only when a concrete functional correction
is necessary. Such a change requires its own issue/PR and appropriate
upgrade/downgrade/regression tests; style-only changes are not sufficient
reason.

## New migrations

All newly created Python migrations and `alembic/env.py` must satisfy the
current Ruff policy. CI therefore checks the `alembic` path explicitly:

```bash
uv run --frozen ruff check src tests scripts alembic
uv run --frozen ruff format --check src tests scripts alembic
```

If a new migration fails this check, it must be corrected before merge. The
explicit exclusion list must not be extended merely to bypass a new lint or
format error; extending it would be a new deliberate policy decision and must
be justified accordingly.

## Migration semantics

Ruff is only a code-quality gate and does not replace database verification.
The existing CI checks for `alembic upgrade head` and schema drift remain
mandatory and unchanged. Functional migration changes must additionally pass
the relevant upgrade/downgrade and PostgreSQL regression checks.

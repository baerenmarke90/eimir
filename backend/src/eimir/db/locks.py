"""Subject-scoped serialization through PostgreSQL advisory transaction locks.

Some security decisions read a row, decide, and then write. Between the read
and the write another API instance may do the same thing, so the decision must
be serialized rather than merely retried. A row lock cannot do that when the
row does not exist yet: the very case that has to be serialized is "nobody has
created it".

A PostgreSQL advisory transaction lock serializes on a derived key instead of a
row. It is held by the database, not by a process, so it works across the
horizontally replicated API. It is released when the transaction ends, whether
it commits or rolls back.

The key is derived from a SHA-256 digest so a subject can be identified without
its parts having to be short, numeric, or unique on their own. The derivation
is deterministic across instances and processes and is never persisted.
"""

from __future__ import annotations

import hashlib

from sqlalchemy import func, select
from sqlalchemy.orm import Session


def advisory_key(*parts: str) -> int:
    """Derive a stable signed 64-bit lock key from the parts of a subject.

    PostgreSQL advisory locks accept a signed 64-bit integer. Parts are joined
    with a separator that cannot occur in them, so ``("a", "bc")`` and
    ``("ab", "c")`` do not collapse into the same key.
    """
    digest = hashlib.sha256("\0".join(parts).encode()).digest()
    return int.from_bytes(digest[:8], byteorder="big", signed=True)


def lock_subject(session: Session, *parts: str) -> None:
    """Serialize the named subject until the current transaction ends.

    Callers must acquire this before reading the state they are about to
    decide on. Acquiring it afterwards would leave exactly the window it is
    meant to close.
    """
    session.execute(select(func.pg_advisory_xact_lock(advisory_key(*parts))))

"""Authentication authority boundary for the canonical public demo reset.

The public demo intentionally lets multiple visitors hold independent entry
proofs for the same Lea/Alex persona. That authority is different from the
ordinary magic-link generation lock, whose job is to make emailed links
latest-generation-only. The periodic canonical reset nevertheless has to be a
hard boundary for both outstanding demo proofs and sessions created from them.

A PostgreSQL advisory transaction lock provides that boundary across API and
worker processes. It is global to the one canonical demo dataset rather than
subject-scoped: a reset rebuilds both personas and clears authentication state
for both in one transaction, so splitting the lock by AccountEmail would only
make the reset acquire multiple locks without adding useful concurrency.

Lock ordering is part of the contract:

* when a demo proof redemption also takes the ordinary magic-link generation
  lock, this authority lock is acquired first;
* when the periodic reset also takes canonical-demo dataset serialization or
  reset-scheduler locks, this authority lock is acquired first.

Callers must not introduce a path that acquires either of those locks and then
tries to acquire this one. Keeping the authority lock outermost avoids a cycle
with token-row locks during reset cleanup.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from eimir.db.locks import lock_subject

DEMO_AUTHORITY_LOCK = "canonical_demo_auth_authority"
DEMO_AUTHORITY_SUBJECT = "canonical"


def lock_demo_auth_authority(session: Session) -> None:
    """Serialize canonical-demo auth publication against reset until commit."""
    lock_subject(session, DEMO_AUTHORITY_LOCK, DEMO_AUTHORITY_SUBJECT)

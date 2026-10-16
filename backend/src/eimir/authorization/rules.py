"""Turn a privacy class into a query predicate.

The important property is that this module produces SQL expressions rather
than booleans for already-loaded rows. A rule evaluated only after loading is
too late: the row has already entered memory, response sizing, and potentially
logs. Privacy belongs in the query itself.

New behavior is added to the rule table rather than at call sites. A new class
gets one function and one registration; existing domains then inherit the new
rule without route-specific changes.
"""

from __future__ import annotations

from collections.abc import Callable, Mapping
from enum import StrEnum
from types import MappingProxyType

from sqlalchemy import ColumnElement, and_, false, or_, true

from eimir.authorization.models import PrivateResource
from eimir.authorization.privacy import AuthorizationContext, PrivacyClass, SharedWrite


class Access(StrEnum):
    """Intent behind a query."""

    READ = "READ"
    WRITE = "WRITE"


AccessRule = Callable[[type[PrivateResource], AuthorizationContext], ColumnElement[bool]]
"""A rule returns the condition under which a row of its class is accessible."""


def _the_whole_space(
    model: type[PrivateResource], context: AuthorizationContext
) -> ColumnElement[bool]:
    """Both partners; the tenant condition is already applied separately."""
    return true()


def _only_the_owner(
    model: type[PrivateResource], context: AuthorizationContext
) -> ColumnElement[bool]:
    """Only the owner; the partner is equivalent to any other non-owner here."""
    return model.owner_id == context.account_id


_READ_RULES: Mapping[PrivacyClass, AccessRule] = MappingProxyType(
    {
        PrivacyClass.SPACE_SHARED: _the_whole_space,
        PrivacyClass.OWNER_ONLY: _only_the_owner,
    }
)


def _shared_write(
    model: type[PrivateResource], context: AuthorizationContext
) -> ColumnElement[bool]:
    """Apply the write policy declared by the domain.

    The default remains author-only under specification section 14. Shared M3
    planning/list resources explicitly opt into collaborative write under
    M3-D01; a wish belongs to the couple rather than the person who first typed
    it.

    The distinction lives here rather than in endpoints. Otherwise shared write
    would become a per-route exception whose omission could silently change
    authorization behavior.
    """
    if model.shared_write is SharedWrite.COLLABORATIVE:
        return _the_whole_space(model, context)
    return _only_the_owner(model, context)


_WRITE_RULES: Mapping[PrivacyClass, AccessRule] = MappingProxyType(
    {
        PrivacyClass.SPACE_SHARED: _shared_write,
        # OWNER_ONLY has no collaborative mode: the partner is not a co-author.
        PrivacyClass.OWNER_ONLY: _only_the_owner,
    }
)

_RULES: Mapping[Access, Mapping[PrivacyClass, AccessRule]] = MappingProxyType(
    {
        Access.READ: _READ_RULES,
        Access.WRITE: _WRITE_RULES,
    }
)


def rules_for(access: Access) -> Mapping[PrivacyClass, AccessRule]:
    return _RULES[access]


def privacy_clause(
    model: type[PrivateResource],
    context: AuthorizationContext,
    access: Access,
) -> ColumnElement[bool]:
    """Build the privacy predicate for one access intent, without tenant scope.

    Classes without a registered rule contribute no branch. Unknown or not-yet
    enforceable classes therefore fall through to ``false`` rather than being
    allowed: an omission hides content instead of exposing it.
    """
    branches = [
        and_(model.privacy_class == privacy_class.value, rule(model, context))
        for privacy_class, rule in rules_for(access).items()
    ]
    return or_(false(), *branches)


def access_clause(
    model: type[PrivateResource],
    context: AuthorizationContext,
    access: Access,
) -> ColumnElement[bool]:
    """Combine tenant isolation and privacy into one predicate.

    Ordering is not cosmetic: the space condition is always present. An owner
    predicate alone would let an account see its row from a space it no longer
    belongs to.
    """
    return and_(model.space_id == context.space_id, privacy_clause(model, context, access))

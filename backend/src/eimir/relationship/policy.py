"""Product-owned Space offboarding policy.

This module is the single runtime source for the V1 zero-active Space retention
horizon. It is deliberately not deployment configuration: Self-Hosted and
Cloud/Managed use the same privacy lifecycle, and commercial entitlements do not
participate in the calculation.
"""

from __future__ import annotations

from datetime import datetime, timedelta

SPACE_OFFBOARDING_POLICY_VERSION = "1.0"
"""Ratified Product-Owner policy version from M6 decision #669."""

SPACE_OFFBOARDING_RETENTION = timedelta(days=30)
"""Fixed V1 retention after a Space becomes zero-active."""


def purge_eligible_at(orphaned_at: datetime) -> datetime:
    """Return the immutable purge-eligibility instant for a newly orphaned Space."""
    return orphaned_at + SPACE_OFFBOARDING_RETENTION

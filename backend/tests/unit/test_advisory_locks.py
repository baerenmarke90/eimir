"""Key derivation for the subject-scoped serialization boundary.

The lock key is what makes two API instances agree that they are talking about
the same subject. It must be stable across processes and must not merge two
different subjects into one key, because a collision would silently remove the
serialization the caller asked for.
"""

from __future__ import annotations

from eimir.db.locks import advisory_key


def test_key_is_stable_for_the_same_subject() -> None:
    assert advisory_key("oidc_identity", "https://id.example", "anna") == advisory_key(
        "oidc_identity", "https://id.example", "anna"
    )


def test_key_fits_a_signed_64_bit_integer() -> None:
    "PostgreSQL advisory locks accept exactly this range."
    key = advisory_key("oidc_identity", "https://id.example", "anna")
    assert -(2**63) <= key < 2**63


def test_namespaces_separate_otherwise_identical_subjects() -> None:
    assert advisory_key("magic_link", "same") != advisory_key("account_recovery", "same")


def test_parts_do_not_run_into_each_other() -> None:
    "Without a separator, ('a', 'bc') and ('ab', 'c') would collapse into one key."
    assert advisory_key("a", "bc") != advisory_key("ab", "c")

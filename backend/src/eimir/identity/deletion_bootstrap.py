"""Explicit provisioning for a previously unprovisioned Account-deletion authority.

Normal API startup is deliberately not allowed to create this artifact. This
module is the one operator-invoked path for an installation that has never had
an Account-deletion authority: it creates the empty forward journal and returns
the stable instance identifier that must then be stored in protected
configuration.
"""

from __future__ import annotations

import argparse
from uuid import UUID, uuid4

from pydantic import ValidationError

from eimir.identity.deletion_journal import DeletionJournal, DeletionJournalError
from eimir.identity.deletion_self_service import DeletionAuthoritySettings


class DeletionBootstrapError(RuntimeError):
    """The deletion authority could not be safely provisioned."""


def bootstrap_new_deletion_authority(*, confirmed_new_installation: bool) -> UUID:
    """Create the first journal only for an explicitly unprovisioned authority.

    A configured instance identifier means this installation has already crossed
    the bootstrap boundary. If its journal is now missing, the only safe action
    is recovery from the independently protected authority artifact; generating
    a fresh empty history would defeat restore-safe deletion semantics.
    """
    if not confirmed_new_installation:
        raise DeletionBootstrapError("New-installation confirmation is required.")

    try:
        authority = DeletionAuthoritySettings()
    except ValidationError as exc:
        raise DeletionBootstrapError(
            "Account deletion authority configuration is invalid."
        ) from exc

    if authority.instance_id is not None:
        raise DeletionBootstrapError(
            "EIMIR_ACCOUNT_DELETION_INSTANCE_ID is already configured. Refusing to bootstrap "
            "a replacement journal for an established deletion authority."
        )

    path = authority.journal_path
    if path.exists():
        raise DeletionBootstrapError(
            "An Account deletion journal already exists. Refusing to replace or reinitialize it."
        )

    instance_id = uuid4()
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        journal = DeletionJournal.initialize(path, instance_id=instance_id)
        journal.read_all()
    except (DeletionJournalError, OSError) as exc:
        raise DeletionBootstrapError(
            "The Account deletion journal could not be initialized."
        ) from exc

    return instance_id


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Provision the Account-deletion forward journal for an installation that has "
            "never had an Account-deletion authority. Never use this command to replace "
            "a lost journal on an established authority."
        )
    )
    parser.add_argument(
        "--confirm-new-installation",
        action="store_true",
        required=True,
        help="Confirm that no prior Account-deletion authority exists for this installation.",
    )
    return parser


def main() -> int:
    args = _parser().parse_args()
    try:
        instance_id = bootstrap_new_deletion_authority(
            confirmed_new_installation=args.confirm_new_installation,
        )
    except DeletionBootstrapError as exc:
        print(f"Account deletion authority bootstrap failed: {exc}")
        return 1

    print("Account deletion authority initialized.")
    print(f"EIMIR_ACCOUNT_DELETION_INSTANCE_ID={instance_id}")
    print(
        "Store this value in protected operator configuration before starting the API. "
        "Do not run bootstrap again for this installation."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

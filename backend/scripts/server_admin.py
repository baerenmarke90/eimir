"""Narrow local break-glass operations for Self-Hosted ServerAdmin recovery."""

from __future__ import annotations

import argparse

from sqlalchemy import select

from eimir.administration import service as administration
from eimir.administration.models import AdministrationAction
from eimir.core.clock import now
from eimir.db.session import unit_of_work
from eimir.identity import service as accounts
from eimir.identity.models import AccountEmail


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Perform narrowly scoped local ServerAdmin recovery actions. "
            "This command never grants ServerAdmin by itself."
        )
    )
    subcommands = parser.add_subparsers(dest="action", required=True)
    verify = subcommands.add_parser(
        "verify-email",
        help="mark one existing AccountEmail as operator-verified",
    )
    verify.add_argument("email", help="existing account email address")
    return parser


def _verify_email(raw_email: str) -> int:
    address = accounts.normalize_email(raw_email)
    with unit_of_work() as session:
        email_record = session.execute(
            select(AccountEmail).where(AccountEmail.email == address).with_for_update()
        ).scalar_one_or_none()
        if email_record is None:
            raise SystemExit("No existing eimir. AccountEmail matches that address.")

        if email_record.verified_at is None:
            email_record.verified_at = now()
            administration.record_action(
                session,
                actor_id=None,
                target_account_id=email_record.account_id,
                action=AdministrationAction.ACCOUNT_EMAIL_VERIFIED,
            )
            changed = True
        else:
            changed = False

    state = "verified" if changed else "already verified"
    print(
        f"Account email {state}: {address}. "
        "ServerAdmin access still requires EIMIR_SERVER_ADMIN_EMAILS to include this address."
    )
    return 0


def main() -> int:
    args = build_parser().parse_args()
    if args.action == "verify-email":
        return _verify_email(args.email)
    raise SystemExit("Unsupported action.")


if __name__ == "__main__":
    raise SystemExit(main())

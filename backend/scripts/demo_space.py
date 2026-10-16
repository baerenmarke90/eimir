"""Create, ensure, or reset the canonical eimir. demo Space."""

from __future__ import annotations

import argparse
import os
import secrets
from datetime import date

from eimir.config import Environment, get_settings
from eimir.db.session import unit_of_work
from eimir.demo import create_demo_space, reset_demo_space
from eimir.demo.assets import load_and_validate_assets

LEA_PASSWORD_ENV = "EIMIR_DEMO_LEA_PASSWORD"
ALEX_PASSWORD_ENV = "EIMIR_DEMO_ALEX_PASSWORD"


def _reference_date(raw: str | None) -> date:
    if raw is None:
        return date.today()
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise SystemExit("--reference-date must use YYYY-MM-DD.") from error


def _required_secret(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"{name} must be supplied explicitly for demo creation.")
    return value


def _ephemeral_seed_password() -> str:
    """Return a high-entropy bootstrap password that is never printed or persisted."""
    return secrets.token_urlsafe(32)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Create, ensure, or reset the canonical eimir. demo Space."
    )
    parser.add_argument(
        "action",
        choices=("create", "ensure", "reset", "validate-assets"),
        help=(
            "create is explicit; ensure bootstraps only an enabled demo deployment; "
            "reset replaces only the verified demo Space; validate-assets checks local media only"
        ),
    )
    parser.add_argument(
        "--reference-date",
        help="scenario reference date (YYYY-MM-DD); defaults to today's local date",
    )
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.action == "validate-assets":
        catalog = load_and_validate_assets()
        print(f"Demo assets valid: {len(catalog.assets)} curated files.")
        return 0

    settings = get_settings()
    reference_date = _reference_date(args.reference_date)

    if args.action == "ensure" and not (
        settings.environment is Environment.DEMO and settings.demo_mode
    ):
        print("Demo bootstrap skipped: this is not an enabled demo deployment.")
        return 0

    with unit_of_work() as session:
        if args.action in {"create", "ensure"}:
            if args.action == "ensure":
                lea_password = _ephemeral_seed_password()
                alex_password = _ephemeral_seed_password()
            else:
                lea_password = _required_secret(LEA_PASSWORD_ENV)
                alex_password = _required_secret(ALEX_PASSWORD_ENV)
            result = create_demo_space(
                session,
                environment=settings.environment,
                lea_password=lea_password,
                alex_password=alex_password,
                reference_date=reference_date,
            )
        else:
            result = reset_demo_space(
                session,
                environment=settings.environment,
                reference_date=reference_date,
            )

    state = "created" if result.created else "already present"
    print(
        f"Canonical demo Space {state}: space={result.space_id} "
        f"reference_date={result.reference_date.isoformat()}"
    )
    print("Demo identities: Lea Sommer and Alex Winter (passwords are never printed).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

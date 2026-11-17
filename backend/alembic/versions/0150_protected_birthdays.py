"""Prepare birthdays for the protected payload (#797).

``accounts.birthday`` and ``related_persons.birthday`` were plain columns, so a
database dump showed every date of birth. From this revision the application
writes the date into the row's ``ProtectedPayload`` and leaves the column NULL.

This migration only makes room for that; it moves no value. Alembic runs without
the encryption keys and cannot seal a payload, so existing rows keep their date
in the old column until the worker job (or ``python -m eimir.security
migrate-columns``) has moved it. The columns are dropped in a later revision,
once no installation can still hold values in them.

- ``has_birthday`` on both tables records the one fact queries and constraints
  still need in SQL (is a birthday recorded), set here from the existing columns.
- Two rules of ``related_persons`` that named the column are widened: a known
  year and the Dashboard opt-in each need a birthday, which is now either the
  flag (the date is in the payload) or the old column (not moved yet).

Revision ID: 0150
Revises: 0149
"""

import sqlalchemy as sa
from alembic import op

revision = "0150"
down_revision = "0149"
branch_labels = None
depends_on = None

TABLES = ("accounts", "related_persons")
PEOPLE = "related_persons"


def upgrade() -> None:
    for table in TABLES:
        op.add_column(
            table,
            sa.Column(
                "has_birthday", sa.Boolean(), server_default=sa.text("false"), nullable=False
            ),
        )
        op.execute(f"UPDATE {table} SET has_birthday = TRUE WHERE birthday IS NOT NULL")
    op.drop_constraint("known_year_needs_a_birthday", PEOPLE, type_="check")
    op.create_check_constraint(
        "known_year_needs_a_birthday",
        PEOPLE,
        "has_birthday OR birthday IS NOT NULL OR birthday_year_known IS FALSE",
    )
    op.drop_constraint("dashboard_visibility_needs_a_birthday", PEOPLE, type_="check")
    op.create_check_constraint(
        "dashboard_visibility_needs_a_birthday",
        PEOPLE,
        "show_birthday_on_dashboard IS FALSE OR has_birthday OR birthday IS NOT NULL",
    )


def downgrade() -> None:
    # The older code reads only the columns. A date that already moved into a
    # payload cannot be brought back without the encryption keys, so a downgrade
    # is refused while such rows exist instead of silently losing them.
    op.execute(
        """
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM accounts WHERE has_birthday AND birthday IS NULL)
               OR EXISTS (SELECT 1 FROM related_persons WHERE has_birthday AND birthday IS NULL)
            THEN
                RAISE EXCEPTION
                    'Dates already moved into protected payloads; this downgrade would lose them.';
            END IF;
        END
        $$;
        """
    )
    op.drop_constraint("dashboard_visibility_needs_a_birthday", PEOPLE, type_="check")
    op.create_check_constraint(
        "dashboard_visibility_needs_a_birthday",
        PEOPLE,
        "show_birthday_on_dashboard IS FALSE OR birthday IS NOT NULL",
    )
    op.drop_constraint("known_year_needs_a_birthday", PEOPLE, type_="check")
    op.create_check_constraint(
        "known_year_needs_a_birthday",
        PEOPLE,
        "birthday IS NOT NULL OR birthday_year_known IS FALSE",
    )
    for table in TABLES:
        op.drop_column(table, "has_birthday")

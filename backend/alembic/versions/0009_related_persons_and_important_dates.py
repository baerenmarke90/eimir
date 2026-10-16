"""Related persons and important dates

Revision ID: 0009
Revises: 0008
Create Date: 2026-08-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)

UNKNOWN_BIRTH_YEAR = 1904


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def _privacy_class() -> sa.Enum:
    return sa.Enum(
        "SPACE_SHARED",
        "OWNER_ONLY",
        name="privacy_class",
        native_enum=False,
        create_constraint=True,
    )


def upgrade() -> None:
    op.create_table(
        "related_persons",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("relationship", sa.String(length=16), nullable=False),
        sa.Column("birthday", sa.Date(), nullable=True),
        sa.Column(
            "birthday_year_known",
            sa.Boolean(),
            server_default=sa.text("false"),
            nullable=False,
        ),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_related_persons"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_related_persons_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_related_persons_owner_id_accounts",
            ondelete="CASCADE",
        ),
        # Target columns for the composite foreign key from `important_dates`:
        # the Space and privacy class travel with the relation.
        sa.UniqueConstraint(
            "id",
            "space_id",
            "privacy_class",
            name="uq_related_persons_person_link",
        ),
        sa.CheckConstraint(
            "relationship IN ('CHILD', 'PARENT', 'SIBLING', 'FRIEND', 'OTHER')",
            name="relationship_is_known",
        ),
        sa.CheckConstraint(
            "birthday IS NOT NULL OR birthday_year_known IS FALSE",
            name="known_year_needs_a_birthday",
        ),
        sa.CheckConstraint(
            f"birthday IS NULL OR birthday_year_known IS TRUE "
            f"OR EXTRACT(YEAR FROM birthday) = {UNKNOWN_BIRTH_YEAR}",
            name="unknown_year_is_normalized",
        ),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index("ix_related_persons_space_id", "related_persons", ["space_id"])

    op.create_table(
        "important_dates",
        sa.Column("id", UUID, nullable=False),
        sa.Column("space_id", UUID, nullable=False),
        sa.Column("owner_id", UUID, nullable=False),
        sa.Column("privacy_class", _privacy_class(), nullable=False),
        sa.Column("related_person_id", UUID, nullable=True),
        sa.Column("related_person_privacy_class", sa.String(length=12), nullable=True),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("repeats", sa.String(length=16), nullable=False),
        sa.Column("crypto_version", sa.SmallInteger(), server_default=sa.text("0"), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.PrimaryKeyConstraint("id", name="pk_important_dates"),
        sa.ForeignKeyConstraint(
            ["space_id"],
            ["spaces.id"],
            name="fk_important_dates_space_id_spaces",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["owner_id"],
            ["accounts.id"],
            name="fk_important_dates_owner_id_accounts",
            ondelete="CASCADE",
        ),
        # The person's Space and privacy class are part of the same foreign
        # key. An important date therefore cannot point to a person in another
        # Space or be more visible than that person.
        sa.ForeignKeyConstraint(
            ["related_person_id", "space_id", "related_person_privacy_class"],
            [
                "related_persons.id",
                "related_persons.space_id",
                "related_persons.privacy_class",
            ],
            name="fk_important_dates_related_person",
            ondelete="CASCADE",
            onupdate="CASCADE",
        ),
        sa.CheckConstraint(
            "type IN ('BIRTHDAY', 'ANNIVERSARY', 'CUSTOM')",
            name="type_is_known",
        ),
        sa.CheckConstraint("repeats IN ('NONE', 'ANNUALLY')", name="repeats_is_known"),
        sa.CheckConstraint(
            "(related_person_id IS NULL) = (related_person_privacy_class IS NULL)",
            name="person_link_is_complete",
        ),
        sa.CheckConstraint(
            "related_person_privacy_class IS DISTINCT FROM 'OWNER_ONLY' "
            "OR privacy_class = 'OWNER_ONLY'",
            name="never_more_open_than_its_person",
        ),
        sa.CheckConstraint("crypto_version >= 0", name="crypto_version_is_non_negative"),
    )
    op.create_index("ix_important_dates_space_id", "important_dates", ["space_id"])
    op.create_index("ix_important_dates_owner_id", "important_dates", ["owner_id"])
    op.create_index(
        "ix_important_dates_space_id_related_person_id",
        "important_dates",
        ["space_id", "related_person_id"],
    )
    op.create_index(
        "ix_important_dates_space_id_date",
        "important_dates",
        ["space_id", "date"],
    )


def downgrade() -> None:
    op.drop_index("ix_important_dates_space_id_date", table_name="important_dates")
    op.drop_index("ix_important_dates_space_id_related_person_id", table_name="important_dates")
    op.drop_index("ix_important_dates_owner_id", table_name="important_dates")
    op.drop_index("ix_important_dates_space_id", table_name="important_dates")
    op.drop_table("important_dates")
    op.drop_index("ix_related_persons_space_id", table_name="related_persons")
    op.drop_table("related_persons")

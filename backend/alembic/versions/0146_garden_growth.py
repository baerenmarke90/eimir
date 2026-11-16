"""Let the shared garden grow: more species, the pond, bouquets and a name.

#1907 H3 (concept A, PR 3 "growth and life"). The closed species catalog gains
sunflower, tulip, water lily, strawberry and moonflower (a wrapped surprise is
stored as the moonflower it becomes). Plants learn whether they live in the
pond and whether they ever bloomed. Three small tables hold the garden's name,
how far each partner has seen it grow (so news shows once) and bouquets. A
bouquet reuses the `GARDEN_SEED_ARRIVED` notice with its own target type
`GARDEN_BOUQUET`. Nothing stores a location, a distance or free text other than
the short garden name.

Revision ID: 0146
Revises: 0145
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0146"
down_revision = "0145"
branch_labels = None
depends_on = None

_BASE_SPECIES = "'POPPY', 'BELLFLOWER', 'STARFLOWER'"
_SPECIES = _BASE_SPECIES + ", 'SUNFLOWER', 'TULIP', 'WATER_LILY', 'STRAWBERRY', 'MOONFLOWER'"
_TARGETS = (
    "'ONCE_MESSAGE', 'REMINDER', 'TRANSFER_EXPORT', 'TRANSFER_IMPORT', 'WISH_SELECTION', "
    "'MEMORY', 'HEART_MOMENT', 'MILESTONE', 'WISH', 'PLAN', 'PLACE', 'CHAPTER', 'COLLECTION', "
    "'GARDEN_SEED'"
)
_NEW_TARGET = "'GARDEN_BOUQUET'"


def _targets(include_bouquet: bool) -> None:
    targets = _TARGETS + (f", {_NEW_TARGET}" if include_bouquet else "")
    for table, name in (
        ("notifications", "notification_target_type_allowed"),
        ("activities", "activity_target_type_allowed"),
    ):
        op.drop_constraint(op.f(f"ck_{table}_{name}"), table, type_="check")
        op.create_check_constraint(
            name, table, f"target_type IS NULL OR target_type IN ({targets})"
        )


def upgrade() -> None:
    op.add_column(
        "garden_plants",
        sa.Column("in_pond", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "garden_plants",
        sa.Column("bloomed", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.execute("UPDATE garden_plants SET bloomed = true WHERE stage = 3")
    op.drop_constraint(op.f("uq_garden_plants_slot"), "garden_plants", type_="unique")
    op.create_unique_constraint(
        op.f("uq_garden_plants_bed_slot"), "garden_plants", ["space_id", "in_pond", "slot"]
    )
    op.drop_constraint(op.f("ck_garden_plants_species_allowed"), "garden_plants", type_="check")
    op.create_check_constraint("species_allowed", "garden_plants", f"species IN ({_SPECIES})")
    op.create_check_constraint(
        "pond_holds_lilies", "garden_plants", "in_pond = (species = 'WATER_LILY')"
    )

    op.create_table(
        "gardens",
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("length(btrim(name)) > 0", name=op.f("ck_gardens_name_not_blank")),
    )
    op.create_table(
        "garden_readers",
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("seen_shared_days", sa.SmallInteger(), nullable=False),
        sa.CheckConstraint(
            "seen_shared_days >= 0", name=op.f("ck_garden_readers_seen_not_negative")
        ),
    )
    op.create_table(
        "garden_bouquets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "space_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("spaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("giver_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("receiver_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("given_on", sa.Date(), nullable=False),
        sa.Column("flowers", postgresql.ARRAY(sa.String(16)), nullable=False),
        sa.Column(
            "flower_senders", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False
        ),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("kept", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.UniqueConstraint(
            "space_id", "giver_id", "given_on", name=op.f("uq_garden_bouquets_daily")
        ),
        sa.CheckConstraint(
            "giver_id <> receiver_id", name=op.f("ck_garden_bouquets_giver_is_not_receiver")
        ),
        sa.CheckConstraint(
            "cardinality(flowers) BETWEEN 1 AND 3",
            name=op.f("ck_garden_bouquets_flowers_bounded"),
        ),
        sa.CheckConstraint(
            "cardinality(flower_senders) = cardinality(flowers)",
            name=op.f("ck_garden_bouquets_senders_match_flowers"),
        ),
        sa.CheckConstraint(
            f"flowers <@ ARRAY[{_SPECIES}]::varchar[]",
            name=op.f("ck_garden_bouquets_flowers_allowed"),
        ),
        sa.CheckConstraint(
            "kept = false OR closed_at IS NOT NULL", name=op.f("ck_garden_bouquets_kept_is_closed")
        ),
    )
    op.create_index("ix_garden_bouquets_space_id", "garden_bouquets", ["space_id"])
    _targets(True)


def downgrade() -> None:
    op.execute(f"DELETE FROM notifications WHERE target_type = {_NEW_TARGET}")
    op.execute(f"DELETE FROM activities WHERE target_type = {_NEW_TARGET}")
    op.execute("DELETE FROM outbox_events WHERE event_type = 'GARDEN_BOUQUET_GIVEN'")
    _targets(False)
    op.drop_index("ix_garden_bouquets_space_id", table_name="garden_bouquets")
    op.drop_table("garden_bouquets")
    op.drop_table("garden_readers")
    op.drop_table("gardens")
    # Earlier revisions know only the first three species and one bed.
    op.execute(f"DELETE FROM garden_plants WHERE species NOT IN ({_BASE_SPECIES})")
    op.drop_constraint(op.f("ck_garden_plants_pond_holds_lilies"), "garden_plants", type_="check")
    op.drop_constraint(op.f("ck_garden_plants_species_allowed"), "garden_plants", type_="check")
    op.create_check_constraint("species_allowed", "garden_plants", f"species IN ({_BASE_SPECIES})")
    op.drop_constraint(op.f("uq_garden_plants_bed_slot"), "garden_plants", type_="unique")
    op.create_unique_constraint(
        op.f("uq_garden_plants_slot"), "garden_plants", ["space_id", "slot"]
    )
    op.drop_column("garden_plants", "bloomed")
    op.drop_column("garden_plants", "in_pond")

"""Add concrete person relationships while preserving legacy categories.

Revision ID: 0117
Revises: 0116
"""

from alembic import op

revision = "0117"
down_revision = "0116"
branch_labels = None
depends_on = None

LEGACY = "'CHILD', 'PARENT', 'SIBLING', 'FRIEND', 'OTHER'"
CONCRETE = (
    "'DAUGHTER', 'SON', 'MOTHER', 'FATHER', 'SISTER', 'BROTHER', "
    "'GRANDMOTHER', 'GRANDFATHER', 'GRANDDAUGHTER', 'GRANDSON', "
    "'MOTHER_IN_LAW', 'FATHER_IN_LAW', 'AUNT', 'UNCLE', 'COUSIN', "
    "'RELATIVE', 'ACQUAINTANCE', 'COLLEAGUE'"
)


def upgrade() -> None:
    op.drop_constraint("relationship_is_known", "related_persons", type_="check")
    op.create_check_constraint(
        "relationship_is_known", "related_persons", f"relationship IN ({LEGACY}, {CONCRETE})"
    )


def downgrade() -> None:
    # Normalize metadata for the legacy constraint without inventing a more
    # specific relationship. Retain protected content, identities and links;
    # newly authored notes still require a note-aware backend binary.
    op.execute(
        "UPDATE related_persons SET relationship = CASE "
        "WHEN relationship IN ('DAUGHTER', 'SON') THEN 'CHILD' "
        "WHEN relationship IN ('MOTHER', 'FATHER') THEN 'PARENT' "
        "WHEN relationship IN ('SISTER', 'BROTHER') THEN 'SIBLING' "
        "ELSE 'OTHER' END, version = version + 1, updated_at = CURRENT_TIMESTAMP "
        f"WHERE relationship NOT IN ({LEGACY})"
    )
    op.drop_constraint("relationship_is_known", "related_persons", type_="check")
    op.create_check_constraint(
        "relationship_is_known", "related_persons", f"relationship IN ({LEGACY})"
    )

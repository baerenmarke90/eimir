"""Add stable monthly/yearly recaps and owner-scoped reflections.

Revision ID: 0093
Revises: 0092
"""

import sqlalchemy as sa
from alembic import op

revision = "0093"
down_revision = "0092"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        CREATE TABLE recap_editions (
            space_id UUID NOT NULL,
            kind VARCHAR(8) NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            variant INTEGER NOT NULL,
            timezone VARCHAR(64) NOT NULL,
            locale VARCHAR(16) NOT NULL,
            starts_on DATE NOT NULL,
            through_on DATE NOT NULL,
            is_partial BOOLEAN NOT NULL,
            status VARCHAR(16) NOT NULL,
            theme VARCHAR(20) NOT NULL,
            generated_by VARCHAR(16) NOT NULL,
            generated_at TIMESTAMP WITH TIME ZONE,
            saved_at TIMESTAMP WITH TIME ZONE,
            customized BOOLEAN NOT NULL,
            request_token UUID NOT NULL,
            crypto_version SMALLINT DEFAULT 0 NOT NULL,
            payload JSONB NOT NULL,
            id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            version INTEGER NOT NULL,
            CONSTRAINT pk_recap_editions PRIMARY KEY (id),
            CONSTRAINT uq_recap_editions_id_space UNIQUE (id, space_id),
            CONSTRAINT ck_recap_editions_kind_is_known CHECK (kind IN ('MONTH', 'YEAR')),
            CONSTRAINT ck_recap_editions_period_is_valid CHECK ((kind = 'MONTH' AND month BETWEEN 1
            AND 12) OR (kind = 'YEAR' AND month = 0)),
            CONSTRAINT ck_recap_editions_year_is_bounded CHECK (year BETWEEN 1900 AND 2100),
            CONSTRAINT ck_recap_editions_variant_is_bounded CHECK (variant BETWEEN 0 AND 3),
            CONSTRAINT ck_recap_editions_status_is_known CHECK (status IN ('PENDING', 'READY',
            'EMPTY', 'PAUSED')),
            CONSTRAINT ck_recap_editions_date_range_is_valid CHECK (through_on >= starts_on),
            CONSTRAINT ck_recap_editions_crypto_version_is_non_negative CHECK (crypto_version >= 0),
            CONSTRAINT fk_recap_editions_space_id_spaces FOREIGN KEY(space_id) REFERENCES spaces
            (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_recap_editions_space_period ON recap_editions (space_id, year, month)
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_recap_editions_live_period ON recap_editions (space_id, kind, year,
            month, variant) WHERE saved_at IS NULL
        """
    )
    op.execute(
        """
        CREATE TABLE recap_sources (
            edition_id UUID NOT NULL,
            kind VARCHAR(16) NOT NULL,
            source_id UUID NOT NULL,
            source_version INTEGER NOT NULL,
            position INTEGER NOT NULL,
            CONSTRAINT pk_recap_sources PRIMARY KEY (edition_id, kind, source_id),
            CONSTRAINT ck_recap_sources_kind_is_known CHECK (kind IN ('MEMORY', 'HEART_MOMENT',
            'MILESTONE', 'CHAPTER', 'PLAN')),
            CONSTRAINT fk_recap_sources_edition_id_recap_editions FOREIGN KEY(edition_id) REFERENCES
            recap_editions (id) ON DELETE CASCADE
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_recap_sources_original ON recap_sources (kind, source_id)
        """
    )
    op.execute(
        """
        CREATE TABLE recap_reflections (
            edition_id UUID NOT NULL,
            crypto_version SMALLINT DEFAULT 0 NOT NULL,
            payload JSONB NOT NULL,
            id UUID NOT NULL,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
            version INTEGER NOT NULL,
            space_id UUID NOT NULL,
            owner_id UUID NOT NULL,
            privacy_class VARCHAR(12) NOT NULL,
            CONSTRAINT pk_recap_reflections PRIMARY KEY (id),
            CONSTRAINT fk_recap_reflections_edition_space FOREIGN KEY(edition_id, space_id)
            REFERENCES recap_editions (id, space_id) ON DELETE CASCADE,
            CONSTRAINT uq_recap_reflections_owner_visibility UNIQUE (edition_id, owner_id,
            privacy_class),
            CONSTRAINT ck_recap_reflections_privacy_is_enforceable CHECK (privacy_class IN
            ('SPACE_SHARED', 'OWNER_ONLY')),
            CONSTRAINT ck_recap_reflections_crypto_version_is_non_negative CHECK (crypto_version >=
            0),
            CONSTRAINT fk_recap_reflections_edition_id_recap_editions FOREIGN KEY(edition_id)
            REFERENCES recap_editions (id) ON DELETE CASCADE,
            CONSTRAINT fk_recap_reflections_space_id_spaces FOREIGN KEY(space_id) REFERENCES spaces
            (id) ON DELETE CASCADE,
            CONSTRAINT fk_recap_reflections_owner_id_accounts FOREIGN KEY(owner_id) REFERENCES
            accounts (id) ON DELETE CASCADE,
            CONSTRAINT ck_recap_reflections_privacy_class CHECK (privacy_class IN ('SPACE_SHARED',
            'OWNER_ONLY'))
        )
        """
    )
    op.execute(
        """
        CREATE INDEX ix_recap_reflections_space_id ON recap_reflections (space_id)
        """
    )


def downgrade() -> None:
    if op.get_bind().execute(sa.text("SELECT EXISTS (SELECT 1 FROM recap_editions)")).scalar():
        raise RuntimeError("Cannot downgrade while recap editions remain. Export them first.")
    op.drop_table("recap_reflections")
    op.drop_table("recap_sources")
    op.drop_table("recap_editions")

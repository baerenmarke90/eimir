"""Let an OIDC sign-in request carry a signup intent and a terms acceptance.

A person who creates a Cloud Account through an external identity provider
states that intent, and accepts the terms of use, before leaving for the
provider. Both facts must survive the redirect, so they live on the short-lived
authentication request. The terms acceptance record gains the matching origin.

Revision ID: 0156
Revises: 0155
"""

import sqlalchemy as sa
from alembic import op

revision = "0156"
down_revision = "0155"
branch_labels = None
depends_on = None

CONSTRAINT = "ck_terms_acceptances_origin_is_known"


def upgrade() -> None:
    op.add_column(
        "oidc_auth_requests",
        sa.Column("allow_signup", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "oidc_auth_requests",
        sa.Column("accepted_terms_version", sa.String(64), nullable=True),
    )
    op.drop_constraint(op.f(CONSTRAINT), "terms_acceptances", type_="check")
    op.create_check_constraint(
        op.f(CONSTRAINT),
        "terms_acceptances",
        "origin IN ('signup_request', 'signup_redemption', 'oidc_signup')",
    )


def downgrade() -> None:
    op.drop_constraint(op.f(CONSTRAINT), "terms_acceptances", type_="check")
    op.create_check_constraint(
        op.f(CONSTRAINT),
        "terms_acceptances",
        "origin IN ('signup_request', 'signup_redemption')",
    )
    op.drop_column("oidc_auth_requests", "accepted_terms_version")
    op.drop_column("oidc_auth_requests", "allow_signup")

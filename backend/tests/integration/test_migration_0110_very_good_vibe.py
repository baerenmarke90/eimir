"""The additive Vibe constraint must upgrade and roll back without losing a check-in."""

from datetime import date

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy.exc import IntegrityError

from eimir.daily_checkins.models import DailyCheckIn
from eimir.db.base import Base
from tests.conftest import make_account, make_space, requires_database

pytestmark = [pytest.mark.integration, requires_database]


def test_very_good_vibe_upgrade_and_compatible_rollback(session):  # type: ignore[no-untyped-def]
    account = make_account(session, "Migration author")
    space = make_space(session, account)
    check_in = DailyCheckIn(
        account_id=account.id, space_id=space.id, checked_on=date(2026, 11, 4), vibe="GOOD"
    )
    session.add(check_in)
    session.flush()
    migration = ScriptDirectory.from_config(Config("alembic.ini")).get_revision("0110").module
    context = MigrationContext.configure(
        session.connection(), opts={"target_metadata": Base.metadata}
    )
    with Operations.context(context):
        migration.downgrade()
        with pytest.raises(IntegrityError), session.begin_nested():
            check_in.vibe = "VERY_GOOD"
            session.flush()
        migration.upgrade()
        check_in.vibe = "VERY_GOOD"
        session.flush()
        migration.downgrade()
        session.refresh(check_in)
        assert check_in.vibe == "GOOD"
        assert check_in.checked_on == date(2026, 11, 4)
        migration.upgrade()

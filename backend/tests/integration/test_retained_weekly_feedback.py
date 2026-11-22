"""Ratings retained from the retired weekly review (#2203): caller-private Core data.

The weekly review that collected them was removed, so ratings can only be read,
cleared, exported and restored. Nothing here depends on the Pro plugin.
"""

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.daily_checkins import feedback
from eimir.daily_checkins.models import (
    DailyInsightFeedback,
    RecommendationKey,
    RecommendationRating,
)
from eimir.transfer import jobs
from eimir.transfer import service as transfer
from eimir.transfer.archive import validate_zip
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, requires_database
from tests.integration.test_daily_checkins_pro_insights import couple as couple

pytestmark = [pytest.mark.integration, requires_database]


def rate(session, couple, person, key="quiet_time", rating="HELPFUL"):
    session.add(
        DailyInsightFeedback(
            space_id=couple["space"].id,
            account_id=couple[person].id,
            recommendation_key=key,
            rating=rating,
        )
    )
    session.flush()


def path(couple):
    return f"/api/v1/spaces/{couple['space'].id}/daily-check-in/weekly-feedback"


def test_each_member_reads_and_clears_only_their_own_ratings(client, session, couple):
    rate(session, couple, "anna", "quiet_time", "NOT_FITTING")
    rate(session, couple, "anna", "small_plan", "HELPFUL")
    rate(session, couple, "ben", "quiet_time", "HELPFUL")

    anna = client.get(path(couple), headers=auth(couple["token_a"]))
    assert anna.status_code == 200
    assert anna.headers["Cache-Control"] == "private, no-store"
    assert anna.json() == {
        "ratings": [
            {"recommendationKey": "quiet_time", "rating": "NOT_FITTING"},
            {"recommendationKey": "small_plan", "rating": "HELPFUL"},
        ]
    }

    cleared = client.delete(path(couple), headers=auth(couple["token_a"]))
    assert cleared.status_code == 204
    assert client.get(path(couple), headers=auth(couple["token_a"])).json() == {"ratings": []}
    # The partner's own rating is untouched and never visible to Anna.
    assert client.get(path(couple), headers=auth(couple["token_b"])).json() == {
        "ratings": [{"recommendationKey": "quiet_time", "rating": "HELPFUL"}]
    }
    # Clearing again is idempotent.
    assert client.delete(path(couple), headers=auth(couple["token_a"])).status_code == 204


def test_outsiders_see_no_space_and_new_ratings_cannot_be_set(client, session, couple):
    rate(session, couple, "anna")
    assert client.get(path(couple), headers=auth(couple["token_outsider"])).status_code == 404
    assert client.delete(path(couple), headers=auth(couple["token_outsider"])).status_code == 404
    assert len(session.scalars(select(DailyInsightFeedback)).all()) == 1
    # The former per-recommendation rating route is gone.
    response = client.put(
        f"{path(couple)}/quiet_time", headers=auth(couple["token_a"]), json={"rating": "HELPFUL"}
    )
    assert response.status_code in {404, 405}


def test_personal_archive_restores_ratings_additively_without_overwriting(session, couple):
    rate(session, couple, "anna", "quiet_time", "HELPFUL")
    ctx = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    with transfer.build_export_archive(session, ctx, TransferScope.PERSONAL) as bundle:
        bundle.seek(0, 2)
        size = bundle.tell()
        bundle.seek(0)
        assert (
            "private/weekly-insight-feedback.json"
            in validate_zip(bundle, compressed_size=size).entries
        )
        bundle.seek(0)
        operation = transfer.create_import(session, ctx, bundle, size=size)
    row = session.scalars(select(DailyInsightFeedback)).one()
    row.rating = "NOT_FITTING"
    session.flush()
    jobs.handle_validate_import(session, {"importId": str(operation.id)})
    assert operation.status == ImportStatus.READY_TO_APPLY.value
    transfer.request_apply(session, ctx, str(operation.id))
    jobs.handle_apply_import(session, {"importId": str(operation.id)})
    assert operation.status == ImportStatus.COMPLETED.value
    assert feedback.feedback(session, ctx) == [
        feedback.Feedback(RecommendationKey.QUIET_TIME, RecommendationRating.NOT_FITTING)
    ]
    with transfer.build_export_archive(session, ctx, TransferScope.SHARED) as bundle:
        assert "private/weekly-insight-feedback.json" not in validate_zip(bundle).entries

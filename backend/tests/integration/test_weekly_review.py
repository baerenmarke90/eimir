"""Weekly review authorization, freshness, private preferences and portable lifecycle."""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from eimir.authorization import AuthorizationContext
from eimir.daily_checkins import context, weekly_review
from eimir.daily_checkins.models import (
    DailyCheckIn,
    DailyInsightFeedback,
    RecommendationKey,
    RecommendationRating,
)
from eimir.relationship.models import DailyCheckInVisibilityMode
from eimir.transfer import jobs
from eimir.transfer import service as transfer
from eimir.transfer.archive import validate_zip
from eimir.transfer.models import ImportStatus, TransferScope
from tests.conftest import auth, requires_database
from tests.integration.test_daily_checkins_pro_insights import (
    _grant_insights,
    configure_daily,
)
from tests.integration.test_daily_checkins_pro_insights import (
    couple as couple,
)

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture(autouse=True)
def space_day(monkeypatch):
    monkeypatch.setattr(context, "now", lambda: datetime(2026, 10, 28, 12, tzinfo=UTC))


def setup(session, couple, *, pro=True, mutual=False):
    configure_daily(
        session,
        space_id=couple["space"].id,
        manager_id=couple["anna"].id,
        energy_mode=DailyCheckInVisibilityMode.MUTUAL_REVEAL
        if mutual
        else DailyCheckInVisibilityMode.IMMEDIATE,
    )
    if pro:
        _grant_insights(session, couple["space"].id, couple["anna"].id)
    return f"/api/v1/spaces/{couple['space'].id}/daily-check-in"


def seed(session, couple, *, own=True):
    for offset in range(10):
        for person in ["anna", "ben"] if own else ["ben"]:
            session.add(
                DailyCheckIn(
                    space_id=couple["space"].id,
                    account_id=couple[person].id,
                    checked_on=date(2026, 10, 19) + timedelta(days=offset),
                    energy_level=40 if offset < 7 else 80,
                )
            )
    session.flush()


def preview(client, base, token):
    response = client.get(f"{base}/weekly-review?week_start=2026-10-26", headers=auth(token))
    assert response.status_code == 200, response.text
    assert response.headers["Cache-Control"] == "private, no-store"
    return response.json()


def test_read_never_infers_and_sparse_generation_is_labelled_general(
    client, session, couple, monkeypatch
):
    base = setup(session, couple)
    monkeypatch.setattr(
        weekly_review,
        "query_structured",
        lambda *args, **kwargs: pytest.fail("Sparse evidence must not infer"),
    )
    value = preview(client, base, couple["token_a"])
    response = client.post(
        f"{base}/weekly-review",
        headers=auth(couple["token_a"]),
        json={"weekStart": "2026-10-26", "evidenceToken": value["evidenceToken"]},
    )
    assert response.status_code == 200
    assert response.json()["general"] and response.json()["generatedBy"] == "RULES"
    assert response.json()["observations"] == []
    assert len(response.json()["recommendations"]) == 2


def test_hidden_partner_mutation_does_not_change_evidence(client, session, couple):
    base = setup(session, couple, mutual=True)
    seed(session, couple, own=False)
    before = preview(client, base, couple["token_a"])
    row = session.scalars(
        select(DailyCheckIn).where(DailyCheckIn.account_id == couple["ben"].id)
    ).first()
    row.energy_level = 100
    session.flush()
    after = preview(client, base, couple["token_a"])
    assert before == after


def test_feedback_is_caller_private_bounded_and_exported_only_personally(client, session, couple):
    base = setup(session, couple)
    for token, rating in [(couple["token_a"], "NOT_FITTING"), (couple["token_b"], "HELPFUL")]:
        response = client.put(
            f"{base}/weekly-feedback/quiet_time", headers=auth(token), json={"rating": rating}
        )
        assert response.status_code == 200, response.text
    anna = preview(client, base, couple["token_a"])
    ben = preview(client, base, couple["token_b"])
    assert anna["feedback"] == [{"recommendationKey": "quiet_time", "rating": "NOT_FITTING"}]
    assert "quiet_time" not in anna["recommendations"]
    assert ben["feedback"] == [{"recommendationKey": "quiet_time", "rating": "HELPFUL"}]
    assert ben["recommendations"][0] == "quiet_time"
    ctx = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    own = transfer._portable_rows(session, ctx, TransferScope.PERSONAL)["daily_insight_feedback"]
    shared = transfer._portable_rows(session, ctx, TransferScope.SHARED)["daily_insight_feedback"]
    assert len(own) == 1 and own[0]["account_id"] == couple["anna"].id and shared == []
    assert (
        client.put(
            f"{base}/weekly-feedback/diagnosis",
            headers=auth(couple["token_a"]),
            json={"rating": "HELPFUL"},
        ).status_code
        == 422
    )
    foreign = client.put(
        f"{base}/weekly-feedback/quiet_time",
        headers=auth(couple["token_outsider"]),
        json={"rating": "HELPFUL"},
    )
    assert foreign.status_code == 404


def test_free_cannot_generate_or_rate_but_can_clear_retained_feedback(client, session, couple):
    base = setup(session, couple, pro=False)
    session.add(
        DailyInsightFeedback(
            space_id=couple["space"].id,
            account_id=couple["anna"].id,
            recommendation_key="quiet_time",
            rating="HELPFUL",
        )
    )
    session.flush()
    assert (
        client.get(
            f"{base}/weekly-review?week_start=2026-10-26", headers=auth(couple["token_a"])
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"{base}/weekly-feedback/quiet_time",
            headers=auth(couple["token_a"]),
            json={"rating": "HELPFUL"},
        ).status_code
        == 403
    )
    assert (
        client.put(
            f"{base}/weekly-feedback/quiet_time",
            headers=auth(couple["token_a"]),
            json={"rating": None},
        ).status_code
        == 200
    )
    assert not session.scalars(select(DailyInsightFeedback)).all()


def test_changes_during_inference_reject_stale_result(client, session, couple, monkeypatch):
    base = setup(session, couple)
    seed(session, couple)
    value = preview(client, base, couple["token_a"])

    def mutate(prepared):
        row = session.scalars(
            select(DailyCheckIn).where(DailyCheckIn.account_id == couple["anna"].id)
        ).first()
        row.energy_level = 100
        session.flush()
        return weekly_review.Selection.model_construct(
            observation_keys=[], recommendation_keys=[]
        ), False

    monkeypatch.setattr(weekly_review, "choose", mutate)
    response = client.post(
        f"{base}/weekly-review",
        headers=auth(couple["token_a"]),
        json={"weekStart": "2026-10-26", "evidenceToken": value["evidenceToken"]},
    )
    assert (
        response.status_code == 409 and response.json()["code"] == "WEEKLY_INSIGHT_INPUTS_CHANGED"
    )


def test_valid_model_selection_is_revalidated_and_rate_limited(
    client, session, couple, monkeypatch
):
    base = setup(session, couple)
    seed(session, couple)
    monkeypatch.setattr(
        weekly_review,
        "get_settings",
        lambda: SimpleNamespace(recap_ai_url="http://recap-ai:11434", recap_ai_model="test"),
    )
    monkeypatch.setattr(
        weekly_review,
        "query_structured",
        lambda *args, **kwargs: {
            "message": {
                "content": (
                    '{"observation_keys":["energy_rising"],"recommendation_keys":["small_plan"]}'
                )
            }
        },
    )
    value = preview(client, base, couple["token_a"])
    for attempt in range(3):
        response = client.post(
            f"{base}/weekly-review",
            headers=auth(couple["token_a"]),
            json={"weekStart": "2026-10-26", "evidenceToken": value["evidenceToken"]},
        )
        assert response.status_code == (200 if attempt < 2 else 429), response.text
        if attempt < 2:
            assert response.json()["generatedBy"] == "AI"
            assert [fact["kind"] for fact in response.json()["observations"]] == ["ENERGY_RISING"]
    assert preview(client, base, couple["token_b"])["feedback"] == []


def test_personal_feedback_archive_restores_additively_without_overwriting_current_choice(
    session, couple
):
    setup(session, couple)
    ctx = AuthorizationContext(account_id=couple["anna"].id, space_id=couple["space"].id)
    weekly_review.set_feedback(
        session, ctx, RecommendationKey.QUIET_TIME, RecommendationRating.HELPFUL
    )
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
    weekly_review.set_feedback(
        session, ctx, RecommendationKey.QUIET_TIME, RecommendationRating.NOT_FITTING
    )
    jobs.handle_validate_import(session, {"importId": str(operation.id)})
    assert operation.status == ImportStatus.READY_TO_APPLY.value
    transfer.request_apply(session, ctx, str(operation.id))
    jobs.handle_apply_import(session, {"importId": str(operation.id)})
    assert operation.status == ImportStatus.COMPLETED.value
    assert weekly_review.feedback(session, ctx) == [
        weekly_review.Feedback(RecommendationKey.QUIET_TIME, RecommendationRating.NOT_FITTING)
    ]
    with transfer.build_export_archive(session, ctx, TransferScope.SHARED) as bundle:
        assert "private/weekly-insight-feedback.json" not in validate_zip(bundle).entries

"""Gallery input and portable archive boundaries, independent of a database."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from eimir.api.v1.plans import PlanCreate, PlanUpdate
from eimir.transfer.archive import TransferArchiveError
from eimir.transfer.service import _validate_plan_photos


@pytest.mark.parametrize("model", [PlanCreate, PlanUpdate])
@pytest.mark.parametrize(
    "photos",
    [
        None,
        [{"attachmentId": str(uuid4()), "position": 1}],
        [{"attachmentId": str(uuid4()), "position": 0}] * 21,
    ],
)
def test_invalid_gallery_never_becomes_a_partial_patch(model, photos):  # type: ignore[no-untyped-def]
    with pytest.raises(ValidationError):
        model.model_validate({"title": "Together", "attachments": photos})


@pytest.mark.parametrize(
    "legacy", [{"coverAttachmentId": str(uuid4())}, {"coverIsSensitive": True}]
)
def test_gallery_and_legacy_cover_cannot_compete(legacy):  # type: ignore[no-untyped-def]
    with pytest.raises(ValidationError):
        PlanUpdate.model_validate({"attachments": [], **legacy})
    assert PlanUpdate.model_validate({"attachments": []}).attachments == []
    assert PlanUpdate.model_validate({"title": "Text only"}).attachments is None


@pytest.mark.parametrize(
    "corruption", [None, "duplicate", "gap", "no_cover", "oversize", "video", "too_many"]
)
def test_portable_plan_gallery_cannot_bypass_media_rules(corruption):  # type: ignore[no-untyped-def]
    plan, cover, extra = (str(uuid4()) for _ in range(3))
    tables = {
        "plans": [{"id": plan, "coverAttachmentId": cover}],
        "plan_attachments": [{"planId": plan, "attachmentId": extra, "position": 1}],
    }
    media = [{"sourceId": photo, "mediaType": "IMAGE", "size": 100} for photo in [cover, extra]]
    if corruption == "duplicate":
        tables["plan_attachments"][0]["attachmentId"] = cover
    elif corruption == "gap":
        tables["plan_attachments"][0]["position"] = 2
    elif corruption == "no_cover":
        tables["plans"][0]["coverAttachmentId"] = None
    elif corruption == "oversize":
        media[0]["size"] = 500 * 1024 * 1024
    elif corruption == "video":
        media[1]["mediaType"] = "VIDEO"
    elif corruption == "too_many":
        for position in range(2, 21):
            photo = str(uuid4())
            tables["plan_attachments"].append(
                {"planId": plan, "attachmentId": photo, "position": position}
            )
            media.append({"sourceId": photo, "mediaType": "IMAGE", "size": 100})
    if corruption:
        with pytest.raises(TransferArchiveError):
            _validate_plan_photos(tables, media)
    else:
        _validate_plan_photos(tables, media)

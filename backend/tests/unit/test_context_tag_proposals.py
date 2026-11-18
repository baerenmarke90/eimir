"""Local inference is a bounded proposal; source text never becomes instructions."""

import pytest
from pydantic import ValidationError

from eimir.context_tags.jobs import LabelProposal, validated_labels


def test_only_evidence_or_existing_vocabulary_can_supply_a_label() -> None:
    assert validated_labels(
        ["Belgien", "Belgien", "Depression", "Zusammen", "<script>", "https://example.org"],
        "Ein Wochenende in Belgien",
        ["Zusammen"],
    ) == ["Belgien", "Zusammen"]


def test_model_output_cannot_expand_authored_tag_limits_or_add_fields() -> None:
    with pytest.raises(ValidationError):
        LabelProposal(tags=["x"] * 9)
    with pytest.raises(ValidationError):
        LabelProposal.model_validate({"tags": ["Belgien"], "rewrite": "new content"})

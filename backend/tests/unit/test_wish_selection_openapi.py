"""Own selections have no route for addressing or reading a partner's row."""

from eimir.main import create_app


def test_selection_contract_requires_explicit_consent_and_concurrency() -> None:
    schema = create_app().openapi()
    base = "/api/v1/spaces/{spaceId}/wish-selection"
    assert set(path for path in schema["paths"] if "wish-selection" in path) == {
        base,
        base + "/own",
    }
    for path, method in [(base, "put"), (base, "delete"), (base + "/own", "put")]:
        parameters = schema["paths"][path][method]["parameters"]
        assert next(parameter for parameter in parameters if parameter["name"] == "If-Match")[
            "required"
        ]
    update = schema["components"]["schemas"]["WishSelectionUpdate"]
    assert set(update["required"]) == {"favoriteWishIds", "published"}
    assert update["additionalProperties"] is False
    assert not {"ownerId", "accountId", "partner"} & set(update["properties"])
    response = schema["components"]["schemas"]["WishSelectionView"]
    assert not {"partner", "selections", "partnerVersion", "partnerDraft"} & set(
        response["properties"]
    )

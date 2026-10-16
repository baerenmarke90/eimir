"""The contract check must detect even small unintended drift."""

from __future__ import annotations

import pytest

from scripts.openapi_contract import ContractMismatchError, ensure_contract_matches


def test_manipulated_contract_fails() -> None:
    contract = {"info": {"title": "eimir."}, "openapi": "3.1.0"}
    manipulated = {**contract, "info": {"title": "Unintended change"}}

    with pytest.raises(ContractMismatchError, match="OpenAPI contract is not current"):
        ensure_contract_matches(contract, manipulated)

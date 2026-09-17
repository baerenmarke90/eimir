"""Tenant isolation, the central security invariant.

Matrix from docs/SECURITY.md:

    Account A on Space A (member)          allowed
    Account B on Space A (member)          allowed
    Account C on Space B accessing Space A never
    anonymous                              never

The suite verifies this through HTTP with real tokens, not by calling the guard
function directly. A direct call would skip the exact path on which a check can
be forgotten.
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from eimir.core.errors import NotFoundError
from eimir.relationship import service
from eimir.relationship.models import MembershipStatus
from tests.conftest import auth, make_account, make_space, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]


@pytest.fixture
def couple(session: Session):  # type: ignore[no-untyped-def]
    """Two partners in one Space and an outsider with a separate Space."""
    a = make_account(session, "Anna")
    b = make_account(session, "Ben")
    outsider = make_account(session, "Fremde Person")

    space = make_space(session, a)
    service.add_member(session, space.id, b)
    make_space(session, outsider)
    session.flush()

    return {
        "a": a,
        "b": b,
        "outsider": outsider,
        "space": space,
        "token_a": sign_in(session, a),
        "token_b": sign_in(session, b),
        "token_outsider": sign_in(session, outsider),
    }


class TestAllowedAccess:
    def test_member_a_sees_space(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 200
        assert response.json()["id"] == str(couple["space"].id)

    def test_member_b_sees_same_space(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 200

    def test_both_partners_are_present(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_a"]),
        )
        names = {partner["displayName"] for partner in response.json()["partners"]}
        assert names == {"Anna", "Ben"}


class TestOutsiderAccess:
    def test_outsider_gets_404_not_403(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        """A 403 would confirm that the Space exists."""
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_outsider"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_foreign_space_and_fabricated_space_are_indistinguishable(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """Any difference could otherwise become an existence oracle."""
        from eimir.core.ids import new_id

        real = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_outsider"]),
        )
        fabricated = client.get(
            f"/api/v1/spaces/{new_id()}",
            headers=auth(couple["token_outsider"]),
        )
        assert real.status_code == fabricated.status_code == 404
        assert real.json() == fabricated.json()

    def test_rejection_contains_no_content(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        raw_text = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_outsider"]),
        ).text
        for forbidden in ["Anna", "Ben", str(couple["a"].id), str(couple["b"].id)]:
            assert forbidden not in raw_text


class TestAnonymousAccess:
    def test_no_header_means_no_access(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        response = client.get(f"/api/v1/spaces/{couple['space'].id}")
        assert response.status_code == 401

    @pytest.mark.parametrize(
        "headers",
        [
            {"Authorization": ""},
            {"Authorization": "Bearer"},
            {"Authorization": "Bearer "},
            {"Authorization": "Basic abc"},
            {"Authorization": "abc"},
            {"Authorization": "Bearer nicht-echt"},
        ],
    )
    def test_invalid_header_means_no_access(
        self,
        client,
        couple,
        headers,
    ) -> None:  # type: ignore[no-untyped-def]
        response = client.get(f"/api/v1/spaces/{couple['space'].id}", headers=headers)
        assert response.status_code == 401


class TestMalformedIds:
    @pytest.mark.parametrize(
        "malformed",
        [
            "nicht-echt",
            "12345",
            "' OR 1=1 --",
            "00000000-0000-0000-0000-000000000000",
            "%2e%2e",
        ],
    )
    def test_route_match_remains_domain_privacy_404(
        self,
        client,
        couple,
        malformed: str,
    ) -> None:  # type: ignore[no-untyped-def]
        """Well-formedness must not become an existence oracle on a matched route."""
        response = client.get(
            f"/api/v1/spaces/{malformed}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_extra_path_segment_becomes_framework_404(
        self,
        client,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """A route miss under /api/v1 remains within the ProblemDetails contract."""
        response = client.get(
            "/api/v1/spaces/nicht-echt/unerwartetes-segment",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 404
        assert response.json() == {
            "type": "not_found",
            "title": "Not found",
            "status": 404,
            "detail": "Not Found",
            "code": "HTTP_404",
        }


class TestEndedMembership:
    def test_departed_member_sees_nothing(
        self,
        client,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        membership = service.require_membership(session, couple["b"], couple["space"].id)
        service.end_membership(session, membership)
        session.flush()

        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_b"]),
        )
        assert response.status_code == 404

    def test_remaining_partner_keeps_access(
        self,
        client,
        session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        membership = service.require_membership(session, couple["b"], couple["space"].id)
        service.end_membership(session, membership, removed=True)
        session.flush()

        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_a"]),
        )
        assert response.status_code == 200
        assert [partner["displayName"] for partner in response.json()["partners"]] == ["Anna"]


class TestGuardDirectly:
    def test_foreign_space_raises_not_found(
        self,
        session: Session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        with pytest.raises(NotFoundError):
            service.require_membership(session, couple["outsider"], couple["space"].id)

    def test_member_gets_membership(
        self,
        session: Session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        membership = service.require_membership(session, couple["a"], couple["space"].id)
        assert membership.status == MembershipStatus.ACTIVE.value
        assert membership.space_id == couple["space"].id


class TestUpperBound:
    def test_third_partner_is_rejected(
        self,
        session: Session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        """A couple Space has at most two active partners."""
        from eimir.core.errors import ConflictError

        third = make_account(session, "Dritte Person")
        with pytest.raises(ConflictError) as error:
            service.add_member(session, couple["space"].id, third)
        assert error.value.code == "SPACE_FULL"

    def test_existing_member_cannot_join_twice(
        self,
        session: Session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        from eimir.core.errors import ConflictError

        with pytest.raises(ConflictError) as error:
            service.add_member(session, couple["space"].id, couple["b"])
        assert error.value.code == "ACCOUNT_ALREADY_MEMBER"

    def test_relationship_history_rejects_replacement_after_member_leaves(
        self,
        session: Session,
        couple,
    ) -> None:  # type: ignore[no-untyped-def]
        from eimir.core.errors import ConflictError

        membership = service.require_membership(session, couple["b"], couple["space"].id)
        service.end_membership(session, membership)
        session.flush()

        third = make_account(session, "Dritte Person")
        with pytest.raises(ConflictError) as error:
            service.add_member(session, couple["space"].id, third)
        assert error.value.code == service.SpaceErrorCode.RELATIONSHIP_ENDED


class TestNoAuthenticationData:
    def test_response_contains_only_whitelist(self, client, couple) -> None:  # type: ignore[no-untyped-def]
        """Accounts also carry authentication data and contact information."""
        response = client.get(
            f"/api/v1/spaces/{couple['space'].id}",
            headers=auth(couple["token_a"]),
        )
        for partner in response.json()["partners"]:
            assert set(partner) == {"id", "displayName"}

        raw_text = response.text
        for forbidden in ["secret", "token", "hash", "email", "birthday", "locale"]:
            assert forbidden not in raw_text.lower()

"""Owner and privacy isolation through HTTP against real PostgreSQL.

The matrix from docs/SECURITY.md, extended with the ownership question:

    Owner on own OWNER_ONLY row                 allowed, including mutation
    Partner in the same space on OWNER_ONLY     never, on every path
    Partner on SPACE_SHARED                     read access allowed
    Foreign space                               never
    Anonymous                                   never

The tests exercise real HTTP requests with real tokens. Calling the guards
directly would bypass exactly the request path on which a check can be omitted.

The probe from `tests.support.privacy_probe` is not a product domain, but
the thinnest resource that can exercise the underlying rule itself; see
the rationale there.
"""

from __future__ import annotations

import pytest
from sqlalchemy import Engine, event
from sqlalchemy.orm import Session

from eimir.authorization import PrivacyClass
from eimir.core.ids import new_id
from eimir.relationship import service
from tests.conftest import auth, make_account, make_space, requires_database, sign_in
from tests.support.privacy_probe import PrivacyProbe

pytestmark = [pytest.mark.integration, requires_database]

CANARY_ANNA = "CANARY-PRIVATE-ANNA-7421"
CANARY_BEN = "CANARY-PRIVATE-BEN-7422"
CANARY_FOREIGN = "CANARY-PRIVATE-CAROL-7423"


def _probe(
    session: Session, *, space_id, owner_id, privacy_class: PrivacyClass, label: str
) -> PrivacyProbe:  # type: ignore[no-untyped-def]
    probe = PrivacyProbe(
        space_id=space_id,
        owner_id=owner_id,
        privacy_class=privacy_class.value,
        label=label,
    )
    session.add(probe)
    session.flush()
    return probe


@pytest.fixture
def probe_client(session: Session):  # type: ignore[no-untyped-def]
    """The production app with the probe router attached.

    A dedicated app instance keeps the versioned production OpenAPI contract
    unchanged.
    """
    from fastapi.testclient import TestClient

    from tests.support.privacy_probe_api import create_probe_app

    return TestClient(create_probe_app(session), raise_server_exceptions=False)


@pytest.fixture
def scenario(session: Session):  # type: ignore[no-untyped-def]
    "Two partners in one space and a foreign person in their own space."
    anna = make_account(session, "Anna")
    ben = make_account(session, "Ben")
    carol = make_account(session, "Carol")

    alpha = make_space(session, anna)
    service.add_member(session, alpha.id, ben)
    beta = make_space(session, carol)
    session.flush()

    return {
        "anna": anna,
        "ben": ben,
        "carol": carol,
        "alpha": alpha,
        "beta": beta,
        "token_anna": sign_in(session, anna),
        "token_ben": sign_in(session, ben),
        "token_carol": sign_in(session, carol),
        "private_anna": _probe(
            session,
            space_id=alpha.id,
            owner_id=anna.id,
            privacy_class=PrivacyClass.OWNER_ONLY,
            label=CANARY_ANNA,
        ),
        "private_ben": _probe(
            session,
            space_id=alpha.id,
            owner_id=ben.id,
            privacy_class=PrivacyClass.OWNER_ONLY,
            label=CANARY_BEN,
        ),
        "shared_anna": _probe(
            session,
            space_id=alpha.id,
            owner_id=anna.id,
            privacy_class=PrivacyClass.SPACE_SHARED,
            label="Gemeinsam von Anna",
        ),
        "private_carol": _probe(
            session,
            space_id=beta.id,
            owner_id=carol.id,
            privacy_class=PrivacyClass.OWNER_ONLY,
            label=CANARY_FOREIGN,
        ),
    }


def _path(scenario, probe_key: str, space_key: str = "alpha") -> str:  # type: ignore[no-untyped-def]
    return f"/api/v1/spaces/{scenario[space_key].id}/privacy-probes/{scenario[probe_key].id}"


class TestOwner:
    def test_reads_own_private_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.get(
            _path(scenario, "private_anna"), headers=auth(scenario["token_anna"])
        )
        assert response.status_code == 200
        assert response.json()["label"] == CANARY_ANNA
        assert response.json()["privacyClass"] == "OWNER_ONLY"

    def test_changes_own_private_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.patch(
            _path(scenario, "private_anna"),
            headers=auth(scenario["token_anna"]),
            json={"label": "geaendert"},
        )
        assert response.status_code == 200
        assert response.json()["label"] == "geaendert"

    def test_deletes_own_private_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        path = _path(scenario, "private_anna")
        assert probe_client.delete(path, headers=auth(scenario["token_anna"])).status_code == 204
        assert probe_client.get(path, headers=auth(scenario["token_anna"])).status_code == 404

    def test_sees_own_and_shared_rows_in_list(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes",
            headers=auth(scenario["token_anna"]),
        )
        assert response.status_code == 200
        assert {row["label"] for row in response.json()} == {CANARY_ANNA, "Gemeinsam von Anna"}


class TestPartnerInSameSpace:
    """The partner is not a privileged reader.

    OWNER_ONLY resources remain indistinguishable from foreign resources.
    """

    def test_cannot_get_private_row_by_id(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.get(
            _path(scenario, "private_anna"), headers=auth(scenario["token_ben"])
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PRIVACY_PROBE_NOT_FOUND"

    def test_real_and_invented_ids_are_indistinguishable(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        "Otherwise the response difference could become an existence oracle."
        headers = auth(scenario["token_ben"])
        real = probe_client.get(_path(scenario, "private_anna"), headers=headers)
        invented = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/{new_id()}", headers=headers
        )
        assert real.status_code == invented.status_code == 404
        assert real.json() == invented.json()

    @pytest.mark.parametrize(
        "malformed_id",
        ["nicht-echt", "12345", "' OR 1=1 --", "%2e%2e", "00000000-0000-0000-0000-000000000000"],
    )
    def test_malformed_id_looks_the_same(self, probe_client, scenario, malformed_id: str) -> None:  # type: ignore[no-untyped-def]
        "Malformed, unknown, and foreign-private resources produce the same response."
        headers = auth(scenario["token_ben"])
        real = probe_client.get(_path(scenario, "private_anna"), headers=headers)
        malformed = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/{malformed_id}", headers=headers
        )
        assert malformed.status_code == 404
        assert malformed.json() == real.json()

    @pytest.mark.parametrize("malformed_id", ["../../etc/passwd", "a/b"])
    def test_broken_path_also_remains_404(self, probe_client, scenario, malformed_id: str) -> None:  # type: ignore[no-untyped-def]
        """A slash no longer matches the route and receives the generic 404 response.

        This is not an existence oracle: the response difference depends on the
        URL form chosen by the caller, not on whether a resource exists.
        """
        response = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/{malformed_id}",
            headers=auth(scenario["token_ben"]),
        )
        assert response.status_code == 404
        assert CANARY_ANNA not in response.text

    def test_list_hides_partner_private_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes",
            headers=auth(scenario["token_ben"]),
        )
        assert {row["label"] for row in response.json()} == {CANARY_BEN, "Gemeinsam von Anna"}
        assert CANARY_ANNA not in response.text

    def test_result_count_does_not_reveal_private_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        "A count is itself a disclosure."
        response = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/count",
            headers=auth(scenario["token_ben"]),
        )
        assert response.json()["total"] == 2

    def test_cannot_change_partner_private_row(self, probe_client, session, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.patch(
            _path(scenario, "private_anna"),
            headers=auth(scenario["token_ben"]),
            json={"label": "uebernommen"},
        )
        assert response.status_code == 404
        session.refresh(scenario["private_anna"])
        assert scenario["private_anna"].label == CANARY_ANNA

    def test_cannot_delete_partner_private_row(self, probe_client, session, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.delete(
            _path(scenario, "private_anna"), headers=auth(scenario["token_ben"])
        )
        assert response.status_code == 404
        assert response.json()["code"] == "PRIVACY_PROBE_NOT_FOUND"
        session.refresh(scenario["private_anna"])
        assert scenario["private_anna"].label == CANARY_ANNA

    def test_may_read_shared_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        response = probe_client.get(
            _path(scenario, "shared_anna"), headers=auth(scenario["token_ben"])
        )
        assert response.status_code == 200
        assert response.json()["label"] == "Gemeinsam von Anna"

    def test_partner_may_not_change_shared_row(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        """This is 403 rather than 404 because the row is already visible to the partner.

        A 404 would provide no protection; it would contradict a resource the
        same caller can already read.
        """
        response = probe_client.patch(
            _path(scenario, "shared_anna"),
            headers=auth(scenario["token_ben"]),
            json={"label": "uebernommen"},
        )
        assert response.status_code == 403
        assert response.json()["code"] == "NOT_RESOURCE_OWNER"


class TestForeignSpace:
    def test_cannot_access_probes_of_foreign_space(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        "The tenant guard responds first; the path already fails here."
        response = probe_client.get(
            _path(scenario, "private_anna"), headers=auth(scenario["token_carol"])
        )
        assert response.status_code == 404
        assert response.json()["code"] == "SPACE_NOT_FOUND"

    def test_foreign_id_in_own_space_remains_undiscoverable(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        "The ID really exists, but not in this space."
        headers = auth(scenario["token_anna"])
        foreign = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/{scenario['private_carol'].id}",
            headers=headers,
        )
        invented = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/{new_id()}", headers=headers
        )
        assert foreign.status_code == invented.status_code == 404
        assert foreign.json() == invented.json()

    def test_no_foreign_content_in_list_or_count(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        headers = auth(scenario["token_anna"])
        list_response = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes", headers=headers
        )
        count_response = probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes/count", headers=headers
        )
        assert CANARY_FOREIGN not in list_response.text
        assert CANARY_BEN not in list_response.text
        assert count_response.json()["total"] == 2


class TestAnonymous:
    def test_without_token_has_no_access(self, probe_client, scenario) -> None:  # type: ignore[no-untyped-def]
        assert probe_client.get(_path(scenario, "private_anna")).status_code == 401
        assert (
            probe_client.get(f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes").status_code
            == 401
        )


class TestFilterInQuery:
    """Filter in the database rather than loading rows and filtering afterwards.

    A row that is loaded and then discarded has already crossed an isolation
    boundary and can affect storage, logs, or response-size side channels.
    """

    @pytest.fixture
    def queries(self, engine: Engine):  # type: ignore[no-untyped-def]
        recorded: list[str] = []

        def _record(conn, cursor, statement, parameters, context, executemany) -> None:  # type: ignore[no-untyped-def]
            recorded.append(statement)

        event.listen(engine, "before_cursor_execute", _record)
        try:
            yield recorded
        finally:
            event.remove(engine, "before_cursor_execute", _record)

    def test_private_row_is_not_loaded_initially(self, probe_client, scenario, queries) -> None:  # type: ignore[no-untyped-def]
        queries.clear()
        response = probe_client.get(
            _path(scenario, "private_anna"), headers=auth(scenario["token_ben"])
        )
        assert response.status_code == 404

        probe_queries = [sql for sql in queries if "privacy_probes" in sql]
        assert probe_queries, "No query touched the privacy probe table."
        for sql in probe_queries:
            assert "privacy_class" in sql
            assert "owner_id" in sql
            assert "space_id" in sql

    def test_list_also_filters_in_database(self, probe_client, scenario, queries) -> None:  # type: ignore[no-untyped-def]
        queries.clear()
        probe_client.get(
            f"/api/v1/spaces/{scenario['alpha'].id}/privacy-probes",
            headers=auth(scenario["token_ben"]),
        )
        probe_queries = [sql for sql in queries if "privacy_probes" in sql]
        assert probe_queries
        for sql in probe_queries:
            assert "WHERE" in sql.upper()
            assert "privacy_class" in sql
            assert "owner_id" in sql

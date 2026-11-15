"""Personal language ownership, concurrency, normalization and domain invariants."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy.orm import Session

from eimir.i18n import account_locale
from eimir.identity.models import Account
from tests.conftest import auth, make_account, requires_database, sign_in

pytestmark = [pytest.mark.integration, requires_database]
PATH = "/api/v1/account/language-preference"


def test_personal_choice_is_free_independent_and_does_not_change_the_clock(
    client, session: Session
):  # type: ignore[no-untyped-def]
    first = make_account(session, "First")
    second = make_account(session, "Second")
    first_headers = auth(sign_in(session, first))
    second_headers = auth(sign_in(session, second))
    before = (first.timezone, first.birthday, first.display_name)
    initial = client.get(PATH, headers=first_headers)
    assert initial.status_code == 200
    assert initial.headers["cache-control"] == "private, no-store"
    assert initial.json() == {"preference": "auto", "effectiveLocale": "de", "version": 0}
    changed = client.put(
        PATH,
        headers={**first_headers, "If-Match": initial.headers["etag"]},
        json={"preference": "en-US", "deviceLanguages": ["de-DE"]},
    )
    assert changed.status_code == 200
    assert changed.json() == {"preference": "en", "effectiveLocale": "en", "version": 1}
    session.refresh(first)
    assert (first.timezone, first.birthday, first.display_name) == before
    assert account_locale(first) == "en"
    assert client.get(PATH, headers=second_headers).json()["preference"] == "auto"
    assert client.get("/api/v1/auth/me", headers=first_headers).json()["languagePreference"] == "en"


def test_automatic_mode_resolves_the_ordered_device_list_and_rejects_a_stale_write(client, session):  # type: ignore[no-untyped-def]
    account = make_account(session)
    headers = auth(sign_in(session, account))
    first = client.put(
        PATH,
        headers={**headers, "If-Match": '"0"'},
        json={"preference": "auto", "deviceLanguages": ["zz-ZZ", "en-GB", "de-CH"]},
    )
    assert first.status_code == 200
    assert first.json()["effectiveLocale"] == "en"
    stale = client.put(PATH, headers={**headers, "If-Match": '"0"'}, json={"preference": "de"})
    assert stale.status_code == 409
    assert client.get(PATH, headers=headers).json() == first.json()
    fallback = client.put(
        PATH,
        headers={**headers, "If-Match": first.headers["etag"]},
        json={"preference": "auto", "deviceLanguages": ["zz-ZZ", "qaa"]},
    )
    assert fallback.status_code == 200
    assert fallback.json()["effectiveLocale"] == "de"


@pytest.mark.parametrize(
    "payload",
    [
        {"preference": "zz"},
        {"preference": "de<script>"},
        {"preference": "en", "accountId": "foreign"},
        {"preference": "en", "timezone": "Pacific/Auckland"},
        {"preference": "auto", "deviceLanguages": ["de"] * 21},
    ],
)
def test_invalid_or_cross_account_payload_does_not_write(client, session, payload):  # type: ignore[no-untyped-def]
    account = make_account(session)
    headers = auth(sign_in(session, account))
    response = client.put(PATH, headers={**headers, "If-Match": '"0"'}, json=payload)
    assert response.status_code == 422
    session.refresh(account)
    assert account.language_preference == "auto"
    assert account.language_version == 0


def test_anonymous_caller_cannot_read_or_change_a_preference(client):  # type: ignore[no-untyped-def]
    assert client.get(PATH).status_code == 401
    assert (
        client.put(PATH, headers={"If-Match": '"0"'}, json={"preference": "en"}).status_code == 401
    )


def test_concurrent_choices_have_one_winner(production_client):  # type: ignore[no-untyped-def]
    client, maker = production_client
    with maker() as setup:
        account = make_account(setup)
        account_id = account.id
        headers = auth(sign_in(setup, account))
        setup.commit()
    start = Barrier(2)

    def write(preference: str):  # type: ignore[no-untyped-def]
        start.wait(timeout=5)
        return client.put(
            PATH, headers={**headers, "If-Match": '"0"'}, json={"preference": preference}
        )

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(write, ["de", "en"]))
    assert sorted(response.status_code for response in responses) == [200, 409]
    winner = next(response.json() for response in responses if response.status_code == 200)
    with maker() as verifier:
        current = verifier.get(Account, account_id)
        assert current is not None
        assert current.language_version == 1
        assert current.language_preference == winner["preference"]

"""Service mail: complete text part, localized HTML, truthful legal footer."""

from __future__ import annotations

import json
import smtplib
from datetime import timedelta
from email import message_from_bytes, policy
from html.parser import HTMLParser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import pytest

from eimir.config import get_settings
from eimir.i18n import catalogs, text
from eimir.mail import MailMessage, SmtpMailSender
from eimir.mail.account_mail import deletion_confirmation_mail, notification_mail
from eimir.mail.auth_mail import AuthMailKind, auth_mail
from eimir.mail.service_mail import DARK, LIGHT

LINK = "https://eimir.example/auth/signup?token=abc_DEF-123&x=%3Cscript%3E"
TOKENS = Path(__file__).resolve().parents[3] / "design" / "tokens.json"

LIFETIMES = {
    AuthMailKind.SIGN_IN: timedelta(minutes=15),
    AuthMailKind.SIGN_UP: timedelta(minutes=15),
    AuthMailKind.VERIFY_EMAIL: timedelta(hours=24),
    AuthMailKind.RECOVERY: timedelta(minutes=30),
}


def _configure(monkeypatch: pytest.MonkeyPatch, *, cloud: bool, **update: str) -> None:
    settings = get_settings().model_copy(
        update={"public_base_url": "https://eimir.example", **update}
    )
    monkeypatch.setattr("eimir.mail.service_mail.get_settings", lambda: settings)
    monkeypatch.setattr("eimir.legal.terms.required_terms_version", lambda: "v1" if cloud else None)


class _Collector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.tags: list[str] = []
        self.attributes: list[tuple[str, str | None]] = []
        self.text: list[str] = []
        self.root_language: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.tags.append(tag)
        self.attributes.extend(attrs)
        if tag == "html":
            self.root_language = dict(attrs).get("lang")

    def handle_data(self, data: str) -> None:
        self.text.append(data)


def _parse(html: str) -> _Collector:
    collector = _Collector()
    collector.feed(html)
    return collector


@pytest.mark.parametrize("language", ["de", "en"])
@pytest.mark.parametrize("kind", list(AuthMailKind))
def test_every_message_has_text_and_html_with_the_same_link(
    monkeypatch: pytest.MonkeyPatch, kind: AuthMailKind, language: str
) -> None:
    _configure(monkeypatch, cloud=True)
    message = auth_mail(
        kind, to="a@example.org", locale=language, url=LINK, lifetime=LIFETIMES[kind]
    )

    assert message.language == language
    assert message.html is not None
    # First line starting with the scheme is the action link: clients, tests and
    # the development log all rely on it.
    assert next(line for line in message.body.splitlines() if line.startswith("https://")) == LINK
    parsed = _parse(message.html)
    assert parsed.root_language == language
    hrefs = [value for name, value in parsed.attributes if name == "href"]
    assert hrefs.count(LINK.replace("&", "&amp;")) == 0  # attributes are unescaped by the parser
    assert hrefs.count(LINK) == 2  # button and copyable fallback
    assert LINK not in message.html  # raw "&" must be escaped in markup
    assert "<script" not in message.html


@pytest.mark.parametrize("kind", list(AuthMailKind))
def test_html_loads_nothing_remote_and_does_not_track(
    monkeypatch: pytest.MonkeyPatch, kind: AuthMailKind
) -> None:
    _configure(monkeypatch, cloud=True)
    message = auth_mail(kind, to="a@example.org", locale="de", url=LINK, lifetime=LIFETIMES[kind])
    assert message.html is not None
    parsed = _parse(message.html)
    assert not {"img", "iframe", "script", "link", "video", "audio"} & set(parsed.tags)
    assert not [name for name, _ in parsed.attributes if name in {"src", "srcset", "background"}]
    assert "url(" not in message.html


@pytest.mark.parametrize(
    ("kind", "lifetime", "expected"),
    [
        (AuthMailKind.SIGN_UP, timedelta(minutes=15), "15 Minuten"),
        (AuthMailKind.RECOVERY, timedelta(minutes=30), "30 Minuten"),
        (AuthMailKind.VERIFY_EMAIL, timedelta(hours=24), "24 Stunden"),
        (AuthMailKind.SIGN_IN, timedelta(hours=1), "1 Stunde "),
        (AuthMailKind.SIGN_IN, timedelta(minutes=1), "1 Minute "),
    ],
)
def test_validity_names_the_real_lifetime(
    monkeypatch: pytest.MonkeyPatch, kind: AuthMailKind, lifetime: timedelta, expected: str
) -> None:
    _configure(monkeypatch, cloud=True)
    message = auth_mail(kind, to="a@example.org", locale="de", url=LINK, lifetime=lifetime)
    assert expected in message.body
    assert message.html is not None and expected in message.html


def test_cloud_footer_carries_provider_identity_and_all_legal_links(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(
        monkeypatch,
        cloud=True,
        legal_provider_name="Muster GmbH",
        legal_provider_address="Musterstraße 1, 12345 Musterstadt",
        legal_imprint_url="https://eimir.example/impressum",
        support_email="hilfe@eimir.example",
    )
    message = auth_mail(
        AuthMailKind.SIGN_UP,
        to="a@example.org",
        locale="de",
        url=LINK,
        lifetime=timedelta(minutes=15),
    )
    assert message.html is not None
    for expected in (
        "Anbieter: Muster GmbH, Musterstraße 1, 12345 Musterstadt",
        "Impressum: https://eimir.example/impressum",
        "Datenschutz: https://eimir.example/legal/privacy",
        "Nutzungsbedingungen: https://eimir.example/legal/terms",
        "hilfe@eimir.example",
        "Sie enthält keine Werbung",
    ):
        assert expected in message.body
    hrefs = [v for n, v in _parse(message.html).attributes if n == "href"]
    assert "https://eimir.example/impressum" in hrefs
    assert "https://eimir.example/legal/privacy" in hrefs
    assert "https://eimir.example/legal/terms" in hrefs
    assert "mailto:hilfe@eimir.example" in hrefs


def test_configured_legal_links_override_the_cloud_defaults(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(
        monkeypatch,
        cloud=True,
        legal_privacy_url="https://legal.example/datenschutz",
        legal_terms_url="https://legal.example/agb",
    )
    message = auth_mail(
        AuthMailKind.SIGN_IN,
        to="a@example.org",
        locale="de",
        url=LINK,
        lifetime=timedelta(minutes=15),
    )
    assert "https://legal.example/datenschutz" in message.body
    assert "https://legal.example/agb" in message.body
    assert "/legal/privacy" not in message.body


def test_self_hosted_without_configuration_shows_no_invented_legal_facts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure(monkeypatch, cloud=False)
    message = auth_mail(
        AuthMailKind.SIGN_IN,
        to="a@example.org",
        locale="de",
        url=LINK,
        lifetime=timedelta(minutes=15),
    )
    assert message.html is not None
    for absent in ("Anbieter", "Impressum", "Datenschutz", "Nutzungsbedingungen", "Fragen?"):
        assert absent not in message.body
        assert absent not in message.html
    # The sign-in essentials remain.
    assert "15 Minuten" in message.body
    assert "Das warst nicht du?" in message.body


def test_message_never_reveals_whether_an_account_exists(monkeypatch: pytest.MonkeyPatch) -> None:
    """Sign-up mail goes to known and unknown addresses; the copy must fit both."""
    _configure(monkeypatch, cloud=True)
    message = auth_mail(
        AuthMailKind.SIGN_UP,
        to="a@example.org",
        locale="de",
        url=LINK,
        lifetime=timedelta(minutes=15),
    )
    assert "Hast du schon ein Konto?" in message.body
    assert "Willkommen zurück" not in message.body


def test_markup_in_configured_text_is_escaped(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch, cloud=True, legal_provider_name="<b>Evil</b> & Co")
    message = auth_mail(
        AuthMailKind.SIGN_UP,
        to="a@example.org",
        locale="de",
        url=LINK,
        lifetime=timedelta(minutes=15),
    )
    assert message.html is not None
    assert "<b>Evil</b>" not in message.html
    assert "&lt;b&gt;Evil&lt;/b&gt; &amp; Co" in message.html


def test_unknown_locale_falls_back_to_german(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure(monkeypatch, cloud=True)
    message = auth_mail(
        AuthMailKind.SIGN_IN,
        to="a@example.org",
        locale="zz",
        url=LINK,
        lifetime=timedelta(minutes=15),
    )
    assert message.language == "de"


def test_every_kind_has_complete_copy_in_every_locale() -> None:
    for language, messages in catalogs().items():
        for kind in AuthMailKind:
            for part in ("subject", "preheader", "heading", "intro", "button", "reason", "ignore"):
                assert messages[f"auth.{kind.value}.{part}"].strip(), (language, kind, part)


def _tokens() -> dict[str, Any]:
    scheme: dict[str, Any] = json.loads(TOKENS.read_text(encoding="utf-8"))["color"]["scheme"]
    return scheme


def _resolve(scheme: dict[str, Any], name: str) -> str:
    value: str = scheme[name]["$value"]
    while value.startswith("{"):
        value = _resolve(_tokens()[value.split(".")[2]], value.split(".")[3].rstrip("}"))
    return value.upper()


@pytest.mark.parametrize(
    ("palette", "scheme", "mapping"),
    [
        (
            LIGHT,
            "light",
            {
                "background": "background",
                "card": "surfaceRaised",
                "card_tint": "surface",
                "text_primary": "textPrimary",
                "text_secondary": "textSecondary",
                "border": "border",
                "action": "actionEmphasis",
                "on_action": "onActionEmphasis",
                "link": "link",
                "brand_dot": "brand",
            },
        ),
        (
            DARK,
            "dark",
            {
                "background": "background",
                "card": "surfaceRaised",
                "card_tint": "surface",
                "text_primary": "textPrimary",
                "text_secondary": "textSecondary",
                "border": "border",
                "action": "actionEmphasis",
                "on_action": "onActionEmphasis",
                "link": "link",
                # The web dot uses the dim dark brand tone; mail uses the link tone
                # so the wordmark stays legible on the dark card.
                "brand_dot": "link",
            },
        ),
    ],
)
def test_palette_mirrors_the_design_tokens(
    palette: Any, scheme: str, mapping: dict[str, str]
) -> None:
    tokens = _tokens()[scheme]
    for attribute, token in mapping.items():
        assert getattr(palette, attribute).upper() == _resolve(tokens, token), attribute


class TestSmtpMultipart:
    def test_html_alternative_and_service_headers(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sent: list[Any] = []

        class FakeSmtp:
            def __init__(self, *args: Any, **kwargs: Any) -> None: ...
            def __enter__(self) -> FakeSmtp:
                return self

            def __exit__(self, *args: Any) -> None: ...
            def starttls(self) -> None: ...
            def login(self, *args: Any) -> None: ...
            def send_message(self, message: Any) -> None:
                sent.append(message)

        monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
        adapter = SmtpMailSender(
            host="smtp.example", port=587, sender_address="eimir. <no-reply@eimir.example>"
        )
        adapter.send(
            MailMessage(
                to="a@example.org",
                subject="Hallo ä",
                body="Nur Text ä",
                html="<p>Rich ä</p>",
                language="de",
            )
        )

        parsed = message_from_bytes(sent[0].as_bytes(), policy=policy.default)
        assert parsed.get_content_type() == "multipart/alternative"
        assert parsed.get_body(preferencelist=("plain",)).get_content().strip() == "Nur Text ä"  # type: ignore[union-attr]
        assert parsed.get_body(preferencelist=("html",)).get_content().strip() == "<p>Rich ä</p>"  # type: ignore[union-attr]
        assert parsed["Content-Language"] == "de"
        assert parsed["Auto-Submitted"] == "auto-generated"
        assert parsed["Date"]
        assert (
            urlsplit("//" + parsed["Message-ID"].strip("<>").split("@")[1]).hostname
            == "eimir.example"
        )

    def test_plain_message_stays_single_part(self, monkeypatch: pytest.MonkeyPatch) -> None:
        sent: list[Any] = []

        class FakeSmtp:
            def __init__(self, *args: Any, **kwargs: Any) -> None: ...
            def __enter__(self) -> FakeSmtp:
                return self

            def __exit__(self, *args: Any) -> None: ...
            def starttls(self) -> None: ...
            def send_message(self, message: Any) -> None:
                sent.append(message)

        monkeypatch.setattr(smtplib, "SMTP", FakeSmtp)
        SmtpMailSender(host="h", port=25, sender_address="no-reply@x.example").send(
            MailMessage(to="a@b.de", subject="s", body="b")
        )
        assert sent[0].get_content_type() == "text/plain"


class TestLegalSettings:
    def _build(self, **values: Any) -> Any:
        return type(get_settings())(**values)

    def test_identity_is_collapsed_to_one_line(self) -> None:
        settings = self._build(legal_provider_address=" Musterstraße 1,\n 12345   Musterstadt ")
        assert settings.legal_provider_address == "Musterstraße 1, 12345 Musterstadt"

    @pytest.mark.parametrize("field", ["legal_imprint_url", "legal_privacy_url", "legal_terms_url"])
    @pytest.mark.parametrize(
        "value", ["eimir.example/impressum", "javascript:alert(1)", "/impressum"]
    )
    def test_legal_links_must_be_absolute_web_addresses(self, field: str, value: str) -> None:
        with pytest.raises(ValueError):
            self._build(**{field: value})

    @pytest.mark.parametrize("value", ["hilfe", "hilfe@", "@eimir.example", "a b@eimir.example"])
    def test_support_address_must_be_an_email(self, value: str) -> None:
        with pytest.raises(ValueError):
            self._build(support_email=value)

    def test_unset_values_are_valid(self) -> None:
        settings = self._build()
        assert settings.legal_imprint_url == "" and settings.support_email == ""


class TestAccountMail:
    @pytest.mark.parametrize("language", ["de", "en"])
    def test_notification_is_neutral_and_links_only_to_the_app(
        self, monkeypatch: pytest.MonkeyPatch, language: str
    ) -> None:
        _configure(monkeypatch, cloud=True, support_email="hilfe@eimir.example")
        message = notification_mail(
            to="a@example.org", locale=language, app_url="https://eimir.example/"
        )
        assert message.html is not None
        assert message.subject == text("notification.subject", language)
        assert next(line for line in message.body.splitlines() if line.startswith("https://")) == (
            "https://eimir.example"
        )
        # No one-time link, so none of the token-specific blocks.
        for absent in ("Link gilt", "link is valid", "Sicherheitstipp", "Security tip"):
            assert absent not in message.body
        hrefs = [v for n, v in _parse(message.html).attributes if n == "href"]
        assert hrefs.count("https://eimir.example") == 1

    def test_deletion_confirmation_has_no_action_and_keeps_the_original_promise(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        _configure(monkeypatch, cloud=True)
        message = deletion_confirmation_mail(to="a@example.org", locale="de")
        assert message.html is not None
        assert message.subject == "Deine Kontolöschung wurde gestartet"
        assert "Du musst nichts weiter tun." in message.body
        assert "Die weitere Löschung läuft automatisch" in message.body
        assert "https://eimir.example/auth" not in message.body
        # Footer links are present, but there is no button or one-time link.
        hrefs = [v for n, v in _parse(message.html).attributes if n == "href"]
        assert all("token" not in (value or "") for value in hrefs)
        assert 'class="btn"' not in message.html

    @pytest.mark.parametrize("language", ["de", "en"])
    def test_deletion_confirmation_is_localized(
        self, monkeypatch: pytest.MonkeyPatch, language: str
    ) -> None:
        _configure(monkeypatch, cloud=False)
        message = deletion_confirmation_mail(to="a@example.org", locale=language)
        assert message.subject == text("deletion.subject", language)
        assert message.language == language

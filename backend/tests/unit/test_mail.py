"""Boundary to outgoing mail delivery."""

from __future__ import annotations

import io
import logging
import smtplib
from typing import Any

import pytest

from eimir.config import Environment, LogFormat, MailTransport, get_settings
from eimir.mail import LoggingMailSender, MailMessage, MailTransportError, SmtpMailSender
from eimir.observability.formatting import configure_logging


@pytest.fixture
def configured_log_stream():  # type: ignore[no-untyped-def]
    """Capture the real configured logging pipeline without leaking global state."""
    root_logger = logging.getLogger()
    mail_logger = logging.getLogger("eimir.mail.log")
    original_root_handlers = list(root_logger.handlers)
    original_root_level = root_logger.level
    original_mail_handlers = list(mail_logger.handlers)
    original_mail_level = mail_logger.level
    original_mail_propagate = mail_logger.propagate
    noisy_loggers = ("httpx", "httpx2", "httpcore", "urllib3")
    original_noisy_levels = {name: logging.getLogger(name).level for name in noisy_loggers}

    stream = io.StringIO()

    def configure(settings):  # type: ignore[no-untyped-def]
        configure_logging(settings)
        for logger in (root_logger, mail_logger):
            for handler in logger.handlers:
                if isinstance(handler, logging.StreamHandler):
                    handler.setStream(stream)
        return stream

    yield configure

    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)
        if handler not in original_root_handlers:
            handler.close()
    for handler in original_root_handlers:
        root_logger.addHandler(handler)
    root_logger.setLevel(original_root_level)

    for handler in list(mail_logger.handlers):
        mail_logger.removeHandler(handler)
        if handler not in original_mail_handlers:
            handler.close()
    for handler in original_mail_handlers:
        mail_logger.addHandler(handler)
    mail_logger.setLevel(original_mail_level)
    mail_logger.propagate = original_mail_propagate

    for name, level in original_noisy_levels.items():
        logging.getLogger(name).setLevel(level)


class TestMessage:
    def test_normal_message(self) -> None:
        message = MailMessage(to="anna@example.org", subject="Hallo", body="Text")
        assert message.to == "anna@example.org"

    @pytest.mark.parametrize(
        ("recipient", "subject"),
        [
            ("anna@example.org\nBcc: mit@example.org", "Hallo"),
            ("anna@example.org", "Hallo\r\nBcc: mit@example.org"),
        ],
    )
    def test_line_break_would_be_header_injection(self, recipient: str, subject: str) -> None:
        with pytest.raises(ValueError):
            MailMessage(to=recipient, subject=subject, body="Text")

    @pytest.mark.parametrize(("recipient", "subject"), [("", "Hallo"), ("a@b.de", "  ")])
    def test_empty_required_fields(self, recipient: str, subject: str) -> None:
        with pytest.raises(ValueError):
            MailMessage(to=recipient, subject=subject, body="Text")


class TestLogAdapter:
    def test_refuses_service_in_production(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """Otherwise a valid one-time token would appear in the log."""
        settings = get_settings().model_copy(update={"environment": Environment.PRODUCTION})
        monkeypatch.setattr("eimir.mail.log.get_settings", lambda: settings)

        with pytest.raises(RuntimeError):
            LoggingMailSender().send(MailMessage(to="a@b.de", subject="x", body="y"))

    def test_writes_message_in_development(self, caplog) -> None:  # type: ignore[no-untyped-def]
        with caplog.at_level("INFO"):
            LoggingMailSender().send(MailMessage(to="a@b.de", subject="x", body="link"))
        assert "link" in caplog.text

    @pytest.mark.parametrize(
        ("path", "token"),
        [
            ("auth/magic-link", "magic-link-token-123"),
            ("auth/verify-email", "verification-token-456"),
            ("auth/recovery", "recovery-token-789"),
        ],
    )
    @pytest.mark.parametrize("log_format", [LogFormat.TEXT, LogFormat.JSON])
    def test_auth_link_survives_configured_log_delivery(
        self,
        monkeypatch,  # type: ignore[no-untyped-def]
        configured_log_stream,  # type: ignore[no-untyped-def]
        path: str,
        token: str,
        log_format: LogFormat,
    ) -> None:
        settings = get_settings().model_copy(
            update={
                "environment": Environment.DEVELOPMENT,
                "mail_transport": MailTransport.LOG,
                "log_format": log_format,
            }
        )
        monkeypatch.setattr("eimir.mail.log.get_settings", lambda: settings)
        stream = configured_log_stream(settings)
        link = f"http://localhost:8080/{path}?token={token}"

        LoggingMailSender().send(
            MailMessage(to="operator@example.test", subject="Auth link", body=link)
        )

        output = stream.getvalue()
        assert link in output
        assert output.count(token) == 1

    def test_normal_application_log_still_redacts_action_token(
        self,
        configured_log_stream,  # type: ignore[no-untyped-def]
    ) -> None:
        settings = get_settings().model_copy(
            update={
                "environment": Environment.DEVELOPMENT,
                "mail_transport": MailTransport.LOG,
                "log_format": LogFormat.TEXT,
            }
        )
        stream = configured_log_stream(settings)
        token = "ordinary-log-token-123"
        link = f"http://localhost:8080/auth/magic-link?token={token}"

        logging.getLogger("eimir.auth.test").info("received link %s", link)

        output = stream.getvalue()
        assert token not in output
        assert "token=[REDACTED]" in output

    def test_mail_logger_is_redacted_when_transport_is_not_log(
        self,
        configured_log_stream,  # type: ignore[no-untyped-def]
    ) -> None:
        settings = get_settings().model_copy(
            update={
                "environment": Environment.TEST,
                "mail_transport": MailTransport.SMTP,
                "log_format": LogFormat.TEXT,
            }
        )
        stream = configured_log_stream(settings)
        token = "smtp-context-token-456"
        link = f"http://localhost:8080/auth/verify-email?token={token}"

        logging.getLogger("eimir.mail.log").info("mail body:\n%s", link)

        output = stream.getvalue()
        assert token not in output
        assert "token=[REDACTED]" in output


class TestSmtpAdapter:
    def test_delivery_failure_becomes_its_own_type(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        """The caller can recognize a delivery failure without text matching."""

        def broken(*args: Any, **kwargs: Any) -> None:
            raise smtplib.SMTPException("no server")

        monkeypatch.setattr(smtplib, "SMTP", broken)
        adapter = SmtpMailSender(host="localhost", port=25, sender_address="no-reply@localhost")

        with pytest.raises(MailTransportError):
            adapter.send(MailMessage(to="a@b.de", subject="x", body="y"))

    def test_network_failure_becomes_the_same_type(self, monkeypatch) -> None:  # type: ignore[no-untyped-def]
        def broken(*args: Any, **kwargs: Any) -> None:
            raise OSError("no route")

        monkeypatch.setattr(smtplib, "SMTP", broken)
        adapter = SmtpMailSender(host="localhost", port=25, sender_address="no-reply@localhost")

        with pytest.raises(MailTransportError):
            adapter.send(MailMessage(to="a@b.de", subject="x", body="y"))

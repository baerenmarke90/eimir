"""SMTP mail adapter.

Uses ``smtplib`` from the standard library. A separate client dependency would
add little value for a protocol Python already provides.
"""

from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from eimir.mail.base import MailMessage, MailSender, MailTransportError

log = logging.getLogger(__name__)

TIMEOUT_SECONDS = 15.0
"""A stalled mail server must not hold a request indefinitely."""


class SmtpMailSender(MailSender):
    def __init__(
        self,
        *,
        host: str,
        port: int,
        username: str = "",
        password: str = "",
        use_starttls: bool = True,
        sender_address: str,
    ) -> None:
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.use_starttls = use_starttls
        self.sender_address = sender_address

    def send(self, message: MailMessage) -> None:
        email_message = EmailMessage()
        email_message["From"] = self.sender_address
        email_message["To"] = message.to
        email_message["Subject"] = message.subject
        email_message.set_content(message.body)

        try:
            with smtplib.SMTP(self.host, self.port, timeout=TIMEOUT_SECONDS) as connection:
                if self.use_starttls:
                    connection.starttls()
                if self.username:
                    connection.login(self.username, self.password)
                connection.send_message(email_message)
        except (OSError, smtplib.SMTPException) as error:
            # Keep transport details behind this boundary so an error response
            # cannot expose provider text or recipient information.
            log.warning("mail transport failed", extra={"host": self.host})
            raise MailTransportError("The message could not be delivered.") from error

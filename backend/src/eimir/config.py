"""Load configuration from the environment.

No secret is stored in source code or a committed file. The defaults here are
development values; production must override them, and startup fails closed
where a missing value would be security-relevant.
"""

from __future__ import annotations

import json
import re
from datetime import timedelta
from enum import StrEnum
from functools import lru_cache
from typing import Annotated, Self
from urllib.parse import urlsplit

from pydantic import (
    AfterValidator,
    BaseModel,
    BeforeValidator,
    Field,
    SecretStr,
    field_validator,
    model_validator,
)
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    NoDecode,
    PydanticBaseSettingsSource,
    SettingsConfigDict,
)

from eimir.security.errors import EncryptionConfigurationError
from eimir.security.keyring import EncryptionMode, build_key_ring


class Deployment(StrEnum):
    """Deployment mode. The same core uses different adapters."""

    CLOUD = "cloud"
    SELF_HOSTED = "self_hosted"


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    DEMO = "demo"
    PRODUCTION = "production"


class MediaStoreBackend(StrEnum):
    """Infrastructure adapter used to store media physically."""

    LOCAL = "local"
    S3 = "s3"


class MailTransport(StrEnum):
    """How outgoing mail leaves the application.

    ``LOG`` is the development path and writes the message to the log,
    including its one-time token. It is therefore forbidden in production.

    ``NONE`` explicitly disables mail delivery. Mail-dependent authentication
    flows are then unavailable and report that condition instead of issuing a
    link that can never be delivered. Password, passkey, and OIDC sign-in remain
    available. The distinction from ``LOG`` is critical: ``NONE`` never lets a
    token leave the system, while ``LOG`` writes valid one-time tokens to every
    configured log sink.
    """

    LOG = "log"
    SMTP = "smtp"
    NONE = "none"


class LogFormat(StrEnum):
    """Structured logging serialization format."""

    TEXT = "text"
    JSON = "json"


class OidcConnection(BaseModel):
    """A configured OIDC connection.

    ``id`` selects the connection in the path; it is freely assigned and has no
    protocol meaning. A provider is therefore configuration rather than a code
    special case, including Pocket ID.
    """

    id: str = Field(min_length=1, max_length=64)
    issuer: str = Field(min_length=1, max_length=512)
    client_id: str = Field(min_length=1, max_length=256)
    client_secret: SecretStr | None = None
    redirect_uri: str = Field(min_length=1, max_length=512)
    # Optional native-app callback registered with the provider. The client may
    # select only this preconfigured URI; it can never supply an arbitrary redirect.
    android_redirect_uri: str | None = Field(default=None, min_length=1, max_length=512)
    scopes: str = "openid email profile"

    @field_validator("issuer")
    @classmethod
    def issuer_is_https(cls, value: str) -> str:
        """Without TLS the entire verification chain would be worthless.

        The discovery document, JWKS, and token endpoint would otherwise come
        from a peer that anyone on the path could replace.
        """
        address = value.rstrip("/")
        if not address.startswith("https://"):
            raise ValueError("An OIDC issuer must start with https://.")
        return address


# The default points to the ``dev-db`` profile in the canonical ``compose.yaml``.
# It lives here once because two configurations need it and divergence between
# the two would otherwise be easy to miss.
DEFAULT_DATABASE_URL = "postgresql+psycopg://sidebyside:sidebyside@localhost:5432/sidebyside"


def _database_url_is_usable(value: str) -> str:
    """An empty environment value is an error, not a request for the default."""
    if not value.strip():
        raise ValueError("EIMIR_DATABASE_URL is empty.")
    return value


_DatabaseUrl = Annotated[str, AfterValidator(_database_url_is_usable)]

_DEMO_RESET_INTERVAL_PATTERN = re.compile(r"^(?P<value>[1-9][0-9]*)(?P<unit>[mhd])$")


def _demo_reset_interval(value: object) -> timedelta:
    """Parse a compact reset interval such as ``30m``, ``6h`` or ``1d``."""
    if isinstance(value, timedelta):
        interval = value
    else:
        match = _DEMO_RESET_INTERVAL_PATTERN.fullmatch(str(value).strip().lower())
        if match is None:
            raise ValueError("EIMIR_DEMO_MODE_RESET_INTERVAL must look like 30m, 6h or 1d.")
        amount = int(match.group("value"))
        unit = match.group("unit")
        if unit == "m":
            interval = timedelta(minutes=amount)
        elif unit == "h":
            interval = timedelta(hours=amount)
        else:
            interval = timedelta(days=amount)

    if interval < timedelta(minutes=5) or interval > timedelta(days=7):
        raise ValueError("EIMIR_DEMO_MODE_RESET_INTERVAL must be between 5m and 7d.")
    return interval


_DemoResetInterval = Annotated[timedelta, BeforeValidator(_demo_reset_interval)]


class IdentityCompatibleSettings(BaseSettings):
    """Read canonical ``EIMIR_*`` settings before deprecated ``SBS_*`` aliases.

    The two sources are intentionally separate. This preserves normal Pydantic
    precedence (process environment before ``.env``) while ensuring that a
    canonical key always wins over its legacy alias in the same source.
    """

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        return (
            init_settings,
            env_settings,
            EnvSettingsSource(settings_cls, env_prefix="SBS_"),
            dotenv_settings,
            DotEnvSettingsSource(settings_cls, env_file=".env", env_prefix="SBS_"),
            file_secret_settings,
        )


class DatabaseSettings(IdentityCompatibleSettings):
    """Database connection only, for paths that do not run the application.

    A migration needs the database and nothing else. Loading the full
    ``Settings`` would make ``alembic upgrade head`` depend on cursor-key,
    SMTP, and public-URL validation that has nothing to do with the schema,
    potentially failing before the first revision runs.

    Deliberately neither a base class nor subtype of ``Settings``: inheritance
    would make both configurations converge again after the next extension.
    """

    model_config = SettingsConfigDict(env_prefix="EIMIR_", env_file=".env", extra="ignore")

    database_url: _DatabaseUrl = Field(default=DEFAULT_DATABASE_URL)


class Settings(IdentityCompatibleSettings):
    model_config = SettingsConfigDict(env_prefix="EIMIR_", env_file=".env", extra="ignore")

    environment: Environment = Environment.DEVELOPMENT
    deployment: Deployment = Deployment.SELF_HOSTED

    # A demo deployment is isolated from ordinary production data but remains
    # internet-facing, so Environment.DEMO receives the same hardening as
    # Environment.PRODUCTION. This explicit capability gates its public entry
    # route and optional reset scheduler.
    demo_mode: bool = False
    demo_mode_reset_timer: bool = False
    demo_mode_reset_interval: _DemoResetInterval = timedelta(hours=6)

    # No SQLite fallback: the data model uses PostgreSQL properties, and a
    # second test dialect would not verify what actually runs in production.
    database_url: _DatabaseUrl = Field(default=DEFAULT_DATABASE_URL)
    database_echo: bool = False

    media_store: MediaStoreBackend = MediaStoreBackend.LOCAL
    media_root: str = "./data/media"
    s3_endpoint: str = ""
    s3_region: str = "us-east-1"
    s3_bucket: str = ""
    s3_access_key_id: SecretStr | None = None
    s3_secret_access_key: SecretStr | None = None
    s3_session_token: SecretStr | None = None

    # Application-controlled encryption at rest (issue #797, docs/ENCRYPTION-AT-REST.md).
    # Not end-to-end encryption: this process holds the keys.
    #
    # ``encryption_at_rest`` has NO default in production: an operator must choose
    # ``required`` (or, Self-Hosted only, an explicit ``migrating``/``disabled``).
    # Outside production an unset value means ``disabled`` unless keys are present,
    # in which case the mode must be stated too, so keys can never sit next to a
    # silently plaintext configuration.
    encryption_at_rest: EncryptionMode | None = None
    # ``{key_id: base64 32-byte key}``. Key material comes from the operator's
    # secret store; nothing in the repository or image supplies it.
    encryption_keys: Annotated[dict[str, SecretStr], NoDecode] = Field(default_factory=dict)
    encryption_active_key_id: str | None = None

    # Keyset cursors leave the server as opaque HMAC-protected tokens. An
    # installation-specific key prevents manipulation and must not be derived
    # from the database password, bootstrap token, or other secrets.
    # Development and test use a local fallback only.
    cursor_signing_key: SecretStr | None = None

    # In production the Host header helps determine the public address for a
    # response. An open "*" would allow DNS rebinding and accidentally
    # reachable alternate addresses.
    allowed_hosts: list[str] = Field(default_factory=lambda: ["localhost", "127.0.0.1"])

    # Used only for one-time initialization of a fresh self-hosted instance.
    # SecretStr prevents a Settings repr from exposing the value.
    bootstrap_token: SecretStr | None = None

    # Instance-wide ServerAdmin authorization is configured by the operator,
    # never inferred from Space membership. Only verified AccountEmail rows can
    # satisfy this allowlist at request time.
    server_admin_emails: list[str] = Field(default_factory=list)

    # Public address of this instance. It appears in every magic link and must
    # not come from a request header; otherwise a forged Host header could make
    # the link point to an attacker-controlled server.
    public_base_url: str = "http://localhost:8000"

    # JSON list in an environment variable so multiple providers can coexist
    # without code changes.
    oidc_connections: list[OidcConnection] = Field(default_factory=list)

    # The relying party is the application for which a passkey is valid. When
    # unset it is derived from the public address; a passkey for "app.example"
    # must not be valid for "evil.example".
    webauthn_rp_id: str = ""
    webauthn_rp_name: str = "eimir."
    webauthn_origins: list[str] = Field(default_factory=list)

    mail_transport: MailTransport = MailTransport.LOG
    mail_from: str = "no-reply@localhost"
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: SecretStr | None = None
    smtp_starttls: bool = True

    # UnifiedPush uses Web Push for the server-to-distributor hop. No provider
    # is active until an operator configures a VAPID key and explicit origins.
    push_vapid_private_key: SecretStr | None = None
    push_vapid_subject: str = ""
    push_webpush_allowed_origins: list[str] = Field(default_factory=list)

    # Observability and logging configuration.
    log_format: LogFormat | None = None
    log_level: str = "INFO"

    @field_validator(
        "bootstrap_token",
        "cursor_signing_key",
        "s3_access_key_id",
        "s3_secret_access_key",
        "s3_session_token",
        "encryption_at_rest",
        "encryption_active_key_id",
        "push_vapid_private_key",
        mode="before",
    )
    @classmethod
    def empty_secret_is_unset(cls, value: object) -> object | None:
        return None if value == "" else value

    @field_validator("encryption_keys", mode="before")
    @classmethod
    def encryption_keys_from_json(cls, value: object) -> object:
        """Accept the JSON object from the environment; blank means no keys.

        Compose passes an unset variable as an empty string, and pydantic-settings
        would otherwise fail JSON-decoding it with a message that echoes the value.
        """
        if isinstance(value, str):
            if not value.strip():
                return {}
            try:
                return json.loads(value)
            except ValueError:
                raise ValueError(
                    "EIMIR_ENCRYPTION_KEYS must be a JSON object of key id to base64 key."
                ) from None
        return value

    @field_validator("server_admin_emails")
    @classmethod
    def server_admin_email_allowlist_is_valid(cls, value: list[str]) -> list[str]:
        """Normalize the operator-managed ServerAdmin identity allowlist."""
        normalized: list[str] = []
        seen: set[str] = set()
        for raw_address in value:
            address = raw_address.strip().lower()
            local_part, separator, domain = address.partition("@")
            if (
                not separator
                or not local_part
                or "." not in domain
                or domain.startswith(".")
                or len(address) > 320
            ):
                raise ValueError("EIMIR_SERVER_ADMIN_EMAILS contains an invalid email address.")
            if address not in seen:
                normalized.append(address)
                seen.add(address)
        return normalized

    @property
    def encryption_mode(self) -> EncryptionMode:
        """The effective mode. Production never reaches the ``disabled`` default."""
        if self.encryption_at_rest is not None:
            return self.encryption_at_rest
        return EncryptionMode.DISABLED

    @property
    def is_production(self) -> bool:
        """Whether public-runtime hardening is mandatory."""
        return self.environment in {Environment.DEMO, Environment.PRODUCTION}

    @property
    def effective_log_format(self) -> LogFormat:
        """Log serialization format, defaulting to JSON in production and TEXT locally."""
        if self.log_format is not None:
            return self.log_format
        if self.is_production:
            return LogFormat.JSON
        return LogFormat.TEXT

    @property
    def cursor_signing_secret(self) -> bytes:
        if self.cursor_signing_key is not None:
            return self.cursor_signing_key.get_secret_value().encode("utf-8")
        if self.is_production:
            raise RuntimeError("Production cursor signing key is missing.")
        return b"eimir-development-only-cursor-signing-key"

    @property
    def relying_party_id(self) -> str:
        """RP ID, defaulting to the host of the public address."""
        if self.webauthn_rp_id:
            return self.webauthn_rp_id
        return urlsplit(self.public_base_url).hostname or "localhost"

    @property
    def relying_party_origins(self) -> list[str]:
        """Origins that may prove a ceremony."""
        if self.webauthn_origins:
            return self.webauthn_origins
        return [self.public_base_url.rstrip("/")]

    def oidc_connection(self, connection_id: str) -> OidcConnection | None:
        for connection in self.oidc_connections:
            if connection.id == connection_id:
                return connection
        return None

    @model_validator(mode="after")
    def demo_mode_matches_environment(self) -> Self:
        if self.environment is Environment.DEMO and not self.demo_mode:
            raise ValueError("EIMIR_ENVIRONMENT=demo requires EIMIR_DEMO_MODE=true.")
        if self.environment is Environment.PRODUCTION and self.demo_mode:
            raise ValueError(
                "EIMIR_DEMO_MODE must not be enabled on the ordinary production environment."
            )
        if self.demo_mode_reset_timer and not self.demo_mode:
            raise ValueError("EIMIR_DEMO_MODE_RESET_TIMER requires EIMIR_DEMO_MODE=true.")
        return self

    @model_validator(mode="after")
    def media_store_is_complete(self) -> Self:
        if self.media_store is MediaStoreBackend.LOCAL:
            return self

        required = {
            "EIMIR_S3_ENDPOINT": self.s3_endpoint,
            "EIMIR_S3_REGION": self.s3_region,
            "EIMIR_S3_BUCKET": self.s3_bucket,
            "EIMIR_S3_ACCESS_KEY_ID": self.s3_access_key_id,
            "EIMIR_S3_SECRET_ACCESS_KEY": self.s3_secret_access_key,
        }
        missing = [name for name, value in required.items() if not value]
        if missing:
            raise ValueError(f"S3 media store requires: {', '.join(missing)}.")

        endpoint = urlsplit(self.s3_endpoint.rstrip("/"))
        if (
            endpoint.scheme not in {"http", "https"}
            or not endpoint.hostname
            or endpoint.username is not None
            or endpoint.password is not None
            or endpoint.query
            or endpoint.fragment
            or endpoint.path not in {"", "/"}
        ):
            raise ValueError(
                "EIMIR_S3_ENDPOINT must be an http(s) origin without credentials or path."
            )
        if self.is_production and endpoint.scheme != "https":
            raise ValueError("Production and Demo require an https EIMIR_S3_ENDPOINT.")
        if "/" in self.s3_bucket:
            raise ValueError("EIMIR_S3_BUCKET must be a bucket name, not a path.")
        return self

    @model_validator(mode="after")
    def encryption_at_rest_is_consistent(self) -> Self:
        """Fail closed on every encryption misconfiguration, at startup."""
        production = self.environment is Environment.PRODUCTION
        if self.encryption_at_rest is None:
            if production:
                raise ValueError(
                    "Production requires an explicit EIMIR_ENCRYPTION_AT_REST "
                    "(required, or for Self-Hosted migrating/disabled)."
                )
            if self.encryption_keys:
                raise ValueError(
                    "EIMIR_ENCRYPTION_KEYS is set but EIMIR_ENCRYPTION_AT_REST is not; "
                    "state the mode explicitly instead of running unencrypted."
                )
            return self

        mode = self.encryption_at_rest
        if (
            production
            and self.deployment is Deployment.CLOUD
            and mode is not EncryptionMode.REQUIRED
        ):
            raise ValueError("Cloud Production requires EIMIR_ENCRYPTION_AT_REST=required.")
        if mode is EncryptionMode.DISABLED:
            if self.encryption_keys or self.encryption_active_key_id:
                raise ValueError(
                    "Encryption keys are configured but EIMIR_ENCRYPTION_AT_REST=disabled; "
                    "remove the keys or enable encryption."
                )
            return self

        if not self.encryption_keys or self.encryption_active_key_id is None:
            raise ValueError(
                f"EIMIR_ENCRYPTION_AT_REST={mode.value} requires EIMIR_ENCRYPTION_KEYS "
                "and EIMIR_ENCRYPTION_ACTIVE_KEY_ID."
            )
        try:
            build_key_ring(
                {
                    key_id: secret.get_secret_value()
                    for key_id, secret in self.encryption_keys.items()
                },
                self.encryption_active_key_id,
            )
        except EncryptionConfigurationError as error:
            # The message never contains key material.
            raise ValueError(str(error)) from None
        return self

    @model_validator(mode="after")
    def production_hosts_are_restricted(self) -> Self:
        if self.is_production and (not self.allowed_hosts or "*" in self.allowed_hosts):
            raise ValueError(
                "Production requires an explicit EIMIR_ALLOWED_HOSTS list without '*'."
            )
        if self.bootstrap_token is not None:
            secret = self.bootstrap_token.get_secret_value()
            if len(secret) < 32:
                raise ValueError("EIMIR_BOOTSTRAP_TOKEN must contain at least 32 characters.")
        if self.cursor_signing_key is not None:
            cursor_secret = self.cursor_signing_key.get_secret_value()
            if len(cursor_secret) < 32:
                raise ValueError("EIMIR_CURSOR_SIGNING_KEY must contain at least 32 characters.")
        if self.is_production and self.cursor_signing_key is None:
            raise ValueError("Production requires EIMIR_CURSOR_SIGNING_KEY.")
        return self

    @model_validator(mode="after")
    def production_sends_real_mail(self) -> Self:
        """Forbid log delivery and plaintext links in production logs.

        Failing startup is safer than silently running an instance that writes
        authentication proofs to logs.

        Only ``LOG`` is forbidden. An instance without mail delivery is a valid
        deployment mode: it sets ``NONE`` and explicitly gives up the
        mail-dependent sign-in paths. Production must not write valid one-time
        tokens to a log.
        """
        if self.is_production and self.mail_transport is MailTransport.LOG:
            raise ValueError(
                "Production requires EIMIR_MAIL_TRANSPORT=smtp or EIMIR_MAIL_TRANSPORT=none."
            )
        if self.is_production and not self.public_base_url.startswith("https://"):
            raise ValueError("Production requires an https EIMIR_PUBLIC_BASE_URL.")
        return self

    @model_validator(mode="after")
    def web_push_configuration_is_complete(self) -> Self:
        configured = bool(
            self.push_vapid_private_key
            or self.push_vapid_subject
            or self.push_webpush_allowed_origins
        )
        if not configured:
            return self
        if not (
            self.push_vapid_private_key
            and self.push_vapid_subject
            and self.push_webpush_allowed_origins
        ):
            raise ValueError(
                "Web Push requires EIMIR_PUSH_VAPID_PRIVATE_KEY, "
                "EIMIR_PUSH_VAPID_SUBJECT and EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS."
            )
        subject = urlsplit(self.push_vapid_subject)
        if not (
            (subject.scheme == "mailto" and subject.path and "@" in subject.path)
            or (subject.scheme == "https" and subject.hostname)
        ):
            raise ValueError("EIMIR_PUSH_VAPID_SUBJECT must be a mailto: or https: contact.")
        try:
            from py_vapid import Vapid  # type: ignore[import-untyped]

            Vapid.from_string(self.push_vapid_private_key.get_secret_value())
        except Exception:
            raise ValueError("EIMIR_PUSH_VAPID_PRIVATE_KEY is invalid.") from None
        for raw_origin in self.push_webpush_allowed_origins:
            try:
                origin = urlsplit(raw_origin)
                _ = origin.port
            except ValueError:
                raise ValueError(
                    "EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS must contain HTTPS origins only."
                ) from None
            if (
                origin.scheme != "https"
                or not origin.hostname
                or origin.username is not None
                or origin.password is not None
                or origin.path not in {"", "/"}
                or origin.query
                or origin.fragment
                or any(ord(character) < 33 or ord(character) == 127 for character in raw_origin)
            ):
                raise ValueError(
                    "EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS must contain HTTPS origins only."
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()

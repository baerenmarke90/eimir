#!/usr/bin/env python3
"""Prepare public Firebase Android build input and verify its compiled APK resources.

The JSON enters through EIMIR_ANDROID_GOOGLE_SERVICES_JSON, never a command-line
argument. It is client configuration, not the server's FCM service-account key.
An empty ANDROID_FIREBASE_PROJECT_ID explicitly selects an unconfigured build.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Any

APPLICATION_ID = "de.eimir.app"
CONFIGURATION_FILE = Path("android/app/google-services.json")
SERVER_CREDENTIAL_FIELDS = {
    "private_key",
    "private_key_id",
    "client_email",
    "client_secret",
    "client_x509_cert_url",
    "refresh_token",
    "access_token",
    "token_uri",
}


class ConfigurationError(ValueError):
    """Invalid public client input; messages must never include input values."""


def _reject_server_credentials(value: Any) -> None:
    if isinstance(value, dict):
        if (
            SERVER_CREDENTIAL_FIELDS.intersection(value)
            or value.get("type") == "service_account"
        ):
            raise ConfigurationError(
                "Server credentials must never be used as Android client configuration"
            )
        for item in value.values():
            _reject_server_credentials(item)
    elif isinstance(value, list):
        for item in value:
            _reject_server_credentials(item)
    elif isinstance(value, str) and re.search(
        r"-----BEGIN [A-Z ]*PRIVATE KEY-----", value
    ):
        raise ConfigurationError(
            "Private keys must never be used as Android client configuration"
        )


def validate_configuration(
    project_id: str, raw: str
) -> tuple[dict[str, Any], dict[str, str]]:
    if not re.fullmatch(r"[a-z][a-z0-9-]{4,28}[a-z0-9]", project_id):
        raise ConfigurationError(
            "android_firebase_project_id must be a valid Firebase project ID"
        )
    if not raw:
        raise ConfigurationError(
            "FCM builds require EIMIR_ANDROID_GOOGLE_SERVICES_JSON client configuration"
        )
    try:
        configuration = json.loads(raw)
    except (ValueError, RecursionError):
        raise ConfigurationError(
            "Firebase Android client configuration must be valid JSON"
        ) from None
    try:
        _reject_server_credentials(configuration)
    except RecursionError:
        raise ConfigurationError(
            "Firebase Android client configuration is nested too deeply"
        ) from None
    if not isinstance(configuration, dict):
        raise ConfigurationError(
            "Firebase Android client configuration must be a JSON object"
        )
    project = configuration.get("project_info")
    if not isinstance(project, dict) or project.get("project_id") != project_id:
        raise ConfigurationError(
            "Firebase Android client configuration does not match the requested project"
        )
    number = project.get("project_number")
    if not isinstance(number, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", number):
        raise ConfigurationError(
            "Firebase Android client configuration needs a project_number"
        )
    clients = configuration.get("client")
    if not isinstance(clients, list):
        raise ConfigurationError(
            "Firebase Android client configuration needs an Android client"
        )
    matching = []
    for client in clients:
        if not isinstance(client, dict):
            continue
        info = client.get("client_info")
        if not isinstance(info, dict):
            continue
        android = info.get("android_client_info")
        if isinstance(android, dict) and android.get("package_name") == APPLICATION_ID:
            matching.append(client)
    if len(matching) != 1:
        raise ConfigurationError(
            "Firebase Android client configuration must contain one de.eimir.app client"
        )
    client = matching[0]
    app_id = client["client_info"].get("mobilesdk_app_id")
    if not isinstance(app_id, str) or not re.fullmatch(
        rf"1:{number}:android:[0-9a-f]+", app_id
    ):
        raise ConfigurationError(
            "Firebase Android app ID must match the configured project number"
        )
    keys = client.get("api_key")
    if not isinstance(keys, list) or not keys:
        raise ConfigurationError(
            "Firebase Android client configuration needs a public API key"
        )
    key = keys[0].get("current_key") if isinstance(keys[0], dict) else None
    if not isinstance(key, str) or not re.fullmatch(r"AIza[0-9A-Za-z_-]{35}", key):
        raise ConfigurationError(
            "Firebase Android client configuration needs a valid public API key"
        )
    if configuration.get("configuration_version") != "1":
        raise ConfigurationError(
            "Firebase Android client configuration_version must be 1"
        )
    return configuration, {
        "google_app_id": app_id,
        "gcm_defaultSenderId": number,
        "project_id": project_id,
        "google_api_key": key,
    }


def prepare_configuration(
    project_id: str, raw: str, output: Path = CONFIGURATION_FILE
) -> bool:
    if output.exists() or output.is_symlink():
        raise ConfigurationError(
            "Refusing an existing Android Firebase build configuration"
        )
    if not project_id:
        return False
    configuration, _ = validate_configuration(project_id, raw)
    # O_EXCL rejects an existing file or symlink; 0600 applies before any bytes
    # are written, independently of the caller's umask.
    descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as target:
            json.dump(configuration, target, indent=2)
            target.write("\n")
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return True


def verify_apk_configuration(
    project_id: str,
    apk: Path,
    analyzer: Path,
    configuration_file: Path = CONFIGURATION_FILE,
) -> None:
    if not project_id:
        return
    try:
        raw = configuration_file.read_text(encoding="utf-8")
    except OSError:
        raise ConfigurationError(
            "Prepared Firebase Android build configuration is missing"
        ) from None
    _, expected = validate_configuration(project_id, raw)
    for name, value in expected.items():
        result = subprocess.run(
            [
                str(analyzer),
                "resources",
                "value",
                "--config",
                "default",
                "--type",
                "string",
                "--name",
                name,
                str(apk),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or result.stdout.strip() != value:
            raise ConfigurationError(
                f"Packaged Firebase Android resource {name} does not match the build input"
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("prepare")
    verify = subcommands.add_parser("verify-apk")
    verify.add_argument("apk", type=Path)
    verify.add_argument("--analyzer", type=Path, required=True)
    args = parser.parse_args()
    project_id = os.environ.get("ANDROID_FIREBASE_PROJECT_ID", "").strip()
    try:
        if (
            os.environ.get("ANDROID_PLAY_STORE_RELEASE", "false").lower() == "true"
            and not project_id
        ):
            raise ConfigurationError(
                "Play Store artifacts require an explicit Firebase project"
            )
        if args.command == "prepare":
            configured = prepare_configuration(
                project_id, os.environ.get("EIMIR_ANDROID_GOOGLE_SERVICES_JSON", "")
            )
            print(
                "Firebase Android client configuration prepared"
                if configured
                else "Android Firebase configuration disabled"
            )
        else:
            verify_apk_configuration(project_id, args.apk, args.analyzer)
            print(
                "Packaged Firebase Android configuration verified"
                if project_id
                else "Android Firebase configuration disabled"
            )
    except ConfigurationError as error:
        # All validation messages are fixed text; never include JSON, subprocess
        # output or provider keys in diagnostics.
        print(f"Android Firebase configuration refused: {error}", file=sys.stderr)
        return 1
    except OSError:
        print(
            "Android Firebase configuration could not be prepared or inspected",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

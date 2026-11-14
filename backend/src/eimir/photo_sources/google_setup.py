"""Print public Google Console setup values without contacting a provider."""

from __future__ import annotations

import argparse
import json

from eimir.config import get_settings
from eimir.photo_sources.service import google_import_available
from eimir.providers.google_photos_config import SCOPE, callback_uri, client_configuration
from eimir.providers.photo_transport import PhotoSourceError


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public-base-url", help="Exact public HTTPS eimir. origin.")
    parser.add_argument(
        "--check-config", action="store_true", help="Validate mounted/current OAuth configuration."
    )
    args = parser.parse_args(argv)
    result: dict[str, object] = {
        "provider": "Google Photos Picker API",
        "googleApiService": "photospicker.googleapis.com",
        "oauthClientType": "Web application",
        "scope": SCOPE,
        "authorization": "temporary user consent; no permanent connection",
        "capability": "integration.external_sync",
        "applicationImportAvailable": google_import_available(),
        "applicationAcceptanceIssue": "https://github.com/baerenmarke90/eimir/issues/1467",
        "configurationSource": "unconfigured",
        "configurationStatus": "NOT_CHECKED",
    }
    try:
        settings = get_settings() if args.check_config or not args.public_base_url else None
        origin = args.public_base_url or (settings.public_base_url if settings else "")
        result["authorizedRedirectUri"] = callback_uri(origin)
        if args.check_config:
            client = client_configuration(settings)
            if client.redirect_uri != result["authorizedRedirectUri"]:
                raise PhotoSourceError("PHOTO_SOURCE_CONFIGURATION_INVALID")
            result["configurationSource"] = (
                "mounted-web-client"
                if settings and settings.google_photos_web_client_file
                else "environment"
            )
            result["configurationStatus"] = "VALID"
    except (ValueError, OSError):
        # Pydantic and SDK errors can embed secrets. Only a fixed code is output.
        result["configurationStatus"] = "INVALID"
        print(json.dumps(result, indent=2))
        return 2
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

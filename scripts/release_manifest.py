#!/usr/bin/env python3
"""Build and verify the immutable eimir. release manifest.

The manifest consumes #193 release evidence. It does not build artifacts, sign
Android packages or infer database rollback safety. Cloud/Managed deployment
identity is derived from that same manifest and a resolved canonical Compose
configuration; it is deployment evidence, not a second product release identity.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import urllib.parse
from pathlib import Path, PurePosixPath
from typing import Any

SEMVER = re.compile(r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+([0-9A-Za-z.-]+))?$")
SHA40 = re.compile(r"^[0-9a-f]{40}$")
SHA256 = re.compile(r"^[0-9a-f]{64}$")
OCI_SHA256_REFERENCE = re.compile(r"^(?P<name>[^@\s]+)@sha256:(?P<digest>[0-9a-f]{64})$")
CORE_ARTIFACTS = {"backend-runtime", "web-runtime"}
ANDROID_ARTIFACTS = {"android-apk", "android-aab"}
REQUIRED_ARTIFACTS = CORE_ARTIFACTS | ANDROID_ARTIFACTS
BACKEND_ROLES = {"api", "worker", "migrate"}
CLOUD_BACKEND_SERVICES = ("cloud-api", "cloud-worker", "cloud-migrate")
CLOUD_WEB_SERVICE = "cloud-web"
CLOUD_SERVICES = {*CLOUD_BACKEND_SERVICES, CLOUD_WEB_SERVICE}
PRODUCT_NAME = "eimir."
LEGACY_PRODUCT_NAME = "SideBySide"
CLOUD_DEPLOYMENT_KIND = "eimir-cloud-deployment-identity"
LEGACY_CLOUD_DEPLOYMENT_KIND = "sidebyside-cloud-deployment-identity"


class ManifestError(ValueError):
    pass


def load_json(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ManifestError(f"Cannot read JSON from {path}: {exc}") from exc
    if not isinstance(value, dict):
        raise ManifestError(f"{path} must contain a JSON object")
    return value


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def safe_relative_path(value: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if path.is_absolute() or ".." in path.parts or not path.parts:
        raise ManifestError(f"Unsafe artifact path: {value!r}")
    return path


def require_semver(version: str) -> None:
    match = SEMVER.fullmatch(version)
    if match is None:
        raise ManifestError(f"Product version is not SemVer: {version!r}")
    if match.group(5) is not None:
        raise ManifestError(
            "Product version must not include SemVer build metadata because immutable OCI release tags do not permit '+'"
        )
    if len(f"v{version}") > 128:
        raise ManifestError(
            "Product version is too long for the immutable OCI release tag"
        )


def require_digest_image_reference(value: object, *, label: str) -> tuple[str, str]:
    """Return a normalized OCI reference and digest or fail closed.

    A tag may be present before ``@`` for operator readability, but the digest is
    mandatory. Tag-only references -- including SemVer tags -- are mutable and
    therefore never valid Cloud/Managed Production identity.
    """
    if not isinstance(value, str):
        raise ManifestError(f"{label} image reference must be a string")
    reference = value.strip()
    match = OCI_SHA256_REFERENCE.fullmatch(reference)
    if match is None:
        raise ManifestError(
            f"{label} image must be pinned as <registry/repository>@sha256:<64-hex-digest>; "
            "tag-only references are not immutable deployment identity"
        )
    return reference, f"sha256:{match.group('digest')}"


def cloud_images_from_compose(config: dict[str, Any]) -> tuple[str, str]:
    """Validate and extract exact Cloud/Managed image identities.

    The input is the JSON emitted by ``docker compose --profile cloud ... config
    --format json``. That makes the recorded identity the value Compose actually
    resolved after environment interpolation rather than a second hand-maintained
    deployment manifest.
    """
    services = config.get("services")
    if not isinstance(services, dict):
        raise ManifestError("Resolved Compose configuration has no services object")
    if set(services) != CLOUD_SERVICES:
        raise ManifestError(
            "Resolved Cloud Compose configuration must contain exactly cloud-api, "
            "cloud-worker, cloud-migrate and cloud-web"
        )

    backend_reference: str | None = None
    for service_name in CLOUD_BACKEND_SERVICES:
        service = services.get(service_name)
        if not isinstance(service, dict):
            raise ManifestError(f"Resolved Compose service {service_name} is invalid")
        if "build" in service:
            raise ManifestError(f"{service_name} must not have a source build fallback")
        reference, _ = require_digest_image_reference(
            service.get("image"), label=service_name
        )
        if backend_reference is None:
            backend_reference = reference
        elif reference != backend_reference:
            raise ManifestError(
                "cloud-api, cloud-worker and cloud-migrate must use the exact same backend image"
            )

    web = services.get(CLOUD_WEB_SERVICE)
    if not isinstance(web, dict):
        raise ManifestError("Resolved Compose service cloud-web is invalid")
    if "build" in web:
        raise ManifestError("cloud-web must not have a source build fallback")
    web_reference, _ = require_digest_image_reference(web.get("image"), label=CLOUD_WEB_SERVICE)

    assert backend_reference is not None
    return backend_reference, web_reference


def android_included(android: dict[str, Any]) -> bool:
    included = android.get("included", True)
    if not isinstance(included, bool):
        raise ManifestError("Android included flag must be boolean")
    return included


def validate_android_record(android: dict[str, Any], *, version: str | None = None) -> None:
    if not isinstance(android, dict):
        raise ManifestError("Evidence lacks Android release identity")

    if not android_included(android):
        if android.get("signing") != "not-applicable":
            raise ManifestError("Excluded Android channel must use signing=not-applicable")
        forbidden = {
            "applicationId",
            "versionName",
            "versionCode",
            "apiBaseUrl",
            "launchableActivity",
            "finalSignedArtifactRequiresFreshAttestation",
        }
        present = sorted(forbidden.intersection(android))
        if present:
            raise ManifestError(
                "Excluded Android channel must not carry Android artifact identity: "
                + ", ".join(present)
            )
        return

    if android.get("applicationId") != "de.sidebyside.app":
        raise ManifestError("Android release applicationId must remain de.sidebyside.app")
    if version is not None and android.get("versionName") != version:
        raise ManifestError(
            f"Android versionName {android.get('versionName')!r} does not match product version {version!r}"
        )
    version_code = android.get("versionCode")
    if not isinstance(version_code, int) or isinstance(version_code, bool) or version_code <= 0:
        raise ManifestError("Android versionCode must be a positive integer")

    if "apiBaseUrl" in android:
        url = android.get("apiBaseUrl")
        if not isinstance(url, str):
            raise ManifestError("Android apiBaseUrl must be a string")
        url = url.strip()
        if not url:
            raise ManifestError("Android apiBaseUrl must not be empty")
        if re.search(r"\s", url):
            raise ManifestError("Android apiBaseUrl must not contain whitespace")
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https":
            raise ManifestError("Android apiBaseUrl must use https scheme")
        if not parsed.netloc:
            raise ManifestError("Android apiBaseUrl must have non-empty host")
        if parsed.username or parsed.password:
            raise ManifestError("Android apiBaseUrl must not contain user credentials")
        if parsed.query or parsed.fragment:
            raise ManifestError("Android apiBaseUrl must not contain query or fragment")
        android["apiBaseUrl"] = url.rstrip("/")

    if "launchableActivity" in android:
        activity = android.get("launchableActivity")
        if activity != "de.eimir.app.MainActivity":
            raise ManifestError(
                f"Android launchableActivity must be de.eimir.app.MainActivity, got: {activity!r}"
            )


def validate_evidence(evidence: dict[str, Any], version: str) -> tuple[str, list[dict[str, Any]], dict[str, Any]]:
    require_semver(version)
    if evidence.get("schemaVersion") != 1:
        raise ManifestError("Unsupported #193 evidence schema")
    source = evidence.get("sourceRevision")
    if not isinstance(source, str) or not SHA40.fullmatch(source):
        raise ManifestError("Evidence sourceRevision must be one immutable 40-hex commit SHA")
    if evidence.get("sbomFormat") != "SPDX-2.3 JSON":
        raise ManifestError("Release evidence must use SPDX-2.3 JSON")

    android = evidence.get("android")
    if not isinstance(android, dict):
        raise ManifestError("Evidence lacks Android release identity")
    validate_android_record(android, version=version)
    include_android = android_included(android)

    artifacts = evidence.get("artifacts")
    if not isinstance(artifacts, list):
        raise ManifestError("Evidence artifacts must be a list")
    by_id: dict[str, dict[str, Any]] = {}
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            raise ManifestError("Every evidence artifact must be an object")
        artifact_id = artifact.get("id")
        if not isinstance(artifact_id, str) or artifact_id in by_id:
            raise ManifestError(f"Duplicate or invalid artifact id: {artifact_id!r}")
        safe_relative_path(str(artifact.get("path", "")))
        safe_relative_path(str(artifact.get("sbom", "")))
        if not SHA256.fullmatch(str(artifact.get("sha256", ""))):
            raise ManifestError(f"Invalid SHA-256 for {artifact_id}")
        if not SHA256.fullmatch(str(artifact.get("sbomSha256", ""))):
            raise ManifestError(f"Invalid SBOM SHA-256 for {artifact_id}")
        by_id[artifact_id] = artifact

    expected_artifacts = CORE_ARTIFACTS | (ANDROID_ARTIFACTS if include_android else set())
    if set(by_id) != expected_artifacts:
        if include_android:
            raise ManifestError(
                "Android-inclusive release evidence must contain exactly backend, Web, APK and AAB artifacts"
            )
        raise ManifestError(
            "Android-excluded release evidence must contain exactly backend and Web artifacts"
        )
    if set(by_id["backend-runtime"].get("roles", [])) != BACKEND_ROLES:
        raise ManifestError("Backend artifact must cover API, worker and migrate together")
    if set(by_id["web-runtime"].get("roles", [])) != {"web"}:
        raise ManifestError("Web artifact role is inconsistent")
    if include_android:
        if set(by_id["android-apk"].get("roles", [])) != {"android-apk"}:
            raise ManifestError("Android APK artifact role is inconsistent")
        if set(by_id["android-aab"].get("roles", [])) != {"android-aab"}:
            raise ManifestError("Android AAB artifact role is inconsistent")

    return source, [by_id[key] for key in sorted(by_id)], android


def previous_identity(path: Path | None, initial_release: bool) -> dict[str, Any] | None:
    if initial_release and path is not None:
        raise ManifestError("Initial release cannot also declare a previous-known-good manifest")
    if initial_release:
        return None
    if path is None:
        raise ManifestError("Non-initial release requires the previous-known-good release manifest")
    previous = load_json(path)
    validate_manifest_shape(
        previous,
        require_signed_android=True,
        allow_legacy_product_name=True,
    )
    product = previous["product"]
    return {
        "version": product["version"],
        "tag": product["tag"],
        "sourceRevision": previous["sourceRevision"],
        "manifestSha256": sha256(path),
    }


def validate_manifest_shape(
    manifest: dict[str, Any],
    *,
    require_signed_android: bool,
    allow_legacy_product_name: bool = False,
) -> None:
    if manifest.get("schemaVersion") != 1:
        raise ManifestError("Unsupported release-manifest schema")
    product = manifest.get("product")
    if not isinstance(product, dict):
        raise ManifestError("Release manifest has no product identity")
    allowed_names = {PRODUCT_NAME}
    if allow_legacy_product_name:
        allowed_names.add(LEGACY_PRODUCT_NAME)
    if product.get("name") not in allowed_names:
        raise ManifestError("Release manifest has the wrong product name")
    version = product.get("version")
    if not isinstance(version, str):
        raise ManifestError("Release version is missing")
    require_semver(version)
    if product.get("tag") != f"v{version}":
        raise ManifestError("Release tag must be exactly v<product-version>")
    source = manifest.get("sourceRevision")
    if not isinstance(source, str) or not SHA40.fullmatch(source):
        raise ManifestError("Release sourceRevision is not an immutable commit SHA")

    android = manifest.get("android")
    if not isinstance(android, dict):
        raise ManifestError("Release manifest lacks Android channel identity")
    validate_android_record(android, version=version)
    include_android = android_included(android)

    artifacts = manifest.get("artifacts")
    if not isinstance(artifacts, list):
        raise ManifestError("Release artifacts must be a list")
    ids = set()
    for artifact in artifacts:
        if not isinstance(artifact, dict):
            raise ManifestError("Invalid release artifact entry")
        artifact_id = artifact.get("id")
        ids.add(artifact_id)
        safe_relative_path(str(artifact.get("path", "")))
        safe_relative_path(str(artifact.get("sbom", "")))
        if not SHA256.fullmatch(str(artifact.get("sha256", ""))):
            raise ManifestError(f"Invalid release artifact SHA-256: {artifact_id}")
        if not SHA256.fullmatch(str(artifact.get("sbomSha256", ""))):
            raise ManifestError(f"Invalid release SBOM SHA-256: {artifact_id}")

    expected_artifacts = CORE_ARTIFACTS | (ANDROID_ARTIFACTS if include_android else set())
    if ids != expected_artifacts:
        raise ManifestError("Release artifact set does not match the declared Android channel")

    if require_signed_android and include_android and android.get("signing") != "signed-release":
        raise ManifestError("Final publication requires signed-release Android artifacts when Android is included")

    rollback = manifest.get("rollback")
    if not isinstance(rollback, dict) or rollback.get("databaseRollbackImplied") is not False:
        raise ManifestError("Manifest must preserve the explicit database rollback boundary")


def _artifact_digest(manifest: dict[str, Any], artifact_id: str) -> str:
    for artifact in manifest["artifacts"]:
        if artifact.get("id") == artifact_id:
            return str(artifact["sha256"])
    raise ManifestError(f"Release manifest has no {artifact_id} artifact")


def _validate_cloud_image_record(
    value: object,
    *,
    label: str,
    expected_roles: set[str],
    expected_artifact_sha256: str | None = None,
) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ManifestError(f"Cloud deployment {label} image record is missing")
    reference, digest = require_digest_image_reference(value.get("reference"), label=label)
    if value.get("digest") != digest:
        raise ManifestError(f"Cloud deployment {label} digest does not match its image reference")
    artifact_sha = value.get("releaseArtifactSha256")
    if not isinstance(artifact_sha, str) or not SHA256.fullmatch(artifact_sha):
        raise ManifestError(f"Cloud deployment {label} release artifact digest is invalid")
    if expected_artifact_sha256 is not None and artifact_sha != expected_artifact_sha256:
        raise ManifestError(f"Cloud deployment {label} is bound to the wrong #519 artifact digest")
    if set(value.get("roles", [])) != expected_roles:
        raise ManifestError(f"Cloud deployment {label} roles are inconsistent")
    return {
        "reference": reference,
        "digest": digest,
        "releaseArtifactSha256": artifact_sha,
        "roles": sorted(expected_roles),
    }


def _validate_previous_cloud_identity(value: object) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ManifestError("Cloud deployment previousKnownGood must be an object or null")
    version = value.get("version")
    tag = value.get("tag")
    source = value.get("sourceRevision")
    manifest_sha = value.get("releaseManifestSha256")
    if not isinstance(version, str):
        raise ManifestError("Previous Cloud deployment version is missing")
    require_semver(version)
    if tag != f"v{version}":
        raise ManifestError("Previous Cloud deployment tag must be exactly v<product-version>")
    if not isinstance(source, str) or not SHA40.fullmatch(source):
        raise ManifestError("Previous Cloud deployment source revision is invalid")
    if not isinstance(manifest_sha, str) or not SHA256.fullmatch(manifest_sha):
        raise ManifestError("Previous Cloud deployment release manifest digest is invalid")
    images = value.get("images")
    if not isinstance(images, dict) or set(images) != {"backend", "web"}:
        raise ManifestError("Previous Cloud deployment must contain backend and Web images")
    backend = _validate_cloud_image_record(
        images["backend"], label="previous backend", expected_roles=BACKEND_ROLES
    )
    web = _validate_cloud_image_record(
        images["web"], label="previous web", expected_roles={"web"}
    )
    return {
        "version": version,
        "tag": tag,
        "sourceRevision": source,
        "releaseManifestSha256": manifest_sha,
        "images": {"backend": backend, "web": web},
    }


def validate_cloud_deployment_identity(
    identity: dict[str, Any], *, allow_legacy_identity: bool = False
) -> None:
    allowed_kinds = {CLOUD_DEPLOYMENT_KIND}
    allowed_names = {PRODUCT_NAME}
    if allow_legacy_identity:
        allowed_kinds.add(LEGACY_CLOUD_DEPLOYMENT_KIND)
        allowed_names.add(LEGACY_PRODUCT_NAME)
    if identity.get("schemaVersion") != 1 or identity.get("kind") not in allowed_kinds:
        raise ManifestError("Unsupported Cloud deployment identity schema")
    release = identity.get("release")
    if not isinstance(release, dict):
        raise ManifestError("Cloud deployment identity has no release binding")
    product = release.get("product")
    if not isinstance(product, dict):
        raise ManifestError("Cloud deployment identity has no product identity")
    if product.get("name") not in allowed_names:
        raise ManifestError("Cloud deployment identity has the wrong product name")
    version = product.get("version")
    if not isinstance(version, str):
        raise ManifestError("Cloud deployment product version is missing")
    require_semver(version)
    if product.get("tag") != f"v{version}":
        raise ManifestError("Cloud deployment release tag must be exactly v<product-version>")
    source = release.get("sourceRevision")
    if not isinstance(source, str) or not SHA40.fullmatch(source):
        raise ManifestError("Cloud deployment source revision is invalid")
    manifest_sha = release.get("releaseManifestSha256")
    if not isinstance(manifest_sha, str) or not SHA256.fullmatch(manifest_sha):
        raise ManifestError("Cloud deployment release manifest digest is invalid")
    artifacts = release.get("artifacts")
    if not isinstance(artifacts, dict) or set(artifacts) != {"backend-runtime", "web-runtime"}:
        raise ManifestError("Cloud deployment release binding must contain backend and Web artifacts")
    for artifact_id, digest in artifacts.items():
        if not isinstance(digest, str) or not SHA256.fullmatch(digest):
            raise ManifestError(f"Cloud deployment {artifact_id} digest is invalid")

    images = identity.get("images")
    if not isinstance(images, dict) or set(images) != {"backend", "web"}:
        raise ManifestError("Cloud deployment identity must contain backend and Web images")
    _validate_cloud_image_record(
        images["backend"],
        label="backend",
        expected_roles=BACKEND_ROLES,
        expected_artifact_sha256=artifacts["backend-runtime"],
    )
    _validate_cloud_image_record(
        images["web"],
        label="web",
        expected_roles={"web"},
        expected_artifact_sha256=artifacts["web-runtime"],
    )

    previous = identity.get("previousKnownGood")
    if previous is not None:
        _validate_previous_cloud_identity(previous)


def previous_cloud_deployment_identity(
    path: Path | None, expected: object
) -> dict[str, Any] | None:
    if expected is None:
        if path is not None:
            raise ManifestError(
                "Initial release cannot also declare a previous Cloud deployment identity"
            )
        return None
    if not isinstance(expected, dict):
        raise ManifestError("Release manifest previousKnownGood identity is invalid")
    if path is None:
        raise ManifestError(
            "Non-initial Cloud deployment requires the previous-known-good Cloud deployment identity"
        )

    identity = load_json(path)
    validate_cloud_deployment_identity(identity, allow_legacy_identity=True)
    release = identity["release"]
    product = release["product"]
    checks = {
        "version": product["version"],
        "tag": product["tag"],
        "sourceRevision": release["sourceRevision"],
        "manifestSha256": release["releaseManifestSha256"],
    }
    for key, actual in checks.items():
        if expected.get(key) != actual:
            raise ManifestError(
                f"Previous Cloud deployment identity does not match #519 previousKnownGood {key}"
            )
    return {
        "version": product["version"],
        "tag": product["tag"],
        "sourceRevision": release["sourceRevision"],
        "releaseManifestSha256": release["releaseManifestSha256"],
        "images": identity["images"],
    }


def build_manifest(args: argparse.Namespace) -> int:
    evidence = load_json(args.evidence_index)
    source, artifacts, android = validate_evidence(evidence, args.version)
    previous = previous_identity(args.previous_manifest, args.initial_release)

    manifest = {
        "schemaVersion": 1,
        "product": {
            "name": PRODUCT_NAME,
            "version": args.version,
            "tag": f"v{args.version}",
        },
        "sourceRevision": source,
        "artifacts": artifacts,
        "android": android,
        "evidence": {
            "format": evidence["sbomFormat"],
            "source": "#193 release-evidence",
        },
        "previousKnownGood": previous,
        "rollback": {
            "applicationReleaseSelectable": previous is not None,
            "databaseRollbackImplied": False,
            "schemaCompatibilityReviewRequired": True,
            "authority": ["#190", "#375"],
        },
    }
    validate_manifest_shape(manifest, require_signed_android=args.require_signed_android)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Wrote release manifest for {args.version} at {source}")
    return 0


def verify_manifest(args: argparse.Namespace) -> int:
    manifest = load_json(args.manifest)
    validate_manifest_shape(manifest, require_signed_android=args.require_signed_android)
    root = args.artifact_root.resolve()
    for artifact in manifest["artifacts"]:
        artifact_path = root.joinpath(*safe_relative_path(artifact["path"]).parts)
        sbom_path = root.joinpath(*safe_relative_path(artifact["sbom"]).parts)
        if not artifact_path.is_file() or sha256(artifact_path) != artifact["sha256"]:
            raise ManifestError(f"Artifact digest mismatch: {artifact['id']}")
        if not sbom_path.is_file() or sha256(sbom_path) != artifact["sbomSha256"]:
            raise ManifestError(f"SBOM digest mismatch: {artifact['id']}")
    print(
        f"Verified release manifest {manifest['product']['tag']} at {manifest['sourceRevision']}"
    )
    return 0


def build_cloud_deployment_identity(args: argparse.Namespace) -> int:
    manifest = load_json(args.manifest)
    validate_manifest_shape(
        manifest,
        require_signed_android=True,
        allow_legacy_product_name=True,
    )
    compose = load_json(args.compose_config)
    backend_reference, web_reference = cloud_images_from_compose(compose)
    backend_reference, backend_digest = require_digest_image_reference(
        backend_reference, label="backend"
    )
    web_reference, web_digest = require_digest_image_reference(web_reference, label="web")

    backend_artifact = _artifact_digest(manifest, "backend-runtime")
    web_artifact = _artifact_digest(manifest, "web-runtime")
    previous = previous_cloud_deployment_identity(
        args.previous_deployment_identity, manifest.get("previousKnownGood")
    )
    identity = {
        "schemaVersion": 1,
        "kind": CLOUD_DEPLOYMENT_KIND,
        "release": {
            "product": {
                "name": PRODUCT_NAME,
                "version": manifest["product"]["version"],
                "tag": manifest["product"]["tag"],
            },
            "sourceRevision": manifest["sourceRevision"],
            "releaseManifestSha256": sha256(args.manifest),
            "artifacts": {
                "backend-runtime": backend_artifact,
                "web-runtime": web_artifact,
            },
        },
        "images": {
            "backend": {
                "reference": backend_reference,
                "digest": backend_digest,
                "releaseArtifactSha256": backend_artifact,
                "roles": sorted(BACKEND_ROLES),
            },
            "web": {
                "reference": web_reference,
                "digest": web_digest,
                "releaseArtifactSha256": web_artifact,
                "roles": ["web"],
            },
        },
        "previousKnownGood": previous,
        "evidence": {
            "source": "#519 release manifest + resolved canonical cloud Compose config",
            "databaseRollbackImplied": False,
        },
    }
    validate_cloud_deployment_identity(identity)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(identity, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(
        "Verified Cloud deployment identity "
        f"{manifest['product']['tag']} backend={backend_digest} web={web_digest}"
    )
    return 0


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    sub = root.add_subparsers(dest="command", required=True)

    build = sub.add_parser("build", help="Build a release manifest from #193 evidence")
    build.add_argument("--evidence-index", type=Path, required=True)
    build.add_argument("--version", required=True)
    previous = build.add_mutually_exclusive_group(required=True)
    previous.add_argument("--previous-manifest", type=Path)
    previous.add_argument("--initial-release", action="store_true")
    build.add_argument("--require-signed-android", action="store_true")
    build.add_argument("--output", type=Path, required=True)
    build.set_defaults(handler=build_manifest)

    verify = sub.add_parser("verify", help="Verify manifest structure and artifact digests")
    verify.add_argument("--manifest", type=Path, required=True)
    verify.add_argument("--artifact-root", type=Path, required=True)
    verify.add_argument("--require-signed-android", action="store_true")
    verify.set_defaults(handler=verify_manifest)

    cloud = sub.add_parser(
        "cloud-deployment",
        help="Bind a final #519 release to digest-pinned resolved Cloud Compose images",
    )
    cloud.add_argument("--manifest", type=Path, required=True)
    cloud.add_argument(
        "--compose-config",
        type=Path,
        required=True,
        help="JSON from docker compose --profile cloud ... config --format json",
    )
    cloud.add_argument(
        "--previous-deployment-identity",
        type=Path,
        help="Required for a non-initial release; exact prior Cloud deployment identity",
    )
    cloud.add_argument("--output", type=Path, required=True)
    cloud.set_defaults(handler=build_cloud_deployment_identity)
    return root


def main() -> int:
    args = parser().parse_args()
    try:
        return args.handler(args)
    except ManifestError as exc:
        print(f"release-manifest error: {exc}")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

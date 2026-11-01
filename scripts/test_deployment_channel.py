#!/usr/bin/env python3
"""Publish a checked, digest-pinned private test channel for Arcane Git Sync.

The root Compose contract owns the process topology. This exporter only wires its
Cloud processes to the existing test instance; it never reads operator secrets.
"""

from __future__ import annotations

import argparse
import base64
import copy
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from functools import lru_cache
from pathlib import Path

import image_archive_config
import release_manifest

REPOSITORY = "baerenmarke90/eimir"
CHANNEL_BRANCH = "deploy/eimir-test"
CHANNEL_KIND = "eimir-private-test-channel"
ROOT = Path(__file__).resolve().parents[1]
REQUIRED_WORKFLOWS = frozenset(
    {
        ".github/workflows/ci.yml",
        ".github/workflows/web-browser-qa.yml",
        ".github/workflows/codeql.yml",
        ".github/workflows/self-hosted-deployment-guard.yml",
        ".github/workflows/self-hosted-recovery.yml",
    }
)
CLOUD_SERVICES = ("cloud-migrate", "cloud-api", "cloud-worker", "cloud-web")
FCM_CREDENTIAL_TARGET = "/run/secrets/eimir-fcm-sender.json"
_FCM_SOURCE_PLACEHOLDER = "/__eimir_source_only_fcm_mount__"


class ChannelError(ValueError):
    """The candidate must not replace the last known channel configuration."""


class GitHubError(ChannelError):
    def __init__(self, endpoint: str, missing: bool = False) -> None:
        super().__init__(f"GitHub request failed: {endpoint}")
        self.missing = missing


def run(
    arguments: list[str],
    *,
    timeout: int = 120,
    stdin: str | None = None,
    environment: dict[str, str] | None = None,
) -> str:
    result = subprocess.run(
        arguments,
        input=stdin,
        text=True,
        capture_output=True,
        timeout=timeout,
        check=False,
        env=environment,
    )
    if result.returncode:
        # Do not relay environment values, command output, or credential helpers.
        raise ChannelError(f"Command failed: {arguments[0]}")
    return result.stdout


def gh_api(
    endpoint: str,
    *,
    payload: dict | None = None,
    paginate: bool = False,
    method: str = "POST",
):
    arguments = ["gh", "api", endpoint]
    if payload is not None:
        arguments += ["--method", method, "--input", "-"]
    if paginate:
        arguments += ["--paginate", "--slurp"]
    result = subprocess.run(
        arguments,
        input=json.dumps(payload) if payload is not None else None,
        text=True,
        capture_output=True,
        timeout=120,
        check=False,
    )
    if result.returncode:
        raise GitHubError(endpoint, missing="(HTTP 404)" in result.stderr)
    return json.loads(result.stdout)


def revision(value: str) -> str:
    if not re.fullmatch(r"[0-9a-f]{40}", value):
        raise ChannelError("A full lowercase source commit SHA is required")
    return value


def latest_main() -> str:
    return revision(gh_api(f"repos/{REPOSITORY}/git/ref/heads/main")["object"]["sha"])


def workflow_state(runs: list[dict], source: str) -> bool:
    """Require the newest push run/attempt of every exact main workflow."""
    selected: dict[str, dict] = {}
    for item in runs:
        path = item.get("path")
        if (
            path not in REQUIRED_WORKFLOWS
            or item.get("event") != "push"
            or item.get("head_branch") != "main"
            or item.get("head_sha") != source
            or item.get("head_repository", {}).get("full_name") != REPOSITORY
        ):
            continue
        key = (item["id"], item.get("run_attempt", 1))
        previous = selected.get(path)
        if previous is None or key > (previous["id"], previous.get("run_attempt", 1)):
            selected[path] = item
    for path, item in selected.items():
        if item.get("status") == "completed" and item.get("conclusion") != "success":
            raise ChannelError(f"Required main workflow did not succeed: {path}")
    return len(selected) == len(REQUIRED_WORKFLOWS) and all(
        item.get("status") == "completed" and item.get("conclusion") == "success"
        for item in selected.values()
    )


def candidate_ready(source: str) -> bool:
    pages = gh_api(
        f"repos/{REPOSITORY}/actions/runs?head_sha={source}&event=push&per_page=100",
        paginate=True,
    )
    return workflow_state(
        [item for page in pages for item in page["workflow_runs"]], source
    )


def completion_matches_source(event: dict, source: str) -> bool:
    """Admit only an owning-repository main push completion for this checkout."""
    if not isinstance(event, dict):
        return False
    completed = event.get("workflow_run")
    if not isinstance(completed, dict):
        return False
    origin = completed.get("head_repository")
    if not isinstance(origin, dict):
        return False
    return (
        event.get("action") == "completed"
        and completed.get("path") in REQUIRED_WORKFLOWS
        and completed.get("event") == "push"
        and completed.get("head_branch") == "main"
        and completed.get("head_sha") == source
        and origin.get("full_name") == REPOSITORY
        and completed.get("status") == "completed"
        and completed.get("conclusion") == "success"
    )


def channel_already_selected(source: str) -> bool:
    """Avoid rebuilding an already selected pair after repeated completions."""
    try:
        parent = revision(
            gh_api(f"repos/{REPOSITORY}/git/ref/heads/{CHANNEL_BRANCH}")["object"]["sha"]
        )
    except GitHubError as error:
        if error.missing:
            return False
        raise
    current = gh_api(f"repos/{REPOSITORY}/contents/channel.json?ref={parent}")
    identity = json.loads(base64.b64decode(current["content"], validate=False))
    if identity.get("kind") != CHANNEL_KIND or identity.get("schemaVersion") != 1:
        raise ChannelError("Existing deployment branch is not an owned test channel")
    return revision(identity["sourceRevision"]) == source


def check_for_publication(source: str, event_name: str, event: dict) -> bool:
    """Check once; later main workflow completions retry unfinished candidates."""
    if event_name == "workflow_run":
        if not completion_matches_source(event, source):
            print("Completion does not admit this exact main checkout")
            return False
    elif event_name != "workflow_dispatch":
        raise ChannelError("Test checks require a main completion or manual retry")
    if latest_main() != source:
        print("Candidate was superseded on main; keeping the current channel")
        return False
    if not candidate_ready(source):
        print("Required main workflows are unfinished; awaiting another completion")
        return False
    if channel_already_selected(source):
        print("This source is already selected; preserving its exact image pair")
        return False
    return True


def wait_for_checks(source: str, timeout: int) -> bool:
    deadline = time.monotonic() + timeout
    while True:
        if latest_main() != source:
            print("Candidate was superseded on main; keeping the current channel")
            return False
        if candidate_ready(source):
            return True
        if time.monotonic() >= deadline:
            raise ChannelError("Timed out waiting for required main workflows")
        time.sleep(15)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def evidence_records(root: Path, source: str) -> dict[str, dict]:
    index = json.loads((root / "evidence-index.json").read_text())
    if index.get("sourceRevision") != source or index.get("schemaVersion") != 1:
        raise ChannelError("Evidence source identity does not match the candidate")
    if index.get("android") != {"included": False, "signing": "not-applicable"}:
        raise ChannelError("The server test channel must exclude Android artifacts")
    records = index.get("artifacts", [])
    if sorted(item["id"] for item in records) != ["backend-runtime", "web-runtime"]:
        raise ChannelError(
            "Exactly one backend and one Web evidence artifact are required"
        )
    result = {}
    for item in records:
        artifact_id = item["id"]
        roles = (
            ["api", "worker", "migrate"]
            if artifact_id == "backend-runtime"
            else ["web"]
        )
        expected_paths = {
            "path": f"{artifact_id}.image.tar",
            "sbom": f"sbom/{artifact_id}.spdx.json",
        }
        if item.get("roles") != roles:
            raise ChannelError("Evidence process roles do not match the channel")
        for field, expected in expected_paths.items():
            if item.get(field) != expected:
                raise ChannelError("Unexpected evidence artifact path")
            digest_key = "sha256" if field == "path" else "sbomSha256"
            if sha256(root / expected) != item.get(digest_key):
                raise ChannelError(f"Evidence digest mismatch: {artifact_id} {field}")
        result[artifact_id] = item
    return result


def archive_config_digest(path: Path, expected_tag: str | None = None) -> str:
    """Hash Docker save's exact config bytes, independent of image-store IDs."""
    try:
        return image_archive_config.archive_config_digest(path, expected_tag)
    except image_archive_config.ArchiveConfigError as exc:
        raise ChannelError(str(exc)) from exc


def publish_image(
    root: Path, record: dict, source: str, version: str, attempt: str
) -> str:
    artifact_id = record["id"]
    role = "backend" if artifact_id == "backend-runtime" else "web"
    local = f"eimir-{role}:evidence-{source}"
    repository = f"ghcr.io/{REPOSITORY}-{role}"
    target = f"{repository}:test-{source}-{attempt}"
    config_digest = archive_config_digest(root / record["path"], local)
    run(["docker", "load", "--input", str(root / record["path"])], timeout=600)
    inspected = json.loads(run(["docker", "image", "inspect", local]))[0]
    labels = inspected["Config"]["Labels"]
    if (
        labels.get("org.opencontainers.image.revision") != source
        or labels.get("org.opencontainers.image.version") != version
        or labels.get("org.opencontainers.image.source")
        != f"https://github.com/{REPOSITORY}"
        or inspected.get("Os") != "linux"
        or inspected.get("Architecture") != "amd64"
    ):
        raise ChannelError(
            "Runtime image source/version/platform labels do not match evidence"
        )
    run(["docker", "tag", local, target])
    # Containerd archives can retain a provenance index. Deploy only the runtime
    # platform; the original archives and GitHub attestations remain unchanged.
    pushed = run(["docker", "push", "--platform", "linux/amd64", target], timeout=600)
    digests = re.findall(r"digest: (sha256:[0-9a-f]{64})", pushed)
    if len(set(digests)) != 1:
        raise ChannelError("Registry push did not report one unambiguous image digest")
    pinned = f"{repository}@{digests[0]}"
    manifest = json.loads(run(["docker", "manifest", "inspect", pinned]))
    if (
        not isinstance(manifest, dict)
        or manifest.get("schemaVersion") != 2
        or manifest.get("mediaType")
        not in {
            "application/vnd.oci.image.manifest.v1+json",
            "application/vnd.docker.distribution.manifest.v2+json",
        }
        or "manifests" in manifest
        or not isinstance(manifest.get("layers"), list)
        or not isinstance(manifest.get("config"), dict)
        or manifest.get("config", {}).get("digest") != config_digest
    ):
        raise ChannelError(
            "Registry digest is not the exact built single-image manifest"
        )
    run(["docker", "pull", pinned], timeout=600)
    with tempfile.TemporaryDirectory(prefix="eimir-channel-pullback-") as temporary:
        pulled_archive = Path(temporary) / "image.tar"
        run(
            ["docker", "image", "save", "--output", str(pulled_archive), pinned],
            timeout=600,
        )
        if archive_config_digest(pulled_archive) != config_digest:
            raise ChannelError("Registry pull-back differs from the evidence image")
    return pinned


def required(name: str) -> str:
    return "${" + name + ":?Set the existing instance value in Arcane}"


def canonical_compose(*, fcm: bool = False) -> dict:
    # Never resolve an operator .env or the caller's deployment settings. Required
    # local expressions are introduced after this source-default-only step.
    environment = {
        key: os.environ[key]
        for key in ("PATH", "HOME", "DOCKER_CONFIG")
        if key in os.environ
    }
    files = ["--file", str(ROOT / "compose.yaml")]
    if fcm:
        files.extend(["--file", str(ROOT / "deploy/push-fcm.compose.yaml")])
        # Only non-secret source metadata. Docker config never opens this file.
        environment.update(
            EIMIR_PUSH_FCM_PROJECT_ID="eimir-render-only",
            EIMIR_PUSH_FCM_ANDROID_PACKAGE="de.eimir.app",
            EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE=_FCM_SOURCE_PLACEHOLDER,
        )
    return json.loads(
        run(
            [
                "docker",
                "compose",
                *files,
                "--env-file",
                os.devnull,
                "--profile",
                "cloud",
                "config",
                "--format",
                "json",
            ],
            environment=environment,
        )
    )


@lru_cache(maxsize=1)
def fcm_sender_mount() -> dict:
    """Compile the same opt-in file mount used by canonical operators."""
    enabled = canonical_compose(fcm=True)
    expected = {
        "type": "bind",
        "source": _FCM_SOURCE_PLACEHOLDER,
        "target": FCM_CREDENTIAL_TARGET,
        "read_only": True,
        "bind": {"create_host_path": False},
    }
    for name in ("cloud-api", "cloud-worker"):
        mounts = [
            copy.deepcopy(mount)
            for mount in enabled["services"][name].get("volumes", [])
            if mount.get("target") == FCM_CREDENTIAL_TARGET
        ]
        for mount in mounts:
            # Compose 2.38 omits the false bool when serializing bind options.
            # Its empty long-syntax bind still disables host-path creation;
            # keep that safety property explicit in the exported source.
            if mount.get("bind") == {}:
                mount["bind"] = {"create_host_path": False}
        if mounts != [expected]:
            raise ChannelError("Canonical FCM credential mount changed; review the exporter")
    mount = copy.deepcopy(expected)
    mount["source"] = required("EIMIR_PUSH_FCM_CREDENTIALS_HOST_FILE")
    return mount


def export_compose(canonical: dict, backend: str, web: str) -> dict:
    services = copy.deepcopy(canonical["services"])
    if set(services) != set(CLOUD_SERVICES):
        raise ChannelError(
            "Canonical Cloud process set changed; review the instance exporter"
        )
    database = (
        "postgresql+psycopg://sidebyside:"
        + required("POSTGRES_PASSWORD")
        + "@eimir-test-postgres:5432/sidebyside"
    )
    settings = {
        "EIMIR_DATABASE_URL": database,
        "EIMIR_ENVIRONMENT": "production",
        "EIMIR_DEPLOYMENT": "cloud",
        "EIMIR_PUBLIC_BASE_URL": required("EIMIR_PUBLIC_BASE_URL"),
        "EIMIR_ALLOWED_HOSTS": required("EIMIR_ALLOWED_HOSTS"),
        "EIMIR_DEMO_MODE": "false",
        "EIMIR_DEMO_MODE_RESET_TIMER": "false",
        "EIMIR_ENCRYPTION_AT_REST": "required",
        "EIMIR_MEDIA_STORE": "local",
        "EIMIR_MAIL_TRANSPORT": "smtp",
        "EIMIR_SMTP_PORT": "587",
        "EIMIR_SMTP_STARTTLS": "true",
        "EIMIR_SMTP_USERNAME": required("EIMIR_MAIL_FROM"),
        "EIMIR_OIDC_CONNECTIONS": "[]",
        # Optional personal-source configuration is supplied by the instance,
        # never frozen to source defaults or the publishing runner's values.
        "EIMIR_RECAP_AI_URL": "${EIMIR_RECAP_AI_URL:-}",
        "EIMIR_RECAP_AI_MODEL": "${EIMIR_RECAP_AI_MODEL:-qwen3:1.7b-q4_K_M}",
        "EIMIR_RECAP_AI_TIMEOUT_SECONDS": "${EIMIR_RECAP_AI_TIMEOUT_SECONDS:-90}",
        "EIMIR_PHOTO_SOURCES_ENABLED": "${EIMIR_PHOTO_SOURCES_ENABLED:-true}",
        "EIMIR_GOOGLE_PHOTOS_CLIENT_ID": "${EIMIR_GOOGLE_PHOTOS_CLIENT_ID:-}",
        "EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET": "${EIMIR_GOOGLE_PHOTOS_CLIENT_SECRET:-}",
        # The selected private target uses FCM only (PO 2026-11-01).
        "EIMIR_PUSH_VAPID_PRIVATE_KEY": "",
        "EIMIR_PUSH_VAPID_SUBJECT": "",
        "EIMIR_PUSH_WEBPUSH_ALLOWED_ORIGINS": "[]",
        "EIMIR_PUSH_FCM_CREDENTIALS_FILE": FCM_CREDENTIAL_TARGET,
    }
    for name in (
        "EIMIR_CURSOR_SIGNING_KEY",
        "EIMIR_ENCRYPTION_KEYS",
        "EIMIR_ENCRYPTION_ACTIVE_KEY_ID",
        "EIMIR_ACCOUNT_DELETION_INSTANCE_ID",
        "EIMIR_SERVER_ADMIN_EMAILS",
        "EIMIR_WEBAUTHN_RP_ID",
        "EIMIR_WEBAUTHN_ORIGINS",
        "EIMIR_MAIL_FROM",
        "EIMIR_SMTP_HOST",
        "EIMIR_SMTP_PASSWORD",
        "EIMIR_PUSH_FCM_PROJECT_ID",
        "EIMIR_PUSH_FCM_ANDROID_PACKAGE",
    ):
        settings[name] = required(name)
    for name, service in services.items():
        service.pop("profiles", None)
        service["image"] = web if name == "cloud-web" else backend
        service["pull_policy"] = "always"
        if "build" in service or service.get("ports"):
            raise ChannelError(
                "Cloud processes must remain image-only with no host ports"
            )
        if name in ("cloud-api", "cloud-worker"):
            service["environment"].update(settings)
            if any(
                mount.get("target") == FCM_CREDENTIAL_TARGET
                for mount in service.get("volumes", [])
            ):
                raise ChannelError("Source-default Compose must not mount an FCM credential")
            service.setdefault("volumes", []).append(copy.deepcopy(fcm_sender_mount()))
        elif name == "cloud-migrate":
            service["environment"] = {"EIMIR_DATABASE_URL": database}
    services["cloud-api"]["environment"]["FORWARDED_ALLOW_IPS"] = required(
        "TRUSTED_PROXY_IPS"
    )
    services["cloud-api"]["networks"] = {
        "app": {"aliases": ["api"]},
        "proxy": {"aliases": ["eimir-test-api"]},
    }
    services["cloud-web"]["networks"] = {
        "app": {},
        "proxy": {"aliases": ["eimir-test-web"]},
    }
    result = {
        "name": "eimir-test",
        "services": services,
        "networks": {
            "app": {"external": True, "name": "eimir-test-data"},
            "proxy": {"external": True, "name": "mailcow-proxy"},
        },
        "volumes": {
            name: {"external": True, "name": f"eimir-test_{name}"}
            for name in ("cloud_media_data", "cloud_deletion_journal_data")
        },
    }
    # Reuse the authoritative Cloud image-role/digest validator.
    release_manifest.cloud_images_from_compose(result)
    return result


def advance_channel(files: dict[str, str], source: str) -> bool:
    if set(files) != {"compose.yaml", "channel.json", "README.md"}:
        raise ChannelError("Only generated deployment files may enter the channel")
    if latest_main() != source or not candidate_ready(source):
        raise ChannelError(
            "Candidate is stale or required main checks are no longer successful"
        )
    parent = None
    try:
        parent = gh_api(f"repos/{REPOSITORY}/git/ref/heads/{CHANNEL_BRANCH}")["object"][
            "sha"
        ]
    except GitHubError as error:
        if not error.missing:
            raise
    if parent:
        current = gh_api(f"repos/{REPOSITORY}/contents/channel.json?ref={parent}")
        identity = json.loads(base64.b64decode(current["content"], validate=False))
        if identity.get("kind") != CHANNEL_KIND or identity.get("schemaVersion") != 1:
            raise ChannelError(
                "Existing deployment branch is not an owned test channel"
            )
        if identity.get("sourceRevision") == source:
            print(
                "This source revision is already selected; preserving its exact image pair"
            )
            return False
    tree = gh_api(
        f"repos/{REPOSITORY}/git/trees",
        payload={
            "tree": [
                {"path": path, "mode": "100644", "type": "blob", "content": content}
                for path, content in sorted(files.items())
            ]
        },
    )
    commit = gh_api(
        f"repos/{REPOSITORY}/git/commits",
        payload={
            "message": f"deploy(test): select checked source {source}",
            "tree": tree["sha"],
            "parents": [parent] if parent else [],
        },
    )
    if latest_main() != source or not candidate_ready(source):
        raise ChannelError(
            "Main advanced during publication; keeping the current channel"
        )
    # GitHub rejects a non-fast-forward update if another writer moved the branch.
    # No force push is used, including on retries.
    if parent:
        gh_api(
            f"repos/{REPOSITORY}/git/refs/heads/{CHANNEL_BRANCH}",
            payload={
                "sha": commit["sha"],
                "force": False,
            },
            method="PATCH",
        )
    else:
        gh_api(
            f"repos/{REPOSITORY}/git/refs",
            payload={
                "ref": f"refs/heads/{CHANNEL_BRANCH}",
                "sha": commit["sha"],
            },
        )
    return True


def publish(source: str, artifact_root: Path, output: Path) -> None:
    if latest_main() != source or not candidate_ready(source):
        raise ChannelError("Only the current, checked main commit may be published")
    run_id, attempt = os.environ["GITHUB_RUN_ID"], os.environ["GITHUB_RUN_ATTEMPT"]
    if not all(re.fullmatch(r"[1-9][0-9]*", value) for value in (run_id, attempt)):
        raise ChannelError("Invalid workflow run identity")
    records = evidence_records(artifact_root, source)
    images = {
        role: publish_image(
            artifact_root,
            records[f"{role}-runtime"],
            source,
            f"0.0.0-test.{run_id}",
            f"{run_id}-{attempt}",
        )
        for role in ("backend", "web")
    }
    canonical = canonical_compose()
    compose = export_compose(canonical, images["backend"], images["web"])
    identity = {
        "schemaVersion": 1,
        "kind": CHANNEL_KIND,
        "sourceRevision": source,
        "canonicalComposeSha256": sha256(ROOT / "compose.yaml"),
        "evidenceRun": f"https://github.com/{REPOSITORY}/actions/runs/{run_id}",
        "images": images,
        "artifacts": list(records.values()),
    }
    files = {
        "compose.yaml": json.dumps(compose, indent=2, sort_keys=True) + "\n",
        "channel.json": json.dumps(identity, indent=2, sort_keys=True) + "\n",
        "README.md": (
            "# Generated private test deployment\n\n"
            "Prerelease operator channel, not a supported product release.\n"
            f"Source: `{source}`. Both images are pinned by OCI digest.\n\n"
            "Use Arcane Git Sync with the existing eimir-test project. Keep its local .env, "
            "database, media, deletion journal and keys. Never run bootstrap again.\n\n"
            "Setup and recovery: https://github.com/baerenmarke90/eimir/blob/main/"
            "docs/PRIVATE-TEST-CHANNEL.md\n"
        ),
    }
    output.mkdir(parents=True, exist_ok=True)
    for name, content in files.items():
        (output / name).write_text(content)
    advance_channel(files, source)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    check = subparsers.add_parser("check")
    check.add_argument("--revision", required=True)
    check.add_argument("--github-output", type=Path, required=True)
    wait = subparsers.add_parser("wait")
    wait.add_argument("--revision", required=True)
    wait.add_argument("--timeout", type=int, default=3600)
    wait.add_argument("--github-output", type=Path, required=True)
    publication = subparsers.add_parser("publish")
    publication.add_argument("--revision", required=True)
    publication.add_argument("--artifact-root", type=Path, required=True)
    publication.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        source = revision(args.revision)
        if os.environ.get("GITHUB_REPOSITORY") != REPOSITORY:
            raise ChannelError(
                "Test publication is restricted to the owning repository"
            )
        if os.environ.get("GITHUB_REF") != "refs/heads/main":
            raise ChannelError("Test publication is restricted to main")
        if args.command in {"check", "wait"}:
            if args.command == "check":
                event_name = os.environ.get("GITHUB_EVENT_NAME", "")
                event = (
                    json.loads(Path(os.environ["GITHUB_EVENT_PATH"]).read_text())
                    if event_name == "workflow_run"
                    else {}
                )
                ready = check_for_publication(source, event_name, event)
            else:
                if not 1 <= args.timeout <= 3600:
                    raise ChannelError("Check timeout must be between 1 and 3600 seconds")
                ready = wait_for_checks(source, args.timeout)
            with args.github_output.open("a") as stream:
                stream.write(f"ready={str(ready).lower()}\n")
        else:
            publish(source, args.artifact_root, args.output)
    except (
        ChannelError,
        KeyError,
        OSError,
        json.JSONDecodeError,
        subprocess.TimeoutExpired,
    ) as error:
        print(f"Test channel refused: {error}")
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


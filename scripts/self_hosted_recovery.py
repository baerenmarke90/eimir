#!/usr/bin/env python3
"""Create and restore coordinated Self-Hosted PostgreSQL/local-media backups.

The archive is deliberately an operational backup, not a user Transfer Bundle.
It contains the complete database (including every tenant and owner-only row)
plus only media with a durable parent binding. Configuration and secrets are
never copied into the archive and must be recovered through the operator's
secret/configuration backup process.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

ARCHIVE_FORMAT = "eimir-self-hosted-backup"
LEGACY_ARCHIVE_FORMAT = "sidebyside-self-hosted-backup"
ARCHIVE_VERSION = 1
ARCHIVE_MEMBERS = frozenset({"manifest.json", "database.dump", "media.tar"})
ALLOWED_COMPOSE_FILES = frozenset({"compose.yaml"})
COMPOSE_PROFILE = "self-hosted"
WRITER_SERVICES = frozenset({"api", "worker"})
TRANSIENT_WRITER_SERVICES = frozenset({"migrate", "demo-init"})
VOLUME_NAME_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
UUID_RE = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
MEDIA_PATH_RE = re.compile(rf"^spaces/{UUID_RE}/attachments/{UUID_RE}/(?:original|thumbnail)$")
MEDIA_MOUNT_PATH = "/eimir-recovery-media"


class RecoveryError(RuntimeError):
    """The requested backup or restore operation is unsafe or failed."""


def _compose_subprocess_env() -> dict[str, str]:
    """Force the self-hosted profile regardless of any ambient ``COMPOSE_PROFILES``.

    Docker Compose's active profile set is the union of ``--profile`` flags
    and ``COMPOSE_PROFILES`` from the environment or an ``--env-file``, not an
    override. Without this, an operator-supplied ``--env-file`` that sets
    ``COMPOSE_PROFILES=cloud`` (or ``dev-db``) would silently add those
    services alongside self-hosted recovery instead of being rejected.
    """
    env = dict(os.environ)
    env["COMPOSE_PROFILES"] = COMPOSE_PROFILE
    return env


def _run(
    command: list[str],
    *,
    input_bytes: bytes | None = None,
    input_file: BinaryIO | None = None,
    output_file: BinaryIO | None = None,
    check: bool = True,
) -> subprocess.CompletedProcess[bytes]:
    if input_bytes is not None and input_file is not None:
        raise ValueError("Only one subprocess input may be provided.")
    try:
        completed = subprocess.run(
            command,
            check=False,
            input=input_bytes,
            stdin=input_file,
            stdout=output_file if output_file is not None else subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=_compose_subprocess_env(),
        )
    except OSError as exc:
        raise RecoveryError("A required Docker command could not be executed.") from exc
    if check and completed.returncode != 0:
        raise RecoveryError("A required Docker operation failed; no secret output was emitted.")
    return completed


@dataclass(frozen=True)
class ComposeTarget:
    root: Path
    compose_file: Path
    env_file: Path
    project_name: str
    config: dict[str, object]

    @classmethod
    def load(
        cls,
        *,
        compose_file: Path,
        env_file: Path,
        confirmed_project: str,
    ) -> ComposeTarget:
        root = Path(__file__).resolve().parents[1]
        resolved_compose = compose_file.resolve()
        if resolved_compose.parent != root or resolved_compose.name not in ALLOWED_COMPOSE_FILES:
            raise RecoveryError("Only the repository's canonical compose.yaml is supported.")
        resolved_env = env_file.resolve()
        if not resolved_env.is_file():
            raise RecoveryError("The requested environment file does not exist.")

        command = [
            "docker",
            "compose",
            "--profile",
            COMPOSE_PROFILE,
            "--env-file",
            str(resolved_env),
            "-f",
            str(resolved_compose),
            "config",
            "--format",
            "json",
        ]
        rendered = _run(command)
        try:
            config = json.loads(rendered.stdout)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise RecoveryError("Docker Compose did not return valid configuration JSON.") from exc
        if not isinstance(config, dict) or not isinstance(config.get("name"), str):
            raise RecoveryError("Docker Compose did not report a project name.")
        project_name = config["name"]
        if not confirmed_project or confirmed_project != project_name:
            raise RecoveryError(
                "--confirm-project must exactly match the rendered Compose project name."
            )

        target = cls(root, resolved_compose, resolved_env, project_name, config)
        target._validate_contract()
        return target

    def _validate_contract(self) -> None:
        services = self.config.get("services")
        volumes = self.config.get("volumes")
        if not isinstance(services, dict) or not isinstance(volumes, dict):
            raise RecoveryError("Compose configuration lacks required services or volumes.")
        for service in ("postgres", "api", "worker"):
            if service not in services:
                raise RecoveryError("Compose configuration lacks a required recovery service.")
        if "media_data" not in volumes:
            raise RecoveryError("Compose configuration lacks the LocalMediaStore volume.")
        api = services["api"]
        if not isinstance(api, dict) or not isinstance(api.get("environment"), dict):
            raise RecoveryError("Compose API configuration lacks its environment.")
        if api["environment"].get("EIMIR_MEDIA_STORE") != "local":
            raise RecoveryError(
                "This command supports only EIMIR_MEDIA_STORE=local; use the provider's "
                "consistent S3/object-storage recovery process instead."
            )

    def compose_command(self, *arguments: str) -> list[str]:
        return [
            "docker",
            "compose",
            "--project-name",
            self.project_name,
            "--profile",
            COMPOSE_PROFILE,
            "--env-file",
            str(self.env_file),
            "-f",
            str(self.compose_file),
            *arguments,
        ]

    def postgres_value(self, key: str) -> str:
        services = self.config["services"]
        assert isinstance(services, dict)
        postgres = services["postgres"]
        assert isinstance(postgres, dict)
        environment = postgres.get("environment")
        if not isinstance(environment, dict) or not isinstance(environment.get(key), str):
            raise RecoveryError("Compose PostgreSQL configuration is incomplete.")
        value = environment[key]
        if not value:
            raise RecoveryError("Compose PostgreSQL configuration contains an empty value.")
        return value

    def postgres_image(self) -> str:
        services = self.config["services"]
        assert isinstance(services, dict)
        postgres = services["postgres"]
        assert isinstance(postgres, dict)
        image = postgres.get("image")
        if not isinstance(image, str) or not image:
            raise RecoveryError("Compose PostgreSQL image is missing.")
        return image

    def media_volume(self) -> str:
        volumes = self.config["volumes"]
        assert isinstance(volumes, dict)
        media = volumes["media_data"]
        if not isinstance(media, dict) or not isinstance(media.get("name"), str):
            raise RecoveryError("Compose LocalMediaStore volume name is missing.")
        name = media["name"]
        if not VOLUME_NAME_RE.fullmatch(name):
            raise RecoveryError("Compose LocalMediaStore volume name is unsafe.")
        return name

    def running_services(self) -> set[str]:
        result = _run(self.compose_command("ps", "--status", "running", "--services"))
        try:
            return {line for line in result.stdout.decode("utf-8").splitlines() if line}
        except UnicodeDecodeError as exc:
            raise RecoveryError("Docker Compose returned invalid service status output.") from exc


def _psql(target: ComposeTarget, query: str) -> str:
    command = target.compose_command(
        "exec",
        "-T",
        "postgres",
        "psql",
        "--no-password",
        "--tuples-only",
        "--no-align",
        "--set",
        "ON_ERROR_STOP=1",
        "--username",
        target.postgres_value("POSTGRES_USER"),
        "--dbname",
        target.postgres_value("POSTGRES_DB"),
        "--command",
        query,
    )
    result = _run(command)
    try:
        return result.stdout.decode("utf-8").strip()
    except UnicodeDecodeError as exc:
        raise RecoveryError("PostgreSQL returned invalid text output.") from exc


def _require_postgres(target: ComposeTarget) -> None:
    if "postgres" not in target.running_services():
        raise RecoveryError("The target PostgreSQL service must already be running.")
    if _psql(target, "SELECT 1") != "1":
        raise RecoveryError("The target PostgreSQL service is not ready.")


def _database_schema_revision(target: ComposeTarget) -> str:
    revision = _psql(target, "SELECT version_num FROM alembic_version")
    if not revision or "\n" in revision:
        raise RecoveryError("The database does not have exactly one Alembic revision.")
    return revision


def _durable_media_paths(target: ComposeTarget) -> list[str]:
    profile_binding_exists = (
        _psql(
            target,
            "SELECT CASE WHEN to_regclass('public.account_profile_attachments') "
            "IS NULL THEN '0' ELSE '1' END",
        )
        == "1"
    )
    profile_union = (
        "UNION SELECT attachment_id FROM account_profile_attachments"
        if profile_binding_exists
        else ""
    )
    query = f"""
        WITH durable_attachment_ids AS (
            SELECT attachment_id FROM memory_attachments
            UNION SELECT attachment_id FROM heart_moments WHERE attachment_id IS NOT NULL
            {profile_union}
        ), durable_paths AS (
            SELECT 'spaces/' || a.space_id::text || '/attachments/' ||
                   a.id::text || '/original' AS path
              FROM attachments AS a
              JOIN durable_attachment_ids AS d ON d.attachment_id = a.id
             WHERE a.status = 'READY'
            UNION
            SELECT 'spaces/' || a.space_id::text || '/attachments/' ||
                   a.id::text || '/thumbnail' AS path
              FROM attachments AS a
              JOIN durable_attachment_ids AS d ON d.attachment_id = a.id
             WHERE a.status = 'READY' AND a.has_thumbnail
        )
        SELECT path FROM durable_paths ORDER BY path
    """
    output = _psql(target, query)
    paths = [] if not output else output.splitlines()
    if len(paths) != len(set(paths)) or any(not MEDIA_PATH_RE.fullmatch(path) for path in paths):
        raise RecoveryError("The database produced an invalid durable media path.")
    return paths


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        while chunk := source.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _write_media_archive(target: ComposeTarget, paths: list[str], destination: Path) -> None:
    if not paths:
        with tarfile.open(destination, mode="w"):
            return
    command = [
        "docker",
        "run",
        "--rm",
        "--interactive",
        "--mount",
        f"type=volume,source={target.media_volume()},target={MEDIA_MOUNT_PATH},readonly",
        target.postgres_image(),
        "tar",
        "-C",
        MEDIA_MOUNT_PATH,
        "-cf",
        "-",
        "-T",
        "-",
    ]
    with destination.open("wb") as output:
        _run(command, input_bytes=("\n".join(paths) + "\n").encode(), output_file=output)


def _write_database_dump(target: ComposeTarget, destination: Path) -> None:
    command = target.compose_command(
        "exec",
        "-T",
        "postgres",
        "pg_dump",
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--username",
        target.postgres_value("POSTGRES_USER"),
        "--dbname",
        target.postgres_value("POSTGRES_DB"),
    )
    with destination.open("wb") as output:
        _run(command, output_file=output)


def _add_archive_member(
    archive: tarfile.TarFile, source: Path, name: str, *, timestamp: int
) -> None:
    info = tarfile.TarInfo(name)
    info.size = source.stat().st_size
    info.mode = 0o600
    info.uid = 0
    info.gid = 0
    info.uname = ""
    info.gname = ""
    info.mtime = timestamp
    with source.open("rb") as content:
        archive.addfile(info, content)


def _assemble_archive(
    *,
    output: Path,
    database_dump: Path,
    media_archive: Path,
    manifest_path: Path,
    created_at: datetime,
) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=".eimir-backup-", dir=output.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        os.chmod(temporary, 0o600)
        with tarfile.open(temporary, mode="w") as archive:
            timestamp = int(created_at.timestamp())
            _add_archive_member(archive, manifest_path, "manifest.json", timestamp=timestamp)
            _add_archive_member(archive, database_dump, "database.dump", timestamp=timestamp)
            _add_archive_member(archive, media_archive, "media.tar", timestamp=timestamp)
        os.replace(temporary, output)
        os.chmod(output, 0o600)
    finally:
        temporary.unlink(missing_ok=True)


def create_backup(target: ComposeTarget, output: Path) -> None:
    resolved_output = output.resolve()
    if resolved_output.exists():
        raise RecoveryError("The backup output already exists; refusing to overwrite it.")
    if not resolved_output.parent.is_dir():
        raise RecoveryError("The backup output directory does not exist.")
    _require_postgres(target)

    running = target.running_services()
    if TRANSIENT_WRITER_SERVICES.intersection(running):
        raise RecoveryError("Migration and demo initialization must finish before a backup starts.")
    writers_to_restart = sorted(WRITER_SERVICES.intersection(running))
    primary_error: Exception | None = None
    if writers_to_restart:
        _run(target.compose_command("stop", *writers_to_restart))
    try:
        with tempfile.TemporaryDirectory(prefix="eimir-backup-") as temp_name:
            temp = Path(temp_name)
            database_dump = temp / "database.dump"
            media_archive = temp / "media.tar"
            manifest_path = temp / "manifest.json"
            created_at = datetime.now(UTC)

            revision = _database_schema_revision(target)
            _write_database_dump(target, database_dump)
            media_paths = _durable_media_paths(target)
            _write_media_archive(target, media_paths, media_archive)

            manifest = {
                "format": ARCHIVE_FORMAT,
                "formatVersion": ARCHIVE_VERSION,
                "createdAt": created_at.isoformat().replace("+00:00", "Z"),
                "sourceSchemaRevision": revision,
                "database": {
                    "file": "database.dump",
                    "format": "postgresql-custom",
                    "sha256": _sha256(database_dump),
                },
                "media": {
                    "file": "media.tar",
                    "store": "local",
                    "durableObjectCount": len(media_paths),
                    "sha256": _sha256(media_archive),
                },
                "excluded": [
                    "configuration",
                    "secrets",
                    "temporary-or-unbound-media",
                ],
            }
            manifest_path.write_text(
                json.dumps(manifest, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            try:
                _assemble_archive(
                    output=resolved_output,
                    database_dump=database_dump,
                    media_archive=media_archive,
                    manifest_path=manifest_path,
                    created_at=created_at,
                )
                validation_directory = temp / "validation"
                validation_directory.mkdir()
                validate_archive(resolved_output, validation_directory)
            except Exception:
                # The path did not exist before this operation. Never leave an
                # archive that failed its own post-write integrity validation.
                resolved_output.unlink(missing_ok=True)
                raise
    except Exception as exc:
        primary_error = exc
        raise
    finally:
        if writers_to_restart:
            try:
                _run(target.compose_command("start", *writers_to_restart))
            except RecoveryError as restart_error:
                if primary_error is not None:
                    raise RecoveryError(
                        "Backup failed and the previously running writer services "
                        "could not be restarted."
                    ) from primary_error
                raise restart_error

    print(f"Backup created successfully: {resolved_output}")


@dataclass(frozen=True)
class ValidatedArchive:
    manifest: dict[str, object]
    database_dump: Path
    media_archive: Path
    media_paths: tuple[str, ...]


def _copy_archive_member(archive: tarfile.TarFile, name: str, destination: Path) -> None:
    member = archive.getmember(name)
    if not member.isfile():
        raise RecoveryError("The backup archive contains a non-file member.")
    source = archive.extractfile(member)
    if source is None:
        raise RecoveryError("A backup archive member could not be read.")
    with source, destination.open("wb") as output:
        shutil.copyfileobj(source, output)


def _validated_media_paths(media_archive: Path) -> tuple[str, ...]:
    try:
        with tarfile.open(media_archive, mode="r:") as archive:
            members = archive.getmembers()
    except (OSError, tarfile.TarError) as exc:
        raise RecoveryError("The local-media archive is invalid.") from exc
    paths: list[str] = []
    for member in members:
        if not member.isfile() or not MEDIA_PATH_RE.fullmatch(member.name):
            raise RecoveryError("The local-media archive contains an unsafe member.")
        paths.append(member.name)
    if len(paths) != len(set(paths)):
        raise RecoveryError("The local-media archive contains duplicate members.")
    return tuple(sorted(paths))


def validate_archive(archive_path: Path, temporary_directory: Path) -> ValidatedArchive:
    if not archive_path.is_file():
        raise RecoveryError("The requested backup archive does not exist.")
    database_dump = temporary_directory / "database.dump"
    media_archive = temporary_directory / "media.tar"
    manifest_path = temporary_directory / "manifest.json"
    try:
        with tarfile.open(archive_path, mode="r:*") as archive:
            members = archive.getmembers()
            names = [member.name for member in members]
            if len(names) != len(set(names)) or set(names) != ARCHIVE_MEMBERS:
                raise RecoveryError("The backup archive member set is invalid.")
            _copy_archive_member(archive, "manifest.json", manifest_path)
            _copy_archive_member(archive, "database.dump", database_dump)
            _copy_archive_member(archive, "media.tar", media_archive)
    except (OSError, tarfile.TarError, KeyError) as exc:
        raise RecoveryError("The backup archive is invalid.") from exc

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise RecoveryError("The backup manifest is invalid.") from exc
    if not isinstance(manifest, dict):
        raise RecoveryError("The backup manifest is not an object.")
    if (
        manifest.get("format") not in {ARCHIVE_FORMAT, LEGACY_ARCHIVE_FORMAT}
        or manifest.get("formatVersion") != ARCHIVE_VERSION
    ):
        raise RecoveryError("The backup format is not supported.")
    database = manifest.get("database")
    media = manifest.get("media")
    if not isinstance(database, dict) or not isinstance(media, dict):
        raise RecoveryError("The backup manifest lacks database or media metadata.")
    if database.get("file") != "database.dump" or database.get("format") != "postgresql-custom":
        raise RecoveryError("The database backup format is not supported.")
    if media.get("file") != "media.tar" or media.get("store") != "local":
        raise RecoveryError("The media backup format is not supported.")
    if database.get("sha256") != _sha256(database_dump):
        raise RecoveryError("The database dump checksum does not match the manifest.")
    if media.get("sha256") != _sha256(media_archive):
        raise RecoveryError("The media archive checksum does not match the manifest.")

    media_paths = _validated_media_paths(media_archive)
    if media.get("durableObjectCount") != len(media_paths):
        raise RecoveryError("The media object count does not match the manifest.")
    revision = manifest.get("sourceSchemaRevision")
    if not isinstance(revision, str) or not revision or "\n" in revision:
        raise RecoveryError("The backup manifest has an invalid schema revision.")
    return ValidatedArchive(manifest, database_dump, media_archive, media_paths)


def _database_is_empty(target: ComposeTarget) -> bool:
    query = """
        SELECT count(*)
          FROM pg_catalog.pg_class AS c
          JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relkind IN ('r', 'p', 'S', 'v', 'm', 'f')
    """
    return _psql(target, query) == "0"


def _ensure_media_volume(target: ComposeTarget) -> None:
    volume = target.media_volume()
    inspected = _run(["docker", "volume", "inspect", volume], check=False)
    if inspected.returncode == 0:
        return
    _run(
        [
            "docker",
            "volume",
            "create",
            "--label",
            f"com.docker.compose.project={target.project_name}",
            "--label",
            "com.docker.compose.volume=media_data",
            volume,
        ]
    )


def _media_files(target: ComposeTarget) -> set[str]:
    command = [
        "docker",
        "run",
        "--rm",
        "--mount",
        f"type=volume,source={target.media_volume()},target={MEDIA_MOUNT_PATH},readonly",
        target.postgres_image(),
        "find",
        MEDIA_MOUNT_PATH,
        "-type",
        "f",
        "-print",
    ]
    output = _run(command).stdout
    try:
        prefix = f"{MEDIA_MOUNT_PATH}/"
        return {
            line.removeprefix(prefix)
            for line in output.decode("utf-8").splitlines()
            if line.startswith(prefix)
        }
    except UnicodeDecodeError as exc:
        raise RecoveryError("The LocalMediaStore returned invalid path output.") from exc


def _media_entries(target: ComposeTarget) -> set[str]:
    command = [
        "docker",
        "run",
        "--rm",
        "--mount",
        f"type=volume,source={target.media_volume()},target={MEDIA_MOUNT_PATH},readonly",
        target.postgres_image(),
        "find",
        MEDIA_MOUNT_PATH,
        "-mindepth",
        "1",
        "-print",
    ]
    output = _run(command).stdout
    try:
        return set(output.decode("utf-8").splitlines())
    except UnicodeDecodeError as exc:
        raise RecoveryError("The LocalMediaStore returned invalid entry output.") from exc


def _restore_database(target: ComposeTarget, database_dump: Path) -> None:
    command = target.compose_command(
        "exec",
        "-T",
        "postgres",
        "pg_restore",
        "--single-transaction",
        "--no-owner",
        "--no-privileges",
        "--username",
        target.postgres_value("POSTGRES_USER"),
        "--dbname",
        target.postgres_value("POSTGRES_DB"),
    )
    with database_dump.open("rb") as source:
        _run(command, input_file=source)


def _restore_media(target: ComposeTarget, media_archive: Path) -> None:
    command = [
        "docker",
        "run",
        "--rm",
        "--interactive",
        "--mount",
        f"type=volume,source={target.media_volume()},target={MEDIA_MOUNT_PATH}",
        target.postgres_image(),
        "tar",
        "-C",
        MEDIA_MOUNT_PATH,
        "-xf",
        "-",
    ]
    with media_archive.open("rb") as source:
        _run(command, input_file=source)


def restore_backup(target: ComposeTarget, archive_path: Path, *, confirmed_empty: bool) -> None:
    if not confirmed_empty:
        raise RecoveryError("Restore requires the explicit --confirm-empty-target flag.")
    _require_postgres(target)
    running_writers = WRITER_SERVICES.intersection(target.running_services())
    if running_writers:
        raise RecoveryError("API and worker must be stopped before restore.")
    if not _database_is_empty(target):
        raise RecoveryError("Restore target database is not fresh and empty.")
    _ensure_media_volume(target)
    if _media_entries(target):
        raise RecoveryError("Restore target LocalMediaStore is not fresh and empty.")

    with tempfile.TemporaryDirectory(prefix="eimir-restore-") as temp_name:
        validated = validate_archive(archive_path.resolve(), Path(temp_name))
        _restore_database(target, validated.database_dump)
        _restore_media(target, validated.media_archive)
        if _media_files(target) != set(validated.media_paths):
            raise RecoveryError(
                "Restored LocalMediaStore contents do not match the validated archive. "
                "Discard this fresh target and retry from a verified backup."
            )
        expected_revision = validated.manifest["sourceSchemaRevision"]
        if _database_schema_revision(target) != expected_revision:
            raise RecoveryError(
                "Restored database revision does not match the validated archive. "
                "Discard this fresh target and retry from a verified backup."
            )

    print(
        "Restore completed into the confirmed fresh target. "
        "Run the current Alembic migration, then start and verify the application."
    )


def _common_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--compose-file",
        type=Path,
        default=Path("compose.yaml"),
        help="Canonical compose.yaml from this checkout",
    )
    parser.add_argument("--env-file", type=Path, required=True, help="Target dotenv file")
    parser.add_argument(
        "--confirm-project",
        required=True,
        help="Exact rendered COMPOSE_PROJECT_NAME safety confirmation",
    )


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    backup = commands.add_parser("backup", help="Create a coordinated database/media archive")
    _common_arguments(backup)
    backup.add_argument("--output", type=Path, required=True, help="New backup archive path")

    restore = commands.add_parser("restore", help="Restore into a confirmed fresh target")
    _common_arguments(restore)
    restore.add_argument("--archive", type=Path, required=True, help="Backup archive path")
    restore.add_argument(
        "--confirm-empty-target",
        action="store_true",
        help="Confirm that this operation targets a disposable/fresh empty instance",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    try:
        target = ComposeTarget.load(
            compose_file=args.compose_file,
            env_file=args.env_file,
            confirmed_project=args.confirm_project,
        )
        if args.command == "backup":
            create_backup(target, args.output)
        else:
            restore_backup(
                target,
                args.archive,
                confirmed_empty=args.confirm_empty_target,
            )
    except RecoveryError as exc:
        print(f"Self-Hosted recovery operation failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

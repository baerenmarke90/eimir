#!/usr/bin/env python3
"""Hash the exact image config bytes inside a `docker save` archive.

Docker image IDs mean different things in the legacy and containerd image stores
(config digest versus manifest or index digest), so they cannot be compared with a
registry manifest's config digest. The config blob inside a saved archive is the
same byte string in both stores and is the only identity compared here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import tarfile
from pathlib import Path

MAX_MEMBER_BYTES = 1024 * 1024
CONFIG_PATH = re.compile(r"(?:[0-9a-f]{64}\.json|blobs/sha256/[0-9a-f]{64})")


class ArchiveConfigError(ValueError):
    """The archive does not hold exactly one verifiable image config."""


def archive_config_digest(path: Path, expected_tag: str | None = None) -> str:
    """Return `sha256:<hex>` of Docker save's exact config bytes."""
    try:
        with tarfile.open(path, mode="r:") as archive:

            def read_member(name: str) -> bytes:
                members = [item for item in archive.getmembers() if item.name == name]
                if (
                    len(members) != 1
                    or not members[0].isfile()
                    or members[0].size > MAX_MEMBER_BYTES
                ):
                    raise ArchiveConfigError("Image archive member is ambiguous or invalid")
                stream = archive.extractfile(members[0])
                if stream is None:
                    raise ArchiveConfigError("Image archive member cannot be read")
                with stream:
                    return stream.read()

            manifest = json.loads(read_member("manifest.json"))
            if (
                not isinstance(manifest, list)
                or len(manifest) != 1
                or not isinstance(manifest[0], dict)
            ):
                raise ArchiveConfigError("Image archive must contain exactly one image")
            image = manifest[0]
            if expected_tag is not None and image.get("RepoTags") != [expected_tag]:
                raise ArchiveConfigError("Image archive tag does not match the evidence")
            config_path = image.get("Config")
            if not isinstance(config_path, str) or not CONFIG_PATH.fullmatch(config_path):
                raise ArchiveConfigError("Image archive config path is invalid")
            digest = hashlib.sha256(read_member(config_path)).hexdigest()
            claimed = config_path.removeprefix("blobs/sha256/").removesuffix(".json")
            if digest != claimed:
                raise ArchiveConfigError(
                    "Image archive config digest does not match its bytes"
                )
            return "sha256:" + digest
    except (OSError, tarfile.TarError, ValueError) as exc:
        if isinstance(exc, ArchiveConfigError):
            raise
        raise ArchiveConfigError("Image archive config cannot be verified") from exc


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument(
        "--tag", help="Require this single RepoTag in the archive manifest."
    )
    arguments = parser.parse_args(argv)
    try:
        print(archive_config_digest(arguments.archive, arguments.tag))
    except ArchiveConfigError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

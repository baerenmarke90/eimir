#!/usr/bin/env python3
"""Probe a source-built Web image using synthetic data and isolated containers.

No account or live deployment is contacted. The two intentionally unsafe control
configurations exist only in temporary test containers and prove that both log
sinks are actually observed. Docker and the built Web image are required.
"""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import tempfile
import time
from uuid import uuid4

WEB_ROOT = Path(__file__).resolve().parents[1]


def docker(*args: str, timeout: int = 30, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["docker", *args], capture_output=True, text=True, check=check, timeout=timeout
    )


def request(container: str, method: str, path: str, marker: str = "") -> tuple[int, str]:
    result = docker(
        "exec", container, "curl", "--silent", "--show-error", "--path-as-is",
        "--noproxy", "127.0.0.1", "--max-time", "3", "--request", method,
        "--header", f"Authorization: Bearer {marker}",
        "--header", f"Cookie: synthetic-session={marker}",
        "--header", f"Referer: https://example.invalid/?token={marker}",
        "--write-out", "\n%{http_code}", f"http://127.0.0.1:8080{path}",
        timeout=8,
    )
    body, _, status = result.stdout.rpartition("\n")
    return int(status), body


def probe(image: str, config: Path | None = None) -> tuple[set[str], int]:
    name = f"eimir-log-privacy-{uuid4().hex}"
    args = [
        "run", "--detach", "--pull", "never", "--name", name,
        "--network", "none", "--add-host", "api:127.0.0.1",
    ]
    if config is not None:
        args += [
            "--mount",
            f"type=bind,src={config},dst=/etc/nginx/templates/default.conf.template,readonly",
        ]
    markers: dict[str, str] = {}
    try:
        docker(*args, image)
        deadline = time.monotonic() + 20
        while True:
            try:
                if request(name, "GET", "/healthz")[0] == 200:
                    break
            except subprocess.CalledProcessError:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError("The isolated Web container did not become ready.")
            time.sleep(0.2)

        status, index = request(name, "GET", "/")
        if status != 200 or "<html" not in index.lower():
            raise RuntimeError("The source-built image did not serve its SPA document.")

        # Follow the canonical entry registry so a new auth route gets coverage.
        entry_paths = re.findall(
            r"^\s*'(/auth/[^']+)':", (WEB_ROOT / "src/client/entryToken.ts").read_text(),
            re.MULTILINE,
        )
        if not entry_paths:
            raise RuntimeError("No canonical authentication entry routes were found.")
        cases = [
            (f"entry-{i}", "GET", path, 200) for i, path in enumerate(entry_paths)
        ] + [
            (f"rejected-{i}", "POST", path, 405) for i, path in enumerate(entry_paths)
        ] + [
            ("malformed", "GET", "/%00", 400),
            ("upstream", "GET", "/api/v1/health", 502),
            (
                "attachment-upstream", "GET",
                "/api/v1/spaces/00000000-0000-0000-0000-000000000001/attachments/"
                "00000000-0000-0000-0000-000000000002/content", 502,
            ),
        ]
        for label, method, path, expected in cases:
            marker = f"synthetic-log-canary-{uuid4().hex}"
            markers[marker] = label
            actual, body = request(name, method, f"{path}?token={marker}&q={marker}", marker)
            if actual != expected:
                raise RuntimeError(f"{label}: expected HTTP {expected}, received {actual}.")
            if expected == 200 and body != index:
                raise RuntimeError(f"{label}: the SPA entry document changed.")

        # Stop first so buffered file logs are flushed. Never follow the image's
        # /dev/stdout and /dev/stderr symlinks while reading copied log files.
        docker("stop", "--time", "5", name)
        logs = docker("logs", name)
        output = logs.stdout + logs.stderr
        with tempfile.TemporaryDirectory(prefix="eimir-log-output-") as directory:
            docker("cp", f"{name}:/var/log/nginx/.", directory)
            for path in Path(directory).rglob("*"):
                if not path.is_symlink() and path.is_file():
                    output += path.read_text(errors="replace")
        return {label for marker, label in markers.items() if marker in output}, len(cases)
    finally:
        docker("rm", "--force", name, check=False)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", required=True, help="Locally source-built Web image")
    args = parser.parse_args()
    # Pin all probes to one local image ID, even if a mutable tag moves later.
    image = docker("image", "inspect", "--format", "{{.Id}}", args.image).stdout.strip()
    if not image.startswith("sha256:"):
        raise RuntimeError("The local Web image ID could not be established.")

    leaks, count = probe(image)
    if leaks:
        raise RuntimeError(f"Synthetic values reached Web request logs: {sorted(leaks)}")
    print(f"Web request-log privacy: {count} route/error cases passed.")

    config = (WEB_ROOT / "nginx.conf").read_text()
    controls = [
        ("access", "access_log off;", "access_log /dev/stdout combined;", "entry-0"),
        ("error", "error_log /dev/null;", "error_log /dev/stderr error;", "upstream"),
    ]
    with tempfile.TemporaryDirectory(prefix="eimir-log-privacy-") as directory:
        for label, safe, unsafe, expected in controls:
            modified, replacements = re.subn(
                rf"(?m)^    {re.escape(safe)}$", f"    {unsafe}", config, count=1
            )
            if replacements != 1:
                raise RuntimeError(f"The isolated {label} control could not be prepared.")
            path = Path(directory) / f"{label}.conf"
            path.write_text(modified)
            path.chmod(0o644)
            observed, _ = probe(image, path)
            if expected not in observed:
                raise RuntimeError(f"The detector missed the isolated {label} control.")
            print(f"Web request-log detector: isolated {label} control detected.")


if __name__ == "__main__":
    main()

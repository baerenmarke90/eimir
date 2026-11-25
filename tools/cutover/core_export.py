#!/usr/bin/env python3
"""Allow-list export of the public ``eimir-core`` snapshot (Decision 0019, #2183).

The export reads one revision of this repository through git (never the working
tree), writes every tracked file that the allow-list includes into an empty
output directory, applies the declared transforms and records a manifest.
Gates then check the output tree itself. A last, separate step can create a
single-commit repository from the output tree in a local directory, so a
rehearsal can push it to a throwaway private repository by hand. This tool
never pushes, never adds a remote and never contacts GitHub.

Subcommands (run ``core_export.py <command> --help``):

* ``export``         write the output tree and its manifest
* ``check``          run the cheap gates on an output tree
* ``check-backend``  run the Core-only backend gates (uv, wheel, start, unit lane)
* ``fresh-history``  create a local single-commit bare repository from the tree
* ``dry-run``        all of the above in one work directory, plus a report

Only the Python standard library and git are needed; the secret scan needs
gitleaks and the backend gates need uv. A missing tool fails its gate unless
the gate is skipped explicitly, and a skipped gate is reported as skipped.
"""

from __future__ import annotations

import argparse
import ast
import contextlib
import dataclasses
import hashlib
import json
import os
import re
import shlex
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from collections import defaultdict
from collections.abc import Iterable, Sequence
from pathlib import Path
from typing import Any

import tomllib

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONFIG = Path(__file__).resolve().with_name("core-allowlist.toml")
MANIFEST_NAME = "manifest.json"
SCHEMA = 1

CHEAP_GATES = ("coverage", "plugin-imports", "openapi-contract", "licence", "secret-scan")
BACKEND_GATES = ("core-install", "core-start", "core-wheel", "core-unit-lane", "core-migrations")
SNAPSHOT_GATES = ("snapshot-secret-scan",)
ALL_GATES = (*CHEAP_GATES, *BACKEND_GATES, *SNAPSHOT_GATES)

# A Core file may import plugin code only below these prefixes, and only when
# the allow-list names the file (test support for the private repository).
ALLOWANCE_PREFIXES = ("backend/tests/",)

GIT_MODES = {"100644", "100755"}


class ExportError(Exception):
    """The allow-list, a transform or the source revision is not exportable."""


# ---------------------------------------------------------------------------
# Allow-list
# ---------------------------------------------------------------------------


def glob_regex(pattern: str) -> re.Pattern[str]:
    """Translate an allow-list pattern into an anchored regular expression.

    ``*`` and ``?`` never cross ``/``; ``**`` stands for whole path segments,
    including none (``a/**/b`` matches ``a/b``, ``docs/**`` matches every file
    below ``docs/``).
    """
    if not pattern or pattern.startswith("/") or "\\" in pattern or pattern.endswith("/"):
        raise ExportError(f"invalid pattern {pattern!r}: use a relative path with '/'")
    segments = pattern.split("/")
    out: list[str] = []
    for index, segment in enumerate(segments):
        last = index == len(segments) - 1
        if segment == "**":
            out.append(".*" if last else "(?:[^/]+/)*")
            continue
        if "**" in segment:
            raise ExportError(f"invalid pattern {pattern!r}: '**' must be a whole segment")
        piece = ""
        for char in segment:
            if char == "*":
                piece += "[^/]*"
            elif char == "?":
                piece += "[^/]"
            else:
                piece += re.escape(char)
        out.append(piece if last else piece + "/")
    return re.compile("".join(out) + r"\Z")


@dataclasses.dataclass(frozen=True)
class Rule:
    kind: str  # include, exclude, forbidden
    id: str
    reason: str
    patterns: tuple[str, ...]
    decision: str | None
    regexes: tuple[re.Pattern[str], ...]

    def matches(self, path: str) -> bool:
        return any(regex.match(path) for regex in self.regexes)

    def stems(self) -> list[str]:
        """Literal path prefixes of the patterns (for the reference report)."""
        stems = []
        for pattern in self.patterns:
            literal = pattern.split("*", 1)[0].split("?", 1)[0].rstrip("/")
            if literal and literal == pattern.removesuffix("/**"):
                stems.append(literal)
        return stems


@dataclasses.dataclass(frozen=True)
class Transform:
    path: str
    reason: str
    decision: str | None
    replace: tuple[tuple[str, str], ...]
    drop_markdown_sections: tuple[str, ...]
    regenerate: str | None


@dataclasses.dataclass(frozen=True)
class Config:
    path: Path
    includes: tuple[Rule, ...]
    excludes: tuple[Rule, ...]
    forbidden: tuple[Rule, ...]
    transforms: tuple[Transform, ...]
    plugin_import_roots: tuple[str, ...]
    plugin_import_allowances: dict[str, str]
    openapi_contract: str | None
    required_files: tuple[tuple[str, tuple[str, ...]], ...]

    def include_rule(self, path: str) -> Rule | None:
        return next((rule for rule in self.includes if rule.matches(path)), None)

    def exclude_rule(self, path: str) -> Rule | None:
        return next((rule for rule in self.excludes if rule.matches(path)), None)

    def forbidden_rule(self, path: str) -> Rule | None:
        return next((rule for rule in self.forbidden if rule.matches(path)), None)

    def exported(self, path: str) -> bool:
        return self.include_rule(path) is not None and self.exclude_rule(path) is None

    def transform_for(self, path: str) -> Transform | None:
        return next((transform for transform in self.transforms if transform.path == path), None)


def _keys(table: dict[str, Any], allowed: set[str], where: str) -> None:
    unknown = set(table) - allowed
    if unknown:
        raise ExportError(f"{where}: unknown keys {sorted(unknown)}")


def _rules(data: dict[str, Any], kind: str) -> tuple[Rule, ...]:
    rules = []
    seen: set[str] = set()
    for table in data.get(kind, []):
        _keys(table, {"id", "reason", "patterns", "decision"}, f"[[{kind}]]")
        rule_id = table.get("id")
        if not rule_id or rule_id in seen:
            raise ExportError(f"[[{kind}]] needs a unique id, got {rule_id!r}")
        seen.add(rule_id)
        if not table.get("reason"):
            raise ExportError(f"[[{kind}]] {rule_id} needs a reason")
        patterns = tuple(table.get("patterns", ()))
        if not patterns:
            raise ExportError(f"[[{kind}]] {rule_id} lists no patterns")
        rules.append(
            Rule(
                kind=kind,
                id=rule_id,
                reason=table["reason"],
                patterns=patterns,
                decision=table.get("decision"),
                regexes=tuple(glob_regex(pattern) for pattern in patterns),
            )
        )
    return tuple(rules)


def load_config(path: Path) -> Config:
    try:
        data = tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, tomllib.TOMLDecodeError) as error:
        raise ExportError(f"cannot read the allow-list {path}: {error}") from error
    _keys(data, {"schema", "include", "exclude", "forbidden", "transform", "gates"}, str(path))
    if data.get("schema") != SCHEMA:
        raise ExportError(f"{path}: schema must be {SCHEMA}")
    includes = _rules(data, "include")
    if not includes:
        raise ExportError(f"{path}: no [[include]] rule")

    transforms = []
    for table in data.get("transform", []):
        _keys(
            table,
            {"path", "reason", "decision", "replace", "drop_markdown_sections", "regenerate"},
            "[[transform]]",
        )
        if not table.get("path") or not table.get("reason"):
            raise ExportError("[[transform]] needs a path and a reason")
        replace = []
        for entry in table.get("replace", []):
            _keys(entry, {"old", "new"}, f"[[transform.replace]] of {table['path']}")
            if not entry.get("old"):
                raise ExportError(f"[[transform.replace]] of {table['path']} needs old text")
            replace.append((entry["old"], entry.get("new", "")))
        regenerate = table.get("regenerate")
        if regenerate not in (None, *REGENERATORS):
            raise ExportError(f"[[transform]] {table['path']}: unknown regenerate {regenerate!r}")
        sections = tuple(table.get("drop_markdown_sections", ()))
        if not (replace or sections or regenerate):
            raise ExportError(f"[[transform]] {table['path']} changes nothing")
        if any(other.path == table["path"] for other in transforms):
            raise ExportError(f"[[transform]] {table['path']} is declared twice")
        transforms.append(
            Transform(
                path=table["path"],
                reason=table["reason"],
                decision=table.get("decision"),
                replace=tuple(replace),
                drop_markdown_sections=sections,
                regenerate=regenerate,
            )
        )

    gates = data.get("gates", {})
    _keys(
        gates,
        {"plugin_import_roots", "plugin_import_allowance", "openapi_contract", "required_file"},
        "[gates]",
    )
    allowances: dict[str, str] = {}
    for entry in gates.get("plugin_import_allowance", []):
        _keys(entry, {"path", "reason"}, "[[gates.plugin_import_allowance]]")
        allowed_path = entry.get("path", "")
        if not entry.get("reason"):
            raise ExportError(f"plugin import allowance {allowed_path!r} needs a reason")
        if not allowed_path.startswith(ALLOWANCE_PREFIXES):
            raise ExportError(
                f"plugin import allowance {allowed_path!r} is outside {ALLOWANCE_PREFIXES}:"
                " Core runtime code never imports plugin code"
            )
        allowances[allowed_path] = entry["reason"]
    required = []
    for entry in gates.get("required_file", []):
        _keys(entry, {"path", "contains"}, "[[gates.required_file]]")
        required.append((entry["path"], tuple(entry.get("contains", ()))))

    return Config(
        path=path,
        includes=includes,
        excludes=_rules(data, "exclude"),
        forbidden=_rules(data, "forbidden"),
        transforms=tuple(transforms),
        plugin_import_roots=tuple(gates.get("plugin_import_roots", ())),
        plugin_import_allowances=allowances,
        openapi_contract=gates.get("openapi_contract"),
        required_files=tuple(required),
    )


# ---------------------------------------------------------------------------
# Source revision
# ---------------------------------------------------------------------------


def git(repo: Path, *args: str, input_bytes: bytes | None = None, env: dict[str, str] | None = None) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        input=input_bytes,
        capture_output=True,
        env=env,
        check=False,
    )
    if result.returncode != 0:
        raise ExportError(f"git {' '.join(args)} failed: {result.stderr.decode('utf-8', 'replace').strip()}")
    return result.stdout


@dataclasses.dataclass(frozen=True)
class Entry:
    path: str
    mode: str
    blob: str
    size: int


def resolve_commit(repo: Path, rev: str) -> str:
    return git(repo, "rev-parse", "--verify", f"{rev}^{{commit}}").decode().strip()


def tree_entries(repo: Path, commit: str) -> list[Entry]:
    raw = git(repo, "ls-tree", "-r", "-l", "-z", "--full-tree", commit)
    entries = []
    for record in raw.split(b"\0"):
        if not record:
            continue
        meta, path = record.split(b"\t", 1)
        mode, kind, blob, size = meta.decode().split()
        name = path.decode("utf-8")
        if kind != "blob" or mode not in GIT_MODES:
            # Symbolic links and submodules cannot be reviewed as file content.
            raise ExportError(f"{name}: unsupported tree entry {mode} {kind}")
        entries.append(Entry(name, mode, blob, int(size)))
    return sorted(entries, key=lambda entry: entry.path)


class BlobReader:
    """Streams blob contents through one ``git cat-file --batch`` process."""

    def __init__(self, repo: Path) -> None:
        self._process = subprocess.Popen(
            ["git", "-C", str(repo), "cat-file", "--batch"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
        )

    def read(self, blob: str) -> bytes:
        assert self._process.stdin and self._process.stdout
        self._process.stdin.write(blob.encode() + b"\n")
        self._process.stdin.flush()
        header = self._process.stdout.readline().decode().split()
        if len(header) != 3 or header[1] != "blob":
            raise ExportError(f"cannot read blob {blob}: {header}")
        size = int(header[2])
        data = self._process.stdout.read(size)
        self._process.stdout.read(1)
        return data

    def close(self) -> None:
        if self._process.stdin:
            self._process.stdin.close()
        if self._process.stdout:
            self._process.stdout.close()
        self._process.wait()

    def __enter__(self) -> BlobReader:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


# ---------------------------------------------------------------------------
# Transforms
# ---------------------------------------------------------------------------


def apply_replacements(path: str, text: str, replacements: Sequence[tuple[str, str]]) -> str:
    for old, new in replacements:
        count = text.count(old)
        if count != 1:
            raise ExportError(f"{path}: transform text must occur exactly once, found {count} times:\n{old}")
        text = text.replace(old, new)
    return text


_HEADING = re.compile(r"^(#{1,6})\s+(.*?)\s*#*\s*$")


def drop_markdown_sections(path: str, text: str, titles: Sequence[str]) -> str:
    """Remove each titled section up to the next heading of the same or a higher level."""
    for title in titles:
        lines = text.splitlines(keepends=True)
        fence = False
        start = level = None
        for index, line in enumerate(lines):
            if line.lstrip().startswith(("```", "~~~")):
                fence = not fence
            match = None if fence else _HEADING.match(line.rstrip("\r\n"))
            if match and match.group(2) == title:
                if start is not None:
                    raise ExportError(f"{path}: section {title!r} occurs more than once")
                start, level = index, len(match.group(1))
        if start is None or level is None:
            raise ExportError(f"{path}: section {title!r} not found")
        end = len(lines)
        fence = False
        for index in range(start + 1, len(lines)):
            line = lines[index]
            if line.lstrip().startswith(("```", "~~~")):
                fence = not fence
            match = None if fence else _HEADING.match(line.rstrip("\r\n"))
            if match and len(match.group(1)) <= level:
                end = index
                break
        text = "".join(lines[:start] + lines[end:])
    return text


def transform_content(transform: Transform, data: bytes) -> bytes:
    if not (transform.replace or transform.drop_markdown_sections):
        return data
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as error:
        raise ExportError(f"{transform.path}: a text transform needs UTF-8 content") from error
    text = apply_replacements(transform.path, text, transform.replace)
    text = drop_markdown_sections(transform.path, text, transform.drop_markdown_sections)
    return text.encode("utf-8")


def command_from_env(value: str) -> list[str]:
    """A command from an environment variable: a JSON list, or a shell-like string."""
    if value.lstrip().startswith("["):
        command = json.loads(value)
        if not (isinstance(command, list) and command and all(isinstance(p, str) for p in command)):
            raise ExportError(f"not a command list: {value}")
        return command
    return shlex.split(value, posix=os.name != "nt")


def _required_uv_version(pyproject: Path) -> str | None:
    data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    required = data.get("tool", {}).get("uv", {}).get("required-version", "")
    return required.removeprefix("==") if required.startswith("==") else None


def uv_command(project: Path) -> list[str]:
    """The uv command, pinned to the project's required version.

    ``EIMIR_CUTOVER_UV`` overrides it (tests, or a uv outside ``PATH``).
    """
    override = os.environ.get("EIMIR_CUTOVER_UV")
    if override:
        return command_from_env(override)
    uv = shutil.which("uv")
    if uv is None:
        raise ExportError("uv is not installed; the backend steps need it")
    required = _required_uv_version(project / "pyproject.toml")
    if required is None:
        return [uv]
    current = subprocess.run([uv, "--version"], capture_output=True, text=True, check=False).stdout
    if current.split()[1:2] == [required]:
        return [uv]
    uvx = shutil.which("uvx")
    if uvx is None:
        raise ExportError(f"uv {required} is required but {current.strip()} is installed")
    return [uvx, "--from", f"uv=={required}", "uv"]


def regenerate_uv_lock(out: Path, path: str) -> None:
    project = out.joinpath(*path.split("/")).parent
    command = [*uv_command(project), "lock", "--offline"]
    result = subprocess.run(command, cwd=project, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise ExportError(f"{path}: {' '.join(command)} failed:\n{result.stderr.strip()}")


REGENERATORS = {"uv-lock": regenerate_uv_lock}


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def long_path(path: Path) -> Path:
    """Windows paths beyond 260 characters need the extended-length prefix."""
    if os.name == "nt":
        absolute = str(path.resolve())
        if not absolute.startswith("\\\\?\\"):
            return Path("\\\\?\\" + absolute)
    return path


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with long_path(path).open("rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export(repo: Path, rev: str, config: Config, out: Path) -> dict[str, Any]:
    """Write the allow-listed tree of ``rev`` into ``out`` and return the manifest."""
    if out.exists() and any(out.iterdir()):
        raise ExportError(f"output directory {out} is not empty")
    out.mkdir(parents=True, exist_ok=True)
    commit = resolve_commit(repo, rev)
    entries = tree_entries(repo, commit)
    paths = {entry.path for entry in entries}

    for transform in config.transforms:
        if transform.path not in paths:
            raise ExportError(f"transform target {transform.path} is not tracked at {commit}")
        if not config.exported(transform.path):
            raise ExportError(f"transform target {transform.path} is not exported")

    files: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    regenerate: list[Transform] = []
    with BlobReader(repo) as blobs:
        for entry in entries:
            include = config.include_rule(entry.path)
            exclude = config.exclude_rule(entry.path)
            if include is None or exclude is not None:
                excluded.append(
                    {
                        "path": entry.path,
                        "size": entry.size,
                        "rule": exclude.id if exclude else None,
                    }
                )
                continue
            forbidden = config.forbidden_rule(entry.path)
            if forbidden is not None:
                raise ExportError(f"{entry.path} would be exported but matches forbidden rule {forbidden.id}")
            data = blobs.read(entry.blob)
            transform = config.transform_for(entry.path)
            if transform is not None:
                data = transform_content(transform, data)
                if transform.regenerate:
                    regenerate.append(transform)
            target = out.joinpath(*entry.path.split("/"))
            long_path(target.parent).mkdir(parents=True, exist_ok=True)
            long_path(target).write_bytes(data)
            if entry.mode == "100755" and os.name != "nt":
                target.chmod(target.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
            files.append(
                {
                    "path": entry.path,
                    "mode": entry.mode,
                    "size": len(data),
                    "sha256": sha256(data),
                    "source_blob": entry.blob,
                    "include": include.id,
                    "transformed": transform is not None,
                }
            )

    for transform in regenerate:
        REGENERATORS[transform.regenerate or ""](out, transform.path)
    by_path = {item["path"]: item for item in files}
    for transform in regenerate:
        target = out.joinpath(*transform.path.split("/"))
        by_path[transform.path]["sha256"] = file_sha256(target)
        by_path[transform.path]["size"] = long_path(target).stat().st_size

    manifest = {
        "schema": SCHEMA,
        "source_commit": commit,
        "source_rev": rev,
        "allowlist_sha256": sha256(config.path.read_bytes()),
        "files": files,
        "excluded": excluded,
    }
    return manifest


def write_manifest(manifest: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(manifest, indent=1, sort_keys=True) + "\n", encoding="utf-8")


def read_manifest(path: Path) -> dict[str, Any]:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ExportError(f"cannot read the manifest {path}: {error}") from error
    if manifest.get("schema") != SCHEMA:
        raise ExportError(f"{path}: unsupported manifest schema")
    return manifest


# ---------------------------------------------------------------------------
# Gates
# ---------------------------------------------------------------------------


@dataclasses.dataclass
class GateResult:
    name: str
    status: str  # passed, failed, skipped
    details: list[str] = dataclasses.field(default_factory=list)
    warnings: list[str] = dataclasses.field(default_factory=list)
    seconds: float = 0.0

    @property
    def failed(self) -> bool:
        return self.status == "failed"


def walk_files(out: Path) -> list[str]:
    root = long_path(out)
    found = []
    for directory, _dirs, names in os.walk(root):
        for name in names:
            full = Path(directory, name)
            found.append(full.relative_to(root).as_posix())
    return sorted(found)


def gate_coverage(out: Path, manifest: dict[str, Any], config: Config) -> GateResult:
    """Every file in the tree is in the manifest, allow-listed, unchanged and not forbidden."""
    result = GateResult("coverage", "passed")
    listed = {item["path"]: item for item in manifest["files"]}
    present = set(walk_files(out))
    for path in sorted(present - set(listed)):
        result.details.append(f"not in the manifest: {path}")
    for path in sorted(set(listed) - present):
        result.details.append(f"missing from the tree: {path}")
    for path in sorted(present & set(listed)):
        if not config.exported(path):
            result.details.append(f"not covered by the allow-list: {path}")
        forbidden = config.forbidden_rule(path)
        if forbidden is not None:
            result.details.append(f"forbidden by {forbidden.id}: {path}")
        if file_sha256(out.joinpath(*path.split("/"))) != listed[path]["sha256"]:
            result.details.append(f"changed after the export: {path}")
    if result.details:
        result.status = "failed"
    else:
        result.details.append(f"{len(present)} files, all allow-listed and unchanged")
    return result


_IMPORT_CALLS = {"import_module", "__import__", "find_loader"}


def _plugin_imports(tree: ast.AST, roots: Sequence[str]) -> list[tuple[int, str]]:
    def is_plugin(name: str) -> bool:
        return any(name == root or name.startswith(root + ".") for root in roots)

    found = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found += [(node.lineno, alias.name) for alias in node.names if is_plugin(alias.name)]
        elif isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
            if is_plugin(node.module):
                found.append((node.lineno, node.module))
        elif isinstance(node, ast.Call) and node.args:
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", None)
            first = node.args[0]
            if (
                name in _IMPORT_CALLS
                and isinstance(first, ast.Constant)
                and isinstance(first.value, str)
                and is_plugin(first.value)
            ):
                found.append((node.lineno, first.value))
    return found


def gate_plugin_imports(out: Path, manifest: dict[str, Any], config: Config) -> GateResult:
    """No exported Python file imports a plugin distribution (AST, all files)."""
    result = GateResult("plugin-imports", "passed")
    if not config.plugin_import_roots:
        result.status = "failed"
        result.details.append("the allow-list names no plugin import roots")
        return result
    importing: set[str] = set()
    checked = 0
    for item in manifest["files"]:
        path = item["path"]
        if not path.endswith((".py", ".pyi")):
            continue
        checked += 1
        source = long_path(out.joinpath(*path.split("/"))).read_bytes()
        try:
            tree = ast.parse(source, filename=path)
        except SyntaxError as error:
            result.details.append(f"{path}: cannot be parsed ({error.msg}, line {error.lineno})")
            continue
        imports = _plugin_imports(tree, config.plugin_import_roots)
        if not imports:
            continue
        importing.add(path)
        if path in config.plugin_import_allowances:
            continue
        for line, module in imports:
            result.details.append(f"{path}:{line} imports {module}")
    for path in sorted(set(config.plugin_import_allowances) - importing):
        result.warnings.append(f"allowance no longer needed (or file not exported): {path}")
    for path in sorted(importing & set(config.plugin_import_allowances)):
        result.warnings.append(f"allowed plugin import: {path}")
    if result.details:
        result.status = "failed"
    else:
        result.details.append(f"{checked} Python files, no plugin import outside the allowances")
    return result


def gate_openapi(out: Path, manifest: dict[str, Any], config: Config, repo: Path) -> GateResult:
    """The exported contract is byte-identical to the contract checked in at the revision."""
    result = GateResult("openapi-contract", "passed")
    path = config.openapi_contract
    if not path:
        return GateResult("openapi-contract", "failed", ["the allow-list names no contract"])
    target = out.joinpath(*path.split("/"))
    if not long_path(target).is_file():
        return GateResult("openapi-contract", "failed", [f"{path} is not exported"])
    exported = long_path(target).read_bytes()
    checked_in = git(repo, "show", f"{manifest['source_commit']}:{path}")
    if exported != checked_in:
        result.status = "failed"
        result.details.append(f"{path} differs from the contract at {manifest['source_commit']}")
        return result
    try:
        document = json.loads(exported)
    except json.JSONDecodeError as error:
        return GateResult("openapi-contract", "failed", [f"{path} is not JSON: {error}"])
    operations = sum(
        1 for item in document.get("paths", {}).values() for method in item if not method.startswith("x-")
    )
    result.details.append(f"{path}: byte-identical, {len(exported)} bytes, {operations} operations")
    return result


def gate_licence(out: Path, config: Config) -> GateResult:
    result = GateResult("licence", "passed")
    if not config.required_files:
        return GateResult("licence", "failed", ["the allow-list names no required file"])
    for path, needles in config.required_files:
        target = out.joinpath(*path.split("/"))
        if not long_path(target).is_file():
            result.details.append(f"missing: {path}")
            continue
        text = long_path(target).read_text(encoding="utf-8")
        for needle in needles:
            if needle not in text:
                result.details.append(f"{path} lacks {needle!r}")
    if result.details:
        result.status = "failed"
    else:
        result.details.append(", ".join(path for path, _ in config.required_files) + " present")
    return result


def gitleaks_invocation(scan: Path, report_dir: Path) -> tuple[list[str], str]:
    """The gitleaks command (run inside ``scan``) and how it names ``report_dir``.

    ``EIMIR_CUTOVER_GITLEAKS_IMAGE`` runs the pinned container image of the
    Secret Scan job (for example ``zricethezav/gitleaks:v8.24.3``) with the scan
    directory mounted read-only; ``EIMIR_CUTOVER_GITLEAKS`` names another
    command; otherwise ``gitleaks`` from ``PATH`` runs.
    """
    image = os.environ.get("EIMIR_CUTOVER_GITLEAKS_IMAGE")
    if image:
        docker = shutil.which("docker")
        if docker is None:
            raise ExportError("EIMIR_CUTOVER_GITLEAKS_IMAGE is set but docker is not installed")
        command = [
            docker,
            "run",
            "--rm",
            "-v",
            f"{scan.resolve()}:/scan:ro",
            "-v",
            f"{report_dir.resolve()}:/report",
            "-w",
            "/scan",
            image,
        ]
        return command, "/report"
    configured = os.environ.get("EIMIR_CUTOVER_GITLEAKS")
    if configured:
        return command_from_env(configured), str(report_dir.resolve())
    found = shutil.which("gitleaks")
    if found is None:
        raise ExportError(
            "gitleaks is not installed; install it, set EIMIR_CUTOVER_GITLEAKS_IMAGE to the"
            " Secret Scan image, or skip the gate explicitly"
        )
    return [found], str(report_dir.resolve())


def _gitleaks(
    name: str, scan: Path, report_dir: Path, mode: Sequence[str], config_tree: Path | None = None
) -> GateResult:
    result = GateResult(name, "passed")
    report_dir.mkdir(parents=True, exist_ok=True)
    try:
        command, seen_dir = gitleaks_invocation(scan, report_dir)
    except ExportError as error:
        return GateResult(name, "failed", [str(error)])
    report_arg = f"{seen_dir}/gitleaks-report.json"
    options: list[str] = []
    if config_tree is not None:
        # A bare snapshot has no files on disk; a checkout of the new repository
        # has them, so its configuration is passed in explicitly.
        for source, option in ((".gitleaks.toml", "--config"), (".gitleaksignore", "--gitleaks-ignore-path")):
            if long_path(config_tree / source).is_file():
                shutil.copyfile(long_path(config_tree / source), report_dir / source)
                options += [option, f"{seen_dir}/{source}"]
    report = report_dir / "gitleaks-report.json"
    report.unlink(missing_ok=True)
    # Run inside the scanned directory: findings carry repository-relative
    # paths, and gitleaks applies that directory's own configuration
    # (.gitleaksignore, inline gitleaks:allow markers) exactly as the new
    # repository's Secret Scan will.
    process = subprocess.run(
        [
            *command,
            *mode,
            *options,
            "--redact",
            "--no-banner",
            "--exit-code",
            "3",
            "--report-format",
            "json",
            "--report-path",
            report_arg,
        ],
        cwd=scan,
        capture_output=True,
        text=True,
        check=False,
    )
    if process.returncode == 3:
        findings = []
        with contextlib.suppress(OSError, json.JSONDecodeError):
            findings = json.loads(report.read_text(encoding="utf-8"))
        result.status = "failed"
        for finding in findings[:50]:
            result.details.append(
                f"{finding.get('File')}:{finding.get('StartLine')} {finding.get('RuleID')}"
                f" (fingerprint {finding.get('Fingerprint')})"
            )
        if not findings:
            result.details.append(f"gitleaks reported findings; see {report}")
        return result
    if process.returncode != 0:
        result.status = "failed"
        result.details.append(f"gitleaks failed ({process.returncode}): {process.stderr.strip()[-2000:]}")
        return result
    result.details.append("gitleaks found no secret")
    return result


def gate_secret_scan(out: Path, report_dir: Path) -> GateResult:
    """gitleaks over the output tree in directory mode.

    The history fingerprints in ``.gitleaksignore`` name commits of this
    repository and cannot match a fresh history, so they are deliberately not
    translated: a finding has to be resolved in the source (for example with an
    inline ``gitleaks:allow`` marker on a reviewed false positive) or excluded.
    """
    return _gitleaks("secret-scan", out, report_dir / "secret-scan", ["dir", "."])


def gate_snapshot_secret_scan(snapshot: Path, out: Path, report_dir: Path) -> GateResult:
    """gitleaks over the single-commit snapshot, as the new repository's Secret Scan runs it.

    The configuration files come from the exported tree, which is the snapshot's content.
    """
    return _gitleaks(
        "snapshot-secret-scan",
        snapshot,
        report_dir / "snapshot-secret-scan",
        ["git", ".", "--log-opts=HEAD"],
        config_tree=out,
    )


def run_cheap_gates(
    out: Path,
    manifest: dict[str, Any],
    config: Config,
    repo: Path,
    report_dir: Path,
    skip: Iterable[str] = (),
) -> list[GateResult]:
    skipped = set(skip)
    runners = {
        "coverage": lambda: gate_coverage(out, manifest, config),
        "plugin-imports": lambda: gate_plugin_imports(out, manifest, config),
        "openapi-contract": lambda: gate_openapi(out, manifest, config, repo),
        "licence": lambda: gate_licence(out, config),
        "secret-scan": lambda: gate_secret_scan(out, report_dir),
    }
    return [_timed(name, runners[name], skipped) for name in CHEAP_GATES]


def _timed(name: str, runner: Any, skipped: set[str]) -> GateResult:
    if name in skipped:
        return GateResult(name, "skipped", ["skipped on request"])
    started = time.monotonic()
    try:
        result = runner()
    except ExportError as error:
        result = GateResult(name, "failed", [str(error)])
    result.seconds = round(time.monotonic() - started, 1)
    return result


# ---------------------------------------------------------------------------
# Core-only backend gates
# ---------------------------------------------------------------------------

CORE_START_PROBE = r"""
import importlib.util
import sys

import eimir

for root in sys.argv[1:]:
    assert importlib.util.find_spec(root) is None, f"{root} is installed"

from fastapi.testclient import TestClient

from eimir.main import create_app
from eimir.plugins.loader import loaded_plugins

assert loaded_plugins().names == (), loaded_plugins().names
response = TestClient(create_app()).get("/api/v1/health")
assert response.status_code == 200, (response.status_code, response.text[:500])
print(f"Core {eimir.__file__}: health {response.status_code}, no plugin loaded")
"""


def _core_env(venv: Path) -> dict[str, str]:
    env = dict(os.environ)
    env.update(
        {
            "UV_PROJECT_ENVIRONMENT": str(venv),
            "EIMIR_ENVIRONMENT": "test",
            "EIMIR_PLUGINS": "",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    env.pop("VIRTUAL_ENV", None)
    return env


def _run(command: Sequence[str], *, cwd: Path, env: dict[str, str], timeout: int = 3600) -> tuple[int, str]:
    process = subprocess.run(
        list(command), cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout, check=False
    )
    return process.returncode, (process.stdout + process.stderr).strip()


def run_backend_gates(
    out: Path,
    config: Config,
    work: Path,
    skip: Iterable[str] = (),
    pytest_args: Sequence[str] = (),
) -> list[GateResult]:
    """Core-only lane on a copy of the exported tree: the plugin distributions are not installed.

    Installing the project writes egg-info next to its sources, so the lane runs
    on a byte-identical copy in ``work``; the exported tree itself stays
    unchanged (the coverage gate is run again afterwards to prove it).
    """
    skipped = set(skip)
    roots = list(config.plugin_import_roots)
    results: list[GateResult] = []
    if os.name == "nt":
        # The backend itself needs POSIX (fcntl in the deletion journal).
        reason = "the Core backend needs a POSIX system; run these gates in CI, WSL or on Linux"
        return [
            GateResult(name, "skipped" if name in skipped else "failed", [reason]) for name in BACKEND_GATES
        ]
    lane = work / "lane-tree"
    shutil.rmtree(lane, ignore_errors=True)
    shutil.copytree(out, lane)
    backend = lane / "backend"
    venv = work / "core-venv"
    env = _core_env(venv)
    try:
        uv = uv_command(backend)
    except ExportError as error:
        return [GateResult(name, "failed", [str(error)]) for name in BACKEND_GATES]

    def install() -> GateResult:
        code, output = _run([*uv, "sync", "--frozen"], cwd=backend, env=env)
        if code != 0:
            return GateResult("core-install", "failed", [output[-3000:]])
        return GateResult("core-install", "passed", ["uv sync --frozen (Core only) succeeded"])

    def start() -> GateResult:
        code, output = _run(
            [*uv, "run", "--frozen", "--no-sync", "python", "-c", CORE_START_PROBE, *roots],
            cwd=backend,
            env=env,
        )
        if code != 0:
            return GateResult("core-start", "failed", [output[-3000:]])
        return GateResult("core-start", "passed", [output.splitlines()[-1]])

    def wheel() -> GateResult:
        # Build from a copy: setuptools writes egg-info next to the sources.
        source = work / "wheel-source"
        shutil.rmtree(source, ignore_errors=True)
        shutil.copytree(long_path(backend), long_path(source))
        dist = work / "dist"
        shutil.rmtree(dist, ignore_errors=True)
        code, output = _run([*uv, "build", "--wheel", "--out-dir", str(dist)], cwd=source, env=env)
        if code != 0:
            return GateResult("core-wheel", "failed", [output[-3000:]])
        code, output = _run(
            [sys.executable, str(ROOT / "tools/ci/check_core_wheel.py"), str(dist)],
            cwd=ROOT,
            env=env,
        )
        status = "passed" if code == 0 else "failed"
        return GateResult("core-wheel", status, [output[-3000:]])

    def unit_lane() -> GateResult:
        lane_env = dict(env)
        lane_env.pop("EIMIR_DATABASE_URL", None)
        lane_env.pop("EIMIR_TEST_DATABASE_URL", None)
        code, output = _run(
            [
                *uv,
                "run",
                "--frozen",
                "--no-sync",
                "pytest",
                "-p",
                "no:cacheprovider",
                "-m",
                "not integration",
                "-q",
                *pytest_args,
            ],
            cwd=backend,
            env=lane_env,
        )
        tail = output.splitlines()[-1] if output else ""
        if code != 0:
            return GateResult("core-unit-lane", "failed", [output[-4000:]])
        return GateResult("core-unit-lane", "passed", [tail])

    def migrations() -> GateResult:
        if not os.environ.get("EIMIR_TEST_DATABASE_URL"):
            raise _Skip("EIMIR_TEST_DATABASE_URL is not set")
        db_env = dict(env)
        db_env["EIMIR_DATABASE_URL"] = os.environ["EIMIR_TEST_DATABASE_URL"]
        details = []
        for command in (
            ["alembic", "upgrade", "head"],
            ["python", "-m", "scripts.schema_fingerprint", "check"],
        ):
            code, output = _run([*uv, "run", "--frozen", "--no-sync", *command], cwd=backend, env=db_env)
            if code != 0:
                return GateResult("core-migrations", "failed", [" ".join(command), output[-3000:]])
            details.append(" ".join(command) + ": ok")
        return GateResult("core-migrations", "passed", details)

    runners = {
        "core-install": install,
        "core-start": start,
        "core-wheel": wheel,
        "core-unit-lane": unit_lane,
        "core-migrations": migrations,
    }
    for name in BACKEND_GATES:
        if name != "core-install" and results and results[0].failed:
            results.append(GateResult(name, "failed", ["the Core-only install failed"]))
            continue
        started = time.monotonic()
        try:
            result = _timed(name, runners[name], skipped)
        except _Skip as reason:
            result = GateResult(name, "skipped", [str(reason)])
        result.seconds = round(time.monotonic() - started, 1)
        results.append(result)
    return results


class _Skip(Exception):
    pass


# ---------------------------------------------------------------------------
# Fresh history
# ---------------------------------------------------------------------------


def fresh_history(
    repo: Path,
    out: Path,
    manifest: dict[str, Any],
    config: Config,
    target: Path,
    *,
    message: str,
    author: str,
    date: str | None,
) -> str:
    """Create a local bare repository with one commit holding exactly the output tree.

    The commit is reproducible: the same tree, message, author and date give
    the same commit id. No remote is configured and nothing is pushed.
    """
    coverage = gate_coverage(out, manifest, config)
    if coverage.failed:
        raise ExportError("the output tree fails the coverage gate:\n" + "\n".join(coverage.details))
    if target.exists() and any(target.iterdir()):
        raise ExportError(f"{target} is not empty")
    match = re.fullmatch(r"\s*(.+?)\s*<([^<>]+)>\s*", author)
    if not match:
        raise ExportError(f"author must look like 'Name <email>', got {author!r}")
    name, email = match.groups()
    target.mkdir(parents=True, exist_ok=True)
    git(target, "init", "--quiet", "--bare", "--initial-branch=main")

    files = sorted(manifest["files"], key=lambda item: item["path"])
    # git opens the paths itself; core.longpaths covers long Windows paths.
    root = out.resolve()
    sources = "\n".join(str(root.joinpath(*item["path"].split("/"))) for item in files)
    blobs = git(
        target,
        "-c",
        "core.longpaths=true",
        "hash-object",
        "-w",
        "--no-filters",
        "--stdin-paths",
        input_bytes=sources.encode(),
    ).split()
    if len(blobs) != len(files):
        raise ExportError("git hash-object returned an unexpected number of objects")
    index = "".join(
        f"{item['mode']} {blob.decode()}\t{item['path']}\n" for item, blob in zip(files, blobs, strict=True)
    )
    index_file = target / "snapshot.index"
    env = dict(os.environ, GIT_INDEX_FILE=str(index_file))
    git(target, "update-index", "--add", "--index-info", input_bytes=index.encode(), env=env)
    tree = git(target, "write-tree", env=env).decode().strip()
    index_file.unlink()
    when = date or git(repo, "show", "-s", "--format=%cI", manifest["source_commit"]).decode().strip()
    env = dict(
        os.environ,
        GIT_AUTHOR_NAME=name,
        GIT_AUTHOR_EMAIL=email,
        GIT_AUTHOR_DATE=when,
        GIT_COMMITTER_NAME=name,
        GIT_COMMITTER_EMAIL=email,
        GIT_COMMITTER_DATE=when,
    )
    commit = git(target, "commit-tree", tree, "-m", message, env=env).decode().strip()
    git(target, "update-ref", "refs/heads/main", commit)
    if git(target, "remote").strip():
        raise ExportError(f"{target} unexpectedly has a remote")
    # Verify the commit against the manifest: same paths, modes and contents.
    listed = git(target, "ls-tree", "-r", "-z", commit).split(b"\0")
    actual = {}
    for record in listed:
        if record:
            meta, path = record.split(b"\t", 1)
            mode, _kind, blob = meta.decode().split()
            actual[path.decode()] = (mode, blob)
    expected = {item["path"]: (item["mode"], blob.decode()) for item, blob in zip(files, blobs, strict=True)}
    if actual != expected:
        raise ExportError("the snapshot commit does not match the manifest")
    return commit


# ---------------------------------------------------------------------------
# Report
# ---------------------------------------------------------------------------

MEDIA_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp", ".gif", ".webm", ".mp4", ".mov")


def _mb(size: int) -> str:
    return f"{size / 1_048_576:.1f} MB"


def references_to_excluded(
    out: Path, manifest: dict[str, Any], config: Config
) -> dict[str, dict[str, list[str]]]:
    """Where exported text files still name excluded directories or files (informational)."""
    needles = sorted({stem for rule in config.excludes for stem in rule.stems()})
    found: dict[str, dict[str, list[str]]] = {needle: {"code": [], "docs": []} for needle in needles}
    for item in manifest["files"]:
        path = item["path"]
        if path.endswith(MEDIA_SUFFIXES) or item["size"] > 2_000_000:
            continue
        try:
            text = long_path(out.joinpath(*path.split("/"))).read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        kind = "docs" if path.startswith("docs/") or path.endswith(".md") else "code"
        for needle in needles:
            if needle in text:
                found[needle][kind].append(path)
    return found


def build_report(
    manifest: dict[str, Any],
    config: Config,
    gates: Sequence[GateResult],
    out: Path | None,
    snapshot: str | None,
) -> dict[str, Any]:
    files = manifest["files"]
    excluded = manifest["excluded"]
    include_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for item in files:
        include_stats[item["include"]][0] += 1
        include_stats[item["include"]][1] += item["size"]
    exclude_stats: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    unlisted: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for item in excluded:
        if item["rule"]:
            exclude_stats[item["rule"]][0] += 1
            exclude_stats[item["rule"]][1] += item["size"]
        else:
            top = "/".join(item["path"].split("/")[:2]) if "/" in item["path"] else item["path"]
            unlisted[top][0] += 1
            unlisted[top][1] += item["size"]
    decisions = {rule.id: rule.decision for rule in (*config.includes, *config.excludes) if rule.decision}
    return {
        "source_commit": manifest["source_commit"],
        "source_rev": manifest["source_rev"],
        "allowlist_sha256": manifest["allowlist_sha256"],
        "snapshot_commit": snapshot,
        "tracked": {
            "files": len(files) + len(excluded),
            "bytes": sum(i["size"] for i in files) + sum(i["size"] for i in excluded),
        },
        "exported": {"files": len(files), "bytes": sum(item["size"] for item in files)},
        "excluded": {"files": len(excluded), "bytes": sum(item["size"] for item in excluded)},
        "include_groups": {key: {"files": v[0], "bytes": v[1]} for key, v in sorted(include_stats.items())},
        "exclude_groups": {
            key: {"files": v[0], "bytes": v[1], "decision": decisions.get(key)}
            for key, v in sorted(exclude_stats.items())
        },
        "unlisted": {key: {"files": v[0], "bytes": v[1]} for key, v in sorted(unlisted.items())},
        "transforms": [
            {"path": t.path, "reason": t.reason, "decision": t.decision} for t in config.transforms
        ],
        "largest_exported": [
            {"path": item["path"], "bytes": item["size"]}
            for item in sorted(files, key=lambda item: -item["size"])[:15]
        ],
        "gates": [dataclasses.asdict(gate) for gate in gates],
        "references_to_excluded": references_to_excluded(out, manifest, config) if out else {},
    }


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# eimir-core export dry run",
        "",
        f"- Source commit: `{report['source_commit']}` (`{report['source_rev']}`)",
        f"- Allow-list SHA-256: `{report['allowlist_sha256']}`",
        f"- Snapshot commit (local, not pushed): `{report['snapshot_commit'] or 'not created'}`",
        f"- Tracked: {report['tracked']['files']} files, {_mb(report['tracked']['bytes'])}",
        f"- Exported: {report['exported']['files']} files, {_mb(report['exported']['bytes'])}",
        f"- Excluded: {report['excluded']['files']} files, {_mb(report['excluded']['bytes'])}",
        "",
        "## Gates",
        "",
        "| Gate | Result | Seconds | Details |",
        "| --- | --- | --- | --- |",
    ]
    for gate in report["gates"]:
        detail = "; ".join(gate["details"][:3]).replace("|", "\\|").replace("\n", " ")
        if len(gate["details"]) > 3:
            detail += f" (+{len(gate['details']) - 3} more)"
        lines.append(f"| {gate['name']} | {gate['status']} | {gate['seconds']} | {detail[:400]} |")
    warnings = [(gate["name"], warning) for gate in report["gates"] for warning in gate["warnings"]]
    if warnings:
        lines += ["", "Warnings:", ""] + [f"- {name}: {warning}" for name, warning in warnings]
    lines += ["", "## Included groups", "", "| Group | Files | Size |", "| --- | --- | --- |"]
    for key, value in report["include_groups"].items():
        lines.append(f"| {key} | {value['files']} | {_mb(value['bytes'])} |")
    lines += [
        "",
        "## Excluded groups",
        "",
        "| Group | Files | Size | Decision |",
        "| --- | --- | --- | --- |",
    ]
    for key, value in report["exclude_groups"].items():
        lines.append(f"| {key} | {value['files']} | {_mb(value['bytes'])} | {value['decision'] or ''} |")
    lines += ["", "## Not listed (excluded by default)", "", "| Path | Files | Size |", "| --- | --- | --- |"]
    for key, value in report["unlisted"].items():
        lines.append(f"| {key} | {value['files']} | {_mb(value['bytes'])} |")
    lines += ["", "## Transforms", ""]
    lines += [
        f"- `{t['path']}`: {t['reason']}" + (f" ({t['decision']})" if t["decision"] else "")
        for t in report["transforms"]
    ]
    lines += ["", "## Largest exported files", ""]
    lines += [f"- `{item['path']}`: {_mb(item['bytes'])}" for item in report["largest_exported"]]
    references = report["references_to_excluded"]
    if references:
        lines += [
            "",
            "## Exported files that still name excluded paths",
            "",
            "Informational input for the cut-over checklist; not a gate.",
            "",
            "| Excluded path | Code/CI files | Docs files | Code/CI examples |",
            "| --- | --- | --- | --- |",
        ]
        for needle, kinds in references.items():
            if kinds["code"] or kinds["docs"]:
                examples = ", ".join(f"`{path}`" for path in kinds["code"][:4])
                lines.append(f"| `{needle}` | {len(kinds['code'])} | {len(kinds['docs'])} | {examples} |")
    return "\n".join(lines) + "\n"


# ---------------------------------------------------------------------------
# Command line
# ---------------------------------------------------------------------------


def _print_gates(results: Sequence[GateResult]) -> None:
    for result in results:
        print(f"[{result.status.upper():7}] {result.name} ({result.seconds}s)")
        for detail in result.details[:20]:
            print(f"          {detail}")
        if len(result.details) > 20:
            print(f"          ... {len(result.details) - 20} more")
        for warning in result.warnings:
            print(f"   warning {warning}")


def _skip_list(values: Sequence[str] | None) -> list[str]:
    skipped = [name for value in values or () for name in value.split(",") if name]
    unknown = set(skipped) - set(ALL_GATES)
    if unknown:
        raise ExportError(f"unknown gates to skip: {sorted(unknown)}")
    return skipped


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--repo", type=Path, default=ROOT, help="source repository (default: this checkout)")
    parser.add_argument("--allowlist", type=Path, default=DEFAULT_CONFIG)
    commands = parser.add_subparsers(dest="command", required=True)

    export_parser = commands.add_parser("export", help="write the output tree and its manifest")
    export_parser.add_argument("--rev", default="HEAD")
    export_parser.add_argument("--out", type=Path, required=True)
    export_parser.add_argument("--manifest", type=Path, required=True)

    for name in ("check", "check-backend"):
        sub = commands.add_parser(name, help=f"{name.replace('-', ' ')} gates on an output tree")
        sub.add_argument("--tree", type=Path, required=True)
        sub.add_argument("--manifest", type=Path, required=True)
        sub.add_argument("--work", type=Path, required=True, help="directory for reports and build products")
        sub.add_argument("--skip", action="append", help="gate names to skip, comma-separated")

    history = commands.add_parser("fresh-history", help="create a local single-commit bare repository")
    history.add_argument("--tree", type=Path, required=True)
    history.add_argument("--manifest", type=Path, required=True)
    history.add_argument("--target", type=Path, required=True)
    history.add_argument("--message", default="eimir. Core snapshot")
    history.add_argument("--author", default="eimir. <snapshot@eimir.invalid>")
    history.add_argument("--date", help="commit date (default: the source commit's date)")

    dry = commands.add_parser("dry-run", help="export, check and create the snapshot in one work directory")
    dry.add_argument("--rev", default="HEAD")
    dry.add_argument("--work", type=Path, help="empty work directory (default: a new temporary one)")
    dry.add_argument("--backend", action="store_true", help="also run the Core-only backend gates")
    dry.add_argument("--skip", action="append", help="gate names to skip, comma-separated")
    dry.add_argument("--report", type=Path, help="also copy report.md and report.json here")

    args = parser.parse_args(argv)
    # Progress lines appear immediately, also when the output goes to a CI log or a file.
    with contextlib.suppress(AttributeError):
        sys.stdout.reconfigure(line_buffering=True)  # type: ignore[union-attr]
    try:
        config = load_config(args.allowlist)
        repo = args.repo.resolve()
        if args.command == "export":
            manifest = export(repo, args.rev, config, args.out)
            write_manifest(manifest, args.manifest)
            print(f"Exported {len(manifest['files'])} files of {manifest['source_commit']} to {args.out}")
            return 0
        if args.command in ("check", "check-backend"):
            manifest = read_manifest(args.manifest)
            skip = _skip_list(args.skip)
            if args.command == "check":
                results = run_cheap_gates(args.tree, manifest, config, repo, args.work, skip)
            else:
                results = run_backend_gates(args.tree, config, args.work, skip)
                results.append(gate_coverage(args.tree, manifest, config))
                results[-1].name = "coverage-after-backend"
            _print_gates(results)
            return 1 if any(result.failed for result in results) else 0
        if args.command == "fresh-history":
            manifest = read_manifest(args.manifest)
            commit = fresh_history(
                repo,
                args.tree,
                manifest,
                config,
                args.target,
                message=args.message,
                author=args.author,
                date=args.date,
            )
            print(f"Snapshot commit {commit} in {args.target} (bare, no remote, not pushed)")
            return 0
        return dry_run(args, config, repo)
    except ExportError as error:
        print(f"error: {error}", file=sys.stderr)
        return 2


def dry_run(args: argparse.Namespace, config: Config, repo: Path) -> int:
    skip = _skip_list(args.skip)
    work = args.work or Path(tempfile.mkdtemp(prefix="eimir-core-export-"))
    if work.exists() and any(work.iterdir()):
        raise ExportError(f"work directory {work} is not empty")
    out, report_dir = work / "tree", work / "report"
    print(f"Work directory: {work}")
    started = time.monotonic()
    manifest = export(repo, args.rev, config, out)
    write_manifest(manifest, report_dir / MANIFEST_NAME)
    print(f"Exported {len(manifest['files'])} files in {time.monotonic() - started:.0f}s")
    results = run_cheap_gates(out, manifest, config, repo, report_dir, skip)
    if args.backend:
        results += run_backend_gates(out, config, work / "backend-work", skip)
        after = gate_coverage(out, manifest, config)
        after.name = "coverage-after-backend"
        results.append(after)
    snapshot = None
    if not any(result.failed for result in results):
        snapshot = fresh_history(
            repo,
            out,
            manifest,
            config,
            work / "snapshot.git",
            message="eimir. Core snapshot",
            author="eimir. <snapshot@eimir.invalid>",
            date=None,
        )
        results.append(
            _timed(
                "snapshot-secret-scan",
                lambda: gate_snapshot_secret_scan(work / "snapshot.git", out, report_dir),
                set(skip),
            )
        )
    report = build_report(manifest, config, results, out, snapshot)
    (report_dir / "report.json").write_text(json.dumps(report, indent=1) + "\n", encoding="utf-8")
    (report_dir / "report.md").write_text(render_markdown(report), encoding="utf-8")
    if args.report:
        args.report.mkdir(parents=True, exist_ok=True)
        shutil.copy2(report_dir / "report.json", args.report / "report.json")
        shutil.copy2(report_dir / "report.md", args.report / "report.md")
    _print_gates(results)
    print(f"Snapshot: {snapshot or 'not created (a gate failed)'}")
    print(f"Report: {report_dir / 'report.md'}")
    return 1 if any(result.failed for result in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())

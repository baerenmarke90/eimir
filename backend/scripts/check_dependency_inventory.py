"""Compare direct dependencies with locked installation and documentation.

The direct dependencies are those of the Core project and of every workspace
member next to it (the Pro distribution in ``pro/``, #2182). Dependencies on
another of these projects are not third-party packages and are not documented.
"""

from __future__ import annotations

import argparse
import re
import tomllib
from importlib.metadata import PackageNotFoundError, metadata, version
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name

MARKDOWN_ROW = re.compile(
    r"^\|\s*(?P<name>[^|]+?)\s*\|\s*(?P<version>[^|]+?)\s*\|\s*PyPI\s*\|"
    r"\s*(?P<license>[^|]+?)\s*\|$"
)


def _dependency_names(pyproject_paths: list[Path]) -> set[str]:
    requirements: list[str] = []
    projects: set[str] = set()
    for pyproject_path in pyproject_paths:
        with pyproject_path.open("rb") as handle:
            project = tomllib.load(handle)
        projects.add(canonicalize_name(project["project"]["name"]))
        requirements.extend(project["project"]["dependencies"])
        for group in project.get("dependency-groups", {}).values():
            requirements.extend(group)
    return {canonicalize_name(Requirement(value).name) for value in requirements} - projects


def _documented_dependencies(documentation_path: Path) -> dict[str, tuple[str, str]]:
    result: dict[str, tuple[str, str]] = {}
    for raw_line in documentation_path.read_text(encoding="utf-8").splitlines():
        match = MARKDOWN_ROW.match(raw_line)
        if match is None:
            continue
        name = canonicalize_name(Requirement(match.group("name").strip(" `")).name)
        documented_version = match.group("version").strip(" `")
        documented_license = match.group("license").strip(" `*")
        result[name] = (documented_version, documented_license)
    return result


def _installed_license(package_name: str) -> str:
    package_metadata = metadata(package_name)
    license_expression = package_metadata.get("License-Expression")
    if license_expression:
        return license_expression.strip()
    legacy_license = package_metadata.get("License")
    if legacy_license:
        return legacy_license.strip()
    return ""


def check_inventory(pyproject_paths: list[Path], documentation_path: Path) -> list[str]:
    required = _dependency_names(pyproject_paths)
    documented = _documented_dependencies(documentation_path)
    errors: list[str] = []

    for package_name in sorted(required):
        entry = documented.get(package_name)
        if entry is None:
            errors.append(f"{package_name}: missing from {documentation_path}")
            continue
        documented_version, documented_license = entry
        try:
            installed_version = version(package_name)
            installed_license = _installed_license(package_name)
        except PackageNotFoundError:
            errors.append(f"{package_name}: not installed in the locked environment")
            continue
        if documented_version != installed_version:
            errors.append(
                f"{package_name}: documented {documented_version}, installed {installed_version}"
            )
        if documented_license != installed_license:
            errors.append(
                f"{package_name}: documented license {documented_license!r}, "
                f"package metadata {installed_license!r}"
            )

    unexpected = sorted(set(documented) - required)
    for package_name in unexpected:
        errors.append(f"{package_name}: documented as a PyPI dependency but not declared directly")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("documentation", type=Path)
    parser.add_argument(
        "--pyproject",
        type=Path,
        action="append",
        help="Project file to read; defaults to pyproject.toml and pro/pyproject.toml.",
    )
    arguments = parser.parse_args()
    pyprojects = arguments.pyproject or [
        path for path in (Path("pyproject.toml"), Path("pro/pyproject.toml")) if path.is_file()
    ]
    errors = check_inventory(pyprojects, arguments.documentation)
    if errors:
        print("Dependency inventory is inconsistent:")
        for error in errors:
            print(f"- {error}")
        return 1
    print("Dependency inventory matches installation and package metadata.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

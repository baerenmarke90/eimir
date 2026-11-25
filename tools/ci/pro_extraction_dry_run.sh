#!/usr/bin/env bash
# Extraction dry run of the Pro distribution (Decision 0017, Phase 2, #2182).
#
# Proves that backend/pro is self-contained: it is copied into an empty
# directory, installed on top of a Core wheel built from this checkout (not
# from the uv workspace), and its tests run there. The Core test support
# (`tests`, the contract and the repository documents the tests read) comes
# from this checkout, the way an extracted Pro repository uses a pinned Core
# checkout. Nothing is published or pushed.
#
# EIMIR_CORE_ROOT names another Core tree, for example the allow-listed export
# of tools/cutover/core_export.py (Decision 0019, #2183): the Core wheel, the
# Core test support and the demo assets then come from that tree, the way the
# private repository pins a public eimir-core revision. EIMIR_PRO_ROOT names
# the eimir-pro export tree the Pro distribution is copied from. The locked
# third-party versions always come from this checkout.
#
# Usage: tools/ci/pro_extraction_dry_run.sh [pytest arguments]
# Default pytest selection: the unit tests (-m "not integration").
set -euo pipefail

repo="$(git rev-parse --show-toplevel)"
core="${EIMIR_CORE_ROOT:-$repo}"
pro_root="${EIMIR_PRO_ROOT:-$repo}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Building the Core wheel from $core/backend"
# Through an sdist: a direct wheel build would reuse and leave backend/build,
# and stale files there could end up in the wheel.
(cd "$core/backend" && uv build --package eimir --out-dir "$work/dist" >/dev/null)

echo "Copying $pro_root/backend/pro into a clean directory"
cp -R "$pro_root/backend/pro" "$work/pro"
rm -rf "$work/pro/.venv" "$work/pro/build" "$work/pro"/src/*.egg-info
# An extracted repository replaces the workspace source of Core with a pinned
# Core reference; here the Core wheel built above takes that place.
sed -i -E '/^\[tool\.uv\.sources\]\r?$/,/^\r?$/d' "$work/pro/pyproject.toml"
if grep -q "workspace = true" "$work/pro/pyproject.toml"; then
  echo "backend/pro/pyproject.toml still names a workspace source" >&2
  exit 1
fi

echo "Installing the locked third-party dependencies (runtime and test tools), the Core wheel and Pro"
(cd "$repo/backend" && uv export --frozen --all-packages --no-emit-workspace --no-hashes \
  --format requirements-txt >"$work/requirements.txt")
uv venv --quiet --python "${PYTHON:-python3}" "$work/venv"
export VIRTUAL_ENV="$work/venv"
uv pip install --quiet -r "$work/requirements.txt"
uv pip install --quiet --no-deps "$work"/dist/eimir-*.whl
# Pro from the copy, not editable and without the workspace source of Core.
uv pip install --quiet --no-deps "$work/pro"

python_bin="$work/venv/bin/python"
path_separator=":"
if [ ! -x "$python_bin" ]; then
  python_bin="$work/venv/Scripts/python.exe"  # Windows
  path_separator=";"
fi
"$python_bin" - <<'PY'
import importlib.util
import sys

import eimir
import eimir_pro

assert "site-packages" in eimir.__file__, eimir.__file__
assert "site-packages" in eimir_pro.__file__, eimir_pro.__file__
assert importlib.util.find_spec("eimir_pro.plugin") is not None
assert importlib.util.find_spec("eimir.pro_plugin") is None
print(f"Core {eimir.__file__}\nPro  {eimir_pro.__file__}")
sys.exit(0)
PY

echo "Running the Pro tests from the copy"
cd "$work/pro"
# The demo assets are Core runtime data outside the wheel: the Core image ships
# them next to the application, which finds them relative to its working directory.
cp -R "$core/backend/demo_assets" demo_assets
# The pytest settings an extracted Pro repository carries itself (the Core
# settings live in backend/pyproject.toml and point at the Core source tree).
cat >pytest.ini <<'INI'
[pytest]
asyncio_mode = auto
markers =
    integration: needs a reachable PostgreSQL instance
    requires_pro: needs the Pro plugin loaded; skipped in the Core-only configuration
filterwarnings =
    error::DeprecationWarning
INI
if [ "$#" -eq 0 ]; then
  set -- -m "not integration"
fi
# Only the Core test support comes from the Core tree; eimir and eimir_pro are
# the installed copies (checked above). A caller's PYTHONPATH is kept.
PYTHONPATH="$core/backend${PYTHONPATH:+$path_separator$PYTHONPATH}" \
  EIMIR_PLUGINS="${EIMIR_PLUGINS-pro}" \
  "$python_bin" -m pytest -p no:cacheprovider -q pro_tests "$@"

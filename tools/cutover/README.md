# Export of the two repositories of the split

Decision 0019 ([#2183](https://github.com/baerenmarke90/eimir/issues/2183)) splits this repository into a public
`eimir-core` repository and a private `eimir-pro` repository, each with a fresh single-commit history. This directory
holds the tool that produces both trees from one revision and the checks they must pass, alone and together.
**Nothing here creates, pushes to or changes another repository.**

| File | What it is |
| --- | --- |
| [`core-allowlist.toml`](core-allowlist.toml) | The allow-list of the public Core tree: which tracked files go public, which stay out, hard guards, the transforms and the gate settings. It is reviewable data, not code. |
| [`pro-allowlist.toml`](pro-allowlist.toml) | The allow-list of the private Pro tree, in the same format: what the Core tree excludes for the private repository, the files both carry, the files only the private repository has, and the split settings. |
| [`pro/`](pro) | The two files only the private tree has: an all-rights-reserved `LICENSE` and a `README.md`. |
| [`core_export.py`](core_export.py) | The export, the gates, the local snapshots and the report. Python standard library and git only. |
| [`test_core_export.py`](test_core_export.py) | Tests on small synthetic repositories, including a failing case for every gate. |

## What the tool does

1. **Export.** It reads one revision through git (never the working tree) and writes every tracked file that an
   `[[include]]` rule matches and no `[[exclude]]` rule matches into an empty directory, byte for byte. Anything not
   listed is excluded. A path that matches a `[[forbidden]]` rule stops the export even if an include rule was
   widened by mistake (Core: Pro code, signing material, the official publish workflows; Pro: signing material, a
   CLA or PolyForm file, Core sources). A manifest records every file with its SHA-256, its target path and its
   source path, and every excluded file with the rule that excluded it.
2. **The Pro tree reuses the Core decisions.** Its include rules name Core exclude rules (`core_exclude`), so whatever
   the Core tree excludes for the private repository (Pro distribution, operator plugin, release pipeline,
   Pro-coupled Core tests) lands in the Pro tree with exactly the same patterns. `[[add]]` adds files that have no
   source path (`LICENSE`, `README.md`, read from `tools/cutover/pro/` at the same revision).
3. **Layout.** The Pro tree keeps today's paths: a checkout of a pinned `eimir-core` revision with the `eimir-pro` tree
   on top is the complete source tree of the official images, and patches made before the split apply unchanged
   (runbook C9). `[[map]]` entries (`from = "a/"`, `to = "b/"`) would move a directory; none is used (decision P2).
4. **Transforms.** A transform whose text no longer matches exactly once fails the export, so it is reviewed again
   instead of silently drifting.
   - Core: `backend/pyproject.toml` no longer names the plugin distributions; `backend/uv.lock` is locked again without
     them (`uv lock` with the pinned uv; the export fails unless the new lockfile only drops packages and keeps every
     other version and source); `PROVENANCE.md` loses the two sections about the editorial Pro catalogs; the Secret
     Scan job in `.github/workflows/ci.yml` runs on `ubuntu-latest` instead of routing same-repository pull requests to
     the operator runner `eimir-kvm-pr` (the operator runner never serves `eimir-core`, runbook 6.1).
   - Pro: `PROVENANCE.md` keeps only those two sections under a short header (decision D4).
5. **Gates** (each fails loudly; a missing tool fails, a skipped gate is reported as skipped):

   | Gate | Tree | Checks |
   | --- | --- | --- |
   | `coverage` | both | Every file in the tree is in the manifest, allow-listed (or an `[[add]]`), at its mapped path, unchanged and not forbidden; nothing is missing. |
   | `plugin-imports` | Core | No exported Python file imports `eimir_pro` or `eimir_admin` (AST, every `.py` file, including imports inside functions and `import_module` calls with a literal name). Core runtime code has no allowance; test support below `backend/tests/` may have a listed, reasoned allowance. |
   | `openapi-contract` | Core | `backend/openapi.json` is byte-identical to the contract checked in at the revision (the full contract, addendum of 2026-11-25). |
   | `licence` | both | Core: `LICENSE` (PolyForm Noncommercial 1.0.0), `CLA.md`, `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md`, `TRADEMARKS.md`, `PROVENANCE.md` with the licensing text the Provenance job checks. Pro: an all-rights-reserved `LICENSE` without PolyForm text, a `README.md`, and a `PROVENANCE.md` with only the Pro sections. |
   | `forbidden-text` | Core | Neither `eimir-kvm-pr` nor `EIMIR_PR_RUNNER` appears below `.github/` (documentation may still mention them). |
   | `secret-scan` | both | gitleaks in directory mode over the tree, with the same pinned image as the Secret Scan job. |
   | `snapshot-secret-scan` | both | gitleaks in git mode over the single-commit snapshot, exactly as the new repository's Secret Scan will run. |
   | `split` | both together | Every tracked file of the revision lands in exactly one tree; in both only by a documented `[[overlap]]` rule; in neither only when its Core exclude rule is listed as archive-only. An overlap rule that matches nothing is reported. Both trees must come from the same revision. Every file the official publisher requires from the Pro tree (`publisher_requires`, mirroring `PRO_WORKSPACE_FILES` and `PRO_REQUIRED_FILES` of `scripts/test_deployment_channel.py`) is in the Pro tree, and `backend/pyproject.toml` has the same `[project]` table in both trees, as the publisher checks. |
   | `core-install`, `core-start`, `core-wheel`, `core-unit-lane`, `core-migrations` | Core | On a copy of the tree, without the plugin distributions: `uv sync --frozen` installs Core only; the app starts with no plugin loaded and `/api/v1/health` answers 200; the Core wheel contains no plugin file (`tools/ci/check_core_wheel.py`, shared with Supply Chain); the Core-only unit lane passes; `alembic upgrade head` and the schema fingerprint check pass on an empty database. |
   | `coverage-after-backend` | Core | The backend gates left the exported tree unchanged. |

   The Pro tests run against a Core wheel built from the Core tree in CI: `tools/ci/pro_extraction_dry_run.sh` with
   `EIMIR_CORE_ROOT` (Core tree) and `EIMIR_PRO_ROOT` (Pro tree).
6. **Fresh history.** `fresh-history` creates a *local bare* repository with exactly one commit holding a tree. The
   commit is reproducible: the same tree, message, author and date give the same commit id. It has no remote. Both
   snapshots use the neutral identity `eimir. <snapshot@eimir.invalid>` (decision D6). The tool contains no push code
   path (a test checks this).
7. **Report.** `dry-run` writes `report.md` and `report.json` per tree: counts and sizes per rule, the files excluded
   because they are not listed, the largest files, every gate result, and the exported files that still name an
   excluded path (input for the cut-over checklist, not a gate).

## Running it

Linux, macOS or Windows with Python 3.11 or newer and git:

```sh
python tools/cutover/core_export.py dry-run --rev origin/main --with-pro --work /tmp/split-export
```

- The work directory then holds `tree/`, `report/` and `snapshot.git` for `eimir-core`, and `pro-tree/`,
  `pro-report/` and `pro-snapshot.git` for `eimir-pro`. Without `--with-pro` only the Core tree is made.
- Without `--work` a new temporary directory is used; the report paths are printed at the end.
- `--backend` adds the Core-only backend gates. They need uv and a POSIX system (the backend uses `fcntl`), so on
  Windows they report a failure; run them in CI, in WSL or in a Linux container. `core-migrations` needs
  `EIMIR_TEST_DATABASE_URL`; without it that gate is skipped and reported as skipped.
- The secret scans use `gitleaks` from `PATH`, or the Secret Scan image when `EIMIR_CUTOVER_GITLEAKS_IMAGE` is set
  (for example `zricethezav/gitleaks:v8.24.3`, which needs docker).
- uv is pinned through `backend/pyproject.toml` (`required-version`); when another uv is installed, the tool runs the
  pinned one through `uvx`. On Windows a managed Python that is blocked locally can be replaced with `UV_PYTHON`.
- The single steps are also available as `export`, `check`, `check-backend` and `fresh-history`; pass
  `--allowlist tools/cutover/pro-allowlist.toml` before the command for the Pro tree (see `--help`).
- `--skip gate1,gate2` skips gates explicitly.
- For step C6 of the [cut-over runbook](../../docs/CUTOVER-RUNBOOK.md) each snapshot is made with the neutral default
  identity (decision D6) and the archive reference in the message, then checked and pushed by hand:

  ```sh
  python tools/cutover/core_export.py dry-run --rev <snapshot SHA> --with-pro --work <dir> --backend
  python tools/cutover/core_export.py fresh-history --tree <dir>/tree --manifest <dir>/report/manifest.json \
    --target <dir>/eimir-core.git \
    --message "Initial snapshot from <owner>/eimir-archive at <snapshot SHA>"
  python tools/cutover/core_export.py --allowlist tools/cutover/pro-allowlist.toml fresh-history \
    --tree <dir>/pro-tree --manifest <dir>/pro-report/manifest.json --target <dir>/eimir-pro.git \
    --message "Initial snapshot from <owner>/eimir-archive at <snapshot SHA>"
  git -C <dir>/eimir-core.git ls-tree -r --name-only main | wc -l   # equals the Core manifest's file count
  git -C <dir>/eimir-core.git push <eimir-core URL> main            # by hand, never by the tool
  ```

## CI

- **Core Export Dry Run** (`.github/workflows/ci.yml`) runs on every pull request: the tool's tests, both exports,
  their cheap gates, the split gate, both snapshots and their secret scans. Both reports go to the job summary. The
  snapshots stay in the runner.
- **Core Export Backend** runs the backend gates on the Core tree when the backend integration scope is selected
  (full tier and the nightly regression). It is a separate job so it can be retried on its own.
- **Pro extraction dry run** builds its Core wheel and test support from the Core tree and copies Pro from the Pro
  tree, so it proves that the private Pro tests pass on top of the public Core.
- `tools/cutover/` is a risk path in `tools/ci/change_scope.py`: a ready pull request that changes an allow-list runs
  the full tier.

## What goes where

The allow-lists are the authoritative answer; in short:

- **`eimir-core` (public):** the Web client (including the Pro screens, #2086), the Android and iOS wrappers, the Core
  backend with its migrations, tests and demo assets, the full OpenAPI contract, deployment files and examples,
  design tokens, the specifications, the legal drafts, the main site, the documentation (without the large design
  media), the developer and Self-Hosted scripts, and the Core CI workflows.
- **`eimir-pro` (private):** `backend/pro/` (the Pro package with the date-idea and daily-saying catalogs and the Pro
  tests), `backend/admin/` (the operator plugin), the official build, attest, evidence and publish pipeline with its
  scripts and tests, the release notes, the release agent skill, the Pro-coupled Core test modules, the Pro part of
  `PROVENANCE.md`, and its own `LICENSE` and `README.md`. Signing keys and store credentials are not tracked
  anywhere; the release workflows refer to them as repository secrets, and both trees forbid key files.
- **In both:** `backend/pyproject.toml` and `backend/uv.lock` in two versions (Core: the Core-only workspace,
  transformed and re-locked; Pro: the official workspace with the plugin members, unchanged, which the publisher
  takes from the Pro tree), `.gitattributes`, `.gitignore`, `.gitleaks.toml`, the pull request template,
  `tools/ci/pro_extraction_dry_run.sh`, the supply-chain capability probe (`scripts/supply_chain_state.py` and its
  test, #2294: it records that attestations and CodeQL are unavailable on the private repository), and
  `PROVENANCE.md` (two different halves of one file).
- **Archive only:** the large design media and the historical checksum files (decision D3).

## Decisions for the Product Owner

The allow-lists apply a default for each item; the `decision` field marks it. Excluding is the reversible default
where the classification was unclear: a file can be published later, but not withdrawn.

| ID | Item | Default | Why it needs a decision |
| --- | --- | --- | --- |
| D1 | `backend/admin/` (operator plugin `eimir_admin`, support reports and tickets) | Private | Decision 0019 names only the Pro package. The operator plugin ships with Pro in the official image and never in the Core image, so it is grouped with Pro. A future Self-Hosted operator may want it. |
| D2 | Official release pipeline: `release-candidate`, `release-evidence`, `release-publish`, `core-advance` (the private repository follows Core `main` for the test channel, runbook D2, #2297), `nightly-regression-report` (it starts the private test channel publication), the attestation action, the image archive, release manifest, deployment channel and release asset scripts with their tests, the release notes under `docs/releases/`, the agent skill under `.claude/` | Private | The nightly report also has Core value: the public repository will need its own nightly report without the publication step. The Self-Hosted release contract (`scripts/self_hosted_release.py`, its workflow and tests) stays public, because Core code and `compose.yaml` use it. |
| D3 | Large design media below `docs/product/design/` and `docs/design/eimir/` (generated reference images and evidence screenshots; numbers in the dry-run report) and six historical checksum files that match the secret scanner | In neither tree; the archive keeps them | Keeping them makes the public repository about 0.6 GB larger; linking is not possible because the archive becomes private. The Markdown records next to them stay, so their image links will not resolve. The identity system and app-icon sources stay because scripts read them. |
| D4 | `PROVENANCE.md` split | The sections "Date-idea catalog and images" and "Daily Saying catalog" move to the private repository with the catalogs; everything else stays public | Proposed split for review. |
| D5 | Core test modules that import `eimir_pro` at module level: `backend/tests/media/acceptance_video_lifecycle.py` and `backend/tests/unit/test_account_table_lifecycle.py` | Private | They must move to `backend/pro/pro_tests` or be rewritten before they can be published. The three lifecycle modules that [#2285](https://github.com/baerenmarke90/eimir/pull/2285) rewrote onto a fake plugin (`test_core_only_lifecycle.py`, `test_dormant_plugin_data.py`, `test_plugin_lifecycle.py`, with `tests/support/fake_plugin.py`) are public again. Five other Core test files keep guarded Pro imports inside functions under a reasoned allowance. |
| D6 | Snapshot author and date | `eimir. <snapshot@eimir.invalid>` and the source commit's date | **Decided by the Product Owner on 2026-11-25:** both snapshot commits use this neutral identity, the tool's default. A personal name or a real e-mail address must never appear in a snapshot. The `--author` and `--date` options stay available, but C6 uses the defaults. |
| D7 | Public CI after the cut-over | The Core CI workflows are exported unchanged except the operator runner routing | The operator runner routing is removed by a transform and guarded by the `forbidden-text` gate. The workflows still name `backend/pro`, `backend/admin` and the release workflows; the dry-run report lists every such reference. Since #2285 two exported Core test docstrings (`test_core_only_lifecycle.py`, `test_plugin_lifecycle.py`) also point at `backend/pro/pro_tests`, which becomes part of `eimir-pro`. Adapting them is cut-over work (runbook 6.1), not part of this export. |
| P1 | Wording of the `eimir-pro` `LICENSE` (`tools/cutover/pro/LICENSE`) | "All rights reserved", no licence granted without a separate written agreement; it names "the eimir. copyright holder", no personal name | The Decision 0019 addendum asks legal counsel for the commercial agreement only; whether counsel should also review this short notice, and whether it should name the legal person, is open. |
| P2 | Layout of `eimir-pro` | Today's paths, no mapping | Keeps patches applicable and lets the official build lay the Pro tree over a Core checkout. A flatter layout (for example `pro/` instead of `backend/pro/`) needs `[[map]]` entries and changes in every release workflow path. |
| P3 | `tools/ci/pro_extraction_dry_run.sh` in both repositories | In both | It is the starting point of the private CI, but in `eimir-pro` it must take the Core tree and the lockfile from a pinned `eimir-core` checkout (runbook 6.1). |
| P4 | Which Core review gates `eimir-pro` needs | Only the pull request template and `.gitleaks.toml` are carried over | The Reuse Review and Product Design Review workflows, their scripts and the Secret Scan job read Core paths; whether `eimir-pro` gets its own copies is pipeline adaptation work (runbook 6.1, C20). |
| P5 | `.gitleaksignore` in `eimir-pro` | Not carried over | Its fingerprints name commits of the old history and Core files; they cannot match a fresh history. |

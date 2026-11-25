# Core export for the repository split

Decision 0019 ([#2183](https://github.com/baerenmarke90/eimir/issues/2183)) splits this repository into a public
`eimir-core` repository with a fresh single-commit history and a private `eimir-pro` repository. This directory
holds the tool that produces the public Core tree and the checks it must pass. It is phase 1 of the cut-over order:
**nothing here creates, pushes to or changes another repository.**

| File | What it is |
| --- | --- |
| [`core-allowlist.toml`](core-allowlist.toml) | The allow-list: which tracked files go public, which stay out, hard guards, the few transforms and the gate settings. It is reviewable data, not code. |
| [`core_export.py`](core_export.py) | The export, the gates, the local snapshot and the report. Python standard library and git only. |
| [`test_core_export.py`](test_core_export.py) | Tests on small synthetic repositories, including a failing case for every gate. |

## What the tool does

1. **Export.** It reads one revision through git (never the working tree) and writes every tracked file that an
   `[[include]]` rule matches and no `[[exclude]]` rule matches into an empty directory, byte for byte. Anything not
   listed is excluded. A path that matches a `[[forbidden]]` rule (Pro code, signing material, the official publish
   workflows) stops the export even if an include rule was widened by mistake. A manifest records every file with
   its SHA-256, and every excluded file with the rule that excluded it.
2. **Transforms.** Three included files change: `backend/pyproject.toml` no longer names the plugin distributions,
   `backend/uv.lock` is locked again without them (`uv lock` with the pinned uv; the export fails
   unless the new lockfile only drops packages and keeps every other version and source), and `PROVENANCE.md` loses the two sections about the editorial Pro catalogs. A transform whose
   text no longer matches exactly once fails the export, so it is reviewed again instead of silently drifting.
3. **Gates on the output tree** (each fails loudly; a missing tool fails, a skipped gate is reported as skipped):

   | Gate | Checks |
   | --- | --- |
   | `coverage` | Every file in the tree is in the manifest, allow-listed, unchanged and not forbidden; nothing is missing. |
   | `plugin-imports` | No exported Python file imports `eimir_pro` or `eimir_admin` (AST, every `.py` file, including imports inside functions and `import_module` calls with a literal name). Core runtime code has no allowance; test support below `backend/tests/` may have a listed, reasoned allowance. |
   | `openapi-contract` | `backend/openapi.json` is byte-identical to the contract checked in at the revision (the full contract, addendum of 2026-11-25). |
   | `licence` | `LICENSE` (PolyForm Noncommercial 1.0.0), `CLA.md`, `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md`, `TRADEMARKS.md` and `PROVENANCE.md` are present with the licensing text the Provenance job checks. |
   | `secret-scan` | gitleaks in directory mode over the tree, with the same pinned image as the Secret Scan job. |
   | `snapshot-secret-scan` | gitleaks in git mode over the single-commit snapshot, exactly as the new repository's Secret Scan will run. |
   | `core-install`, `core-start`, `core-wheel`, `core-unit-lane`, `core-migrations` | On a copy of the tree, without the plugin distributions: `uv sync --frozen` installs Core only; the app starts with no plugin loaded and `/api/v1/health` answers 200; the Core wheel contains no plugin file (`tools/ci/check_core_wheel.py`, shared with Supply Chain); the Core-only unit lane passes; `alembic upgrade head` and the schema fingerprint check pass on an empty database. |
   | `coverage-after-backend` | The backend gates left the exported tree unchanged. |

4. **Fresh history.** `fresh-history` creates a *local bare* repository with exactly one commit holding the tree. The
   commit is reproducible: the same tree, message, author and date give the same commit id. It has no remote. For the
   rehearsal (phase 2) the Product Owner can push it to a throwaway private repository by hand:
   `git -C <snapshot.git> push <throwaway-url> main`. The tool itself contains no push code path (a test checks this).
5. **Report.** `dry-run` writes `report.md` and `report.json`: counts and sizes per rule, the files excluded because
   they are not listed, the largest exported files, every gate result, and the exported files that still name an
   excluded path (input for the cut-over checklist, not a gate).

## Running it

Linux, macOS or Windows with Python 3.11 or newer and git:

```sh
python tools/cutover/core_export.py dry-run --rev origin/main --work /tmp/core-export
```

- Without `--work` a new temporary directory is used; the report path is printed at the end.
- `--backend` adds the Core-only backend gates. They need uv and a POSIX system (the backend uses `fcntl`), so on
  Windows they report a failure; run them in CI, in WSL or in a Linux container. `core-migrations` needs
  `EIMIR_TEST_DATABASE_URL`; without it that gate is skipped and reported as skipped.
- The secret scan uses `gitleaks` from `PATH`, or the Secret Scan image when `EIMIR_CUTOVER_GITLEAKS_IMAGE` is set
  (for example `zricethezav/gitleaks:v8.24.3`, which needs docker).
- uv is pinned through `backend/pyproject.toml` (`required-version`); when another uv is installed, the tool runs the
  pinned one through `uvx`. On Windows a managed Python that is blocked locally can be replaced with `UV_PYTHON`.
- For step C6 of the [cut-over runbook](../../docs/CUTOVER-RUNBOOK.md) the snapshot is made with the Product Owner's
  identity and the archive reference in the message, then checked and pushed by hand:

  ```sh
  python tools/cutover/core_export.py dry-run --rev <snapshot SHA> --work <dir> --backend
  python tools/cutover/core_export.py fresh-history --tree <dir>/tree --manifest <dir>/report/manifest.json \
    --target <dir>/eimir-core.git --author "<Name> <email>" \
    --message "Initial snapshot from <owner>/eimir-archive at <snapshot SHA>"
  git -C <dir>/eimir-core.git ls-tree -r --name-only main | wc -l   # equals the manifest's file count
  git -C <dir>/eimir-core.git push <eimir-core URL> main            # by hand, never by the tool
  ```

  This tool produces the Core tree only; the Pro tree for `eimir-pro` is not part of it.
- `--skip gate1,gate2` skips gates explicitly. The single steps are also available as `export`, `check`,
  `check-backend` and `fresh-history` (see `--help`).

## CI

- **Core Export Dry Run** (`.github/workflows/ci.yml`) runs on every pull request: the tool's tests, the export, the
  cheap gates, the snapshot and its secret scan. The report goes to the job summary. The snapshot stays in the runner.
- **Core Export Backend** runs the backend gates on the export tree when the backend integration scope is selected
  (full tier and the nightly regression). It is a separate job so it can be retried on its own.
- **Pro extraction dry run** now builds its Core wheel and test support from the export tree
  (`EIMIR_CORE_ROOT`), so it proves that the private Pro distribution works on top of the public Core.
- `tools/cutover/` is a risk path in `tools/ci/change_scope.py`: a ready pull request that changes the allow-list runs
  the full tier.

## What goes public and what stays private

The allow-list is the authoritative answer; in short:

- **Public:** the Web client (including the Pro screens, #2086), the Android and iOS wrappers, the Core backend with
  its migrations, tests and demo assets, the full OpenAPI contract, deployment files and examples, design tokens,
  the specifications, the legal drafts, the main site, the documentation (without the large design media), the
  developer and Self-Hosted scripts, and the Core CI workflows.
- **Private (`eimir-pro`) or archive only:** `backend/pro/` (the Pro package with the date-idea and daily-saying
  catalogs), `backend/admin/` (the operator plugin), the official build, attest and publish pipeline with its tooling,
  the Pro-coupled Core test modules, and the large design media (kept in the archive).

## Decisions for the Product Owner

The allow-list applies a default for each item; the `decision` field in the allow-list marks it. Excluding is the
reversible default where the classification was unclear: a file can be published later, but not withdrawn.

| ID | Item | Default in the allow-list | Why it needs a decision |
| --- | --- | --- | --- |
| D1 | `backend/admin/` (operator plugin `eimir_admin`, support reports and tickets) | Private | Decision 0019 names only the Pro package. The operator plugin ships with Pro in the official image and never in the Core image, so it is grouped with Pro. A future Self-Hosted operator may want it. |
| D2 | Official release pipeline: `release-candidate`, `release-evidence`, `release-publish`, `nightly-regression-report` (it starts the private test channel publication), the attestation action, the image archive, release manifest, deployment channel and release asset scripts with their tests, the release notes under `docs/releases/`, the agent skill under `.claude/` | Private | The nightly report also has Core value: the public repository will need its own nightly report without the publication step. The Self-Hosted release contract (`scripts/self_hosted_release.py`, its workflow and tests) stays public, because Core code and `compose.yaml` use it. |
| D3 | Large design media below `docs/product/design/` and `docs/design/eimir/` (generated reference images and evidence screenshots; numbers in the dry-run report) and six historical checksum files that match the secret scanner | Excluded; the archive keeps them | Keeping them makes the public repository about 0.6 GB larger; linking is not possible because the archive becomes private. The Markdown records next to them stay, so their image links will not resolve. The identity system and app-icon sources stay because scripts read them. |
| D4 | `PROVENANCE.md` split | The sections "Date-idea catalog and images" and "Daily Saying catalog" move to the private repository with the catalogs; everything else stays public | Proposed split for review; the private repository needs its own provenance file with those two sections. |
| D5 | Core test modules that import `eimir_pro` at module level (five files) | Excluded (they belong to the private suite) | [#2285](https://github.com/baerenmarke90/eimir/pull/2285) rewrites three of them onto a fake plugin; after it is merged they can be published again. The two remaining modules must move to `backend/pro/pro_tests` or be rewritten. Five other Core test files keep guarded Pro imports inside functions under a reasoned allowance. |
| D6 | Snapshot author and date | `eimir. <snapshot@eimir.invalid>` and the source commit's date | The public commit's author identity is the Product Owner's choice (`--author`, `--date`). |
| D7 | Public CI after the cut-over | The Core CI workflows are exported unchanged | They still name `backend/pro`, `backend/admin`, the release workflows and the operator runner label; the dry-run report lists every such reference. Adapting them is cut-over work, not part of this export. |

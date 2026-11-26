# eimir. Pro plugin (`eimir-pro`)

The Pro server code of eimir. as its own Python distribution
([Decision 0017](../../docs/decisions/0017-pro-plugin-seam.md), Phase 2,
[#2182](https://github.com/baerenmarke90/eimir/issues/2182)). The directory is built
so it can move into its own repository unchanged.

## Boundary rules

- Import root `eimir_pro`; distribution `eimir-pro`; entry point `pro` in the group
  `eimir.plugins` (`eimir_pro.plugin:plugin`). The Core loader accepts the name `pro`
  only from this distribution.
- Pro may import any Core module. Core never imports `eimir_pro`:
  `backend/tests/unit/test_core_imports_no_plugin.py` enforces it, and Supply Chain
  checks that the Core wheel and the Core image carry no Pro file.
- Core reaches Pro only through the seam (`eimir.plugins.contract.ProPlugin`). Every
  Pro table keeps its row in the Core manifest (`eimir.plugins.manifest`), so
  deletion, retention, encryption and export work without this package.
- The existing Pro tables stay in the Core migration chain. A new Pro table gets its
  revision in a plugin chain returned by `migrations()` (own `version_table`); none
  exists yet. New Pro features are frozen until v2.0 (#2180).

## Layout

| Path | Content |
| --- | --- |
| `src/eimir_pro/` | the Pro packages, their routers (`api/`), the plugin object (`plugin.py`) and the editorial data (date ideas, sayings) |
| `src/eimir_pro/portability/` | the operator export and import tool ([Decision 0020](../../docs/decisions/0020-remove-transfer-bundle-self-service.md)); run it with `python -m eimir_pro.portability`, see its [runbook](src/eimir_pro/portability/RUNBOOK.md) |
| `pro_tests/` | the Pro tests (`unit/`, `integration/`, `support/`); they reuse the Core test support package `tests` |
| `pro_scripts/` | development tools (the date-idea catalog validator, the public-domain quotation importer) |
| `docs/` | the date-idea catalog schema; [public-domain quotations](docs/public-domain-quotes/README.md) |
| `archive/` | the retired sayings catalog |

## Working in this repository

The Pro distribution is a member of the uv workspace in `backend/`:

```bash
cd backend
uv sync --frozen --all-packages     # Core and Pro; a plain `uv sync --frozen` is Core only
EIMIR_PLUGINS=pro uv run uvicorn eimir.main:app --reload
uv run pytest                       # runs tests/ and pro/pro_tests/ with the plugin
EIMIR_PLUGINS= uv run pytest        # Core-only: the Pro tests are not collected
```

`backend/Dockerfile` builds the `core` stage and, by default, the `pro` stage on top
of it, which sets `EIMIR_PLUGINS=pro`. The media image derives from that image.

## Extraction

`tools/ci/pro_extraction_dry_run.sh` (CI job "Pro extraction dry run") copies this
directory into an empty folder, removes the workspace source of Core, installs it on
top of a Core wheel built from the same checkout and runs `pro_tests` there, with
the Core test support taken from the checkout. An extracted repository does the
same with a pinned Core release: it replaces `[tool.uv.sources]` by a Core
reference, carries its own pytest settings and runs against a Core checkout of that
revision. The Pro image will then be built `FROM` the Core image digest and record
the Core revision it was built against (Decision 0017, Phase 3).

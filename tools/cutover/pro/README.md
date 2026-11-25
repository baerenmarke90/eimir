# eimir-pro

The private repository of eimir. (Decision 0019): the Pro server package `eimir_pro` with its editorial catalogs,
the operator plugin `eimir_admin`, the Pro tests and the official build, sign and publish pipeline. The public
application Core lives in the `eimir-core` repository; the history before the split is kept in the private,
archived `eimir-archive` repository.

## Layout

The paths are the paths of the former single repository. A checkout of a pinned `eimir-core` revision with this
repository on top of it is the complete source tree the official images are built from, and patches made before
the split apply without path changes.

| Path | Content |
| --- | --- |
| `backend/pro/` | The Pro plugin distribution `eimir-pro` and its tests (`backend/pro/pro_tests`). |
| `backend/admin/` | The operator plugin distribution `eimir-admin` and its tests. |
| `backend/tests/` | Core test modules that need the Pro plugin installed. |
| `.github/workflows/`, `.github/actions/`, `scripts/`, `tools/ci/` | The official release, evidence and test channel pipeline and its tests. |
| `PROVENANCE.md` | The provenance of the assets that live only here. |

## Licence

Proprietary, all rights reserved; see `LICENSE`. There is no contributor licence agreement while only the owner
works here.

This file was written by the export tool of `eimir-core` (`tools/cutover/`); adapt it after the cut-over.

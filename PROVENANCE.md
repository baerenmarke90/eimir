# Provenance

## Statement

eimir. is an independently implemented software project based on a
functional product specification. No source code from SharedMoments or
SideBySide Classic is copied into this implementation.

Implementation follows the complete written specification in
[specification/CLEAN-ROOM-MASTER-SPEC.md](specification/CLEAN-ROOM-MASTER-SPEC.md).
The shorter [specification/PRODUCT-SPEC.md](specification/PRODUCT-SPEC.md)
is an overview and does not replace the master specification.

The project does **not** claim to be a strict or formal clean-room
implementation. The accepted project classification is an independent
reimplementation from a written specification with documented prior exposure
of the initial implementing session. The formal governance decision is
recorded in
[docs/decisions/0001-clean-room-classification.md](docs/decisions/0001-clean-room-classification.md).

## Facts

| | |
|---|---|
| Project start | 2026-08-23 |
| Specification | eimir. Clean-Room Master Specification |
| Predecessor | SideBySide Classic (historical background only) |
| Repository | separate from any predecessor repository |

## Scope of the clean-room rule

Not to be taken from a predecessor codebase: Python code, Flask routes,
SQLAlchemy models, query layers, Jinja templates, CSS, JavaScript, Kotlin
code, prior API implementations, database migrations, code comments, the
prior question seed, translation tables as a bulk dataset, demo content,
screenshots, or assets of unclear origin.

The predecessor repository is not opened, searched, or modified during
implementation.

## Disclosure: prior exposure of the implementing session

Honesty about the limits of this claim matters more than a clean-sounding
one.

The assistant session that began this implementation on 2026-08-23 had, in
the same session and immediately before starting, read substantial parts of
the SideBySide Classic source code while working on that separate project.
That session was therefore **not** an unexposed clean-room implementer in
the strict sense used by formal clean-room procedures, which separate the
person who reads the original from the person who writes the replacement.

What applies instead:

- Implementation follows the written specification only.
- The predecessor source is not consulted, quoted, or reproduced from this
  point on.
- The technology stacks share almost nothing: the predecessor is
  Flask/SQLite/Jinja with a server-rendered UI, this project is
  FastAPI/PostgreSQL/React with a REST API and native clients.
- The specification is self-contained and prescribes the domain model,
  which differs substantially from the predecessor's.

This entry exists so that anyone assessing provenance later sees the actual
situation rather than an unqualified assurance. A stricter separation — a
fresh implementing context with no prior exposure — remains technically
possible, but the project has formally decided not to restart the current
implementation solely to obtain that process classification. The current
source tree must therefore not be described as a strict or formal clean-room
implementation.

## Legal note

This document records development practice. It does not by itself
establish, guarantee, or determine any particular legal conclusion about
copyright, licensing, or derivation. It is a factual record, not a legal
opinion.

## Dependencies

Third-party dependencies with name, version, source, and license are
recorded in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

## Assets

No assets of unclear third-party origin are admitted to the project. The
repository currently contains project-specific product-preview, roadmap and
M2 handoff graphics. Their paths and provenance classification are recorded
in [docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

The product-preview files under `docs/assets/playstore/` are mockups for
eimir., not screenshots or assets copied from a predecessor. The
roadmap graphics under `docs/assets/roadmap/` and the M2 SVG diagrams were
created specifically for this repository's documentation and handoff.

Unless an individual entry states otherwise, these project assets have no
separate public license grant. No font or audio assets are currently part of
the repository.

## Contributors

| Name | Role | Period |
|---|---|---|
| baerenmarke90 | Specification, product decisions, review | since 2026-08-23 |

Development is AI-assisted. Code and project documentation are produced with
AI assistance under human review.

## License of this source code

eimir.'s own source code is made available under the
**PolyForm Noncommercial License 1.0.0**. Noncommercial use, modification,
and distribution are permitted subject to that license. Commercial use
requires a separate commercial license from the rights holder.

See [LICENSE](LICENSE) for the license terms,
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for commercial licensing,
[CONTRIBUTING.md](CONTRIBUTING.md) and [CLA.md](CLA.md) for contributions,
and [TRADEMARKS.md](TRADEMARKS.md) for the separate treatment of the
eimir. name, logos, and branding.

Because commercial use is not granted generally, eimir. is
**source-available**, not Open Source in the narrower OSI sense. Third-party
components remain subject to their own licenses as documented in
[docs/DEPENDENCIES.md](docs/DEPENDENCIES.md).

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

The product-preview images under `docs/assets/readme/` are real screenshots
of the current eimir. Web client (smartphone width, Light theme), captured with
a Playwright-driven browser against a locally running eimir. backend seeded with
the canonical demo Space (`docs/DEMO-SPACE.md`). They contain only the fictional
demo identities and content and the CC0 demo photographs recorded in
`backend/demo_assets/manifest.json`; no real couple data, account data or
third-party artwork. The earlier AI-generated mockups under
`docs/assets/playstore/` no longer represented the product and were removed.
They were never screenshots or assets copied from a predecessor. The
roadmap graphics under `docs/assets/roadmap/` and the M2 SVG diagrams were
created specifically for this repository's documentation and handoff.

The tag and photo-library outline motifs added to `EimirIcon.tsx` for #1724
were drawn specifically for eimir. with AI assistance on the existing 24 px
icon grid. They reuse the project's stroke grammar, have no third-party source
and follow the project's source-code license. Companion browser evidence uses
synthetic test identities and the existing approved product fixtures.

Unless an individual entry states otherwise, these project assets have no
separate public license grant. No font or audio assets are currently part of
the repository.

The #1489 generated whole-screen navigation reference under
`docs/product/design/references/1489/` was created with OpenAI's built-in
image-generation tool on 2026-10-28 from an actual eimir. browser render at
`5e19e8b8f522be6b59737b15a40e6c8bbbceb806`. It is design guidance, not runtime
evidence. Companion browser screenshots use synthetic test identities and the
repository's existing authorized assets. No predecessor assets were consulted.

## Date-idea catalog and images

`backend/pro/src/eimir_pro/date_ideas/data/catalog.json` is the eimir. editorial
date-idea catalog (#1892): 200 original ideas in German and English, written
for eimir. and delivered as a versioned handoff with its JSON Schema.

`backend/pro/src/eimir_pro/date_ideas/data/images/` holds 25 editorial images for that
catalog (15 per idea, 10 per category). They were generated with OpenAI's
built-in image-generation tool without reference images; `images.json`
records each file, size, German and English alt text and the exact prompt.
They depict no real persons and contain no third-party photographs, brands or
artwork. They are project assets with no separate public license grant and
are served only through the Pro-gated API.

## Daily Saying catalog

`backend/pro/src/eimir_pro/quotes/daily_sayings.json` contains 519 entries in ten
categories, each in German and English: 474 sayings and 45 "Klassiker".

The 474 sayings are text without an individual author. They are AI-generated
drafts (the Product Owner's editorial AI and the earlier AI catalog of
2026-11-18), edited and approved one by one by the Product Owner on 2026-11-26,
and they are used under the repository license. They were also checked for
repetition of an idea already in the catalog and, where practical, by web
search for well-known quotations; looser echoes of familiar thoughts remain
and were reported to the Product Owner. The English versions are AI-assisted
translations of the German originals, contributed under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The
card shows the sayings without author credit or citation. They carry the rights
classification `EDITORIAL_CURATED`, and each entry records its collection, work
and rights basis in the same file.

The 45 Klassiker are public-domain quotations from works published in 1930 or
earlier by authors who died in 1955 or earlier: 29 German originals (Goethe,
Marie von Ebner-Eschenbach, Novalis, Hebbel, Nietzsche, Schiller, Heine,
Lichtenberg) and 16 English originals (Emerson, Tagore, Chesterton, Wilde,
Austen, Brontë, Alcott, Eliot, Gibran, Montgomery, Cather). The card shows
author and work. Spelling of the German originals is modernised. The translation
into the other language is our own, contributed under CC0 1.0 Universal, and
the card labels it as a translation. Their rights classification is
`PUBLIC_DOMAIN` for the original wording and `EDITORIAL_CURATED` for the
translation.

The previous catalog is archived, not served. It held German and English
public-domain quotations, traditional sayings, public remarks and the earlier
`eimir.` editorial sayings. The archived file is
`backend/pro/archive/quotes/daily_sayings.before-ai-sayings-2026-11-18.json`.
Its source editions, credits and licensing terms (including the TextGrid
CC BY 3.0 DE credit and the CC0 1.0 translations) remain recorded in that file
and in the git history. Restoring any of it requires the credits recorded there.

## Home Screen quick-action symbols

The three Android vector drawables `shortcut_moment.xml`, `shortcut_wish.xml`
and `shortcut_plan.xml` are original geometric symbols authored with AI assistance
for this project on 2026-11-26, under the repository license. No external icon
artwork or source code was copied. iOS uses UIKit's system quick-action symbols.

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

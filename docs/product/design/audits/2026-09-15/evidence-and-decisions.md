# Evidence and decisions — 2026-09-15 integration snapshot

**Classification: HISTORICAL / SUPPORTING.** This dated record explains the integration of [#955](https://github.com/baerenmarke90/eimir/issues/955). It is not a living issue-status database. [Product Reference v1](../../product-reference-v1.md) states what applies now; its supersession rule governs this evidence.

## Decision chronology and live precheck

| Event | Verified source / result | Integration consequence |
| --- | --- | --- |
| Product audit | Source baseline `9a13f67c88be514f85b500aa905763750697b530`. | Diagnostic/historical evidence, with limits recorded in [audit summary](product-design-audit.md). |
| Plan schedule improvement | [#952](https://github.com/baerenmarke90/eimir/pull/952), commit `234b6da7eb2463583809e19008d8a2b05ce3669f`. | Retain progressive end times and human-readable ranges; already included in calibration. |
| Visual calibration | Source checked main at `234b6da7eb2463583809e19008d8a2b05ce3669f`. | Detailed source for the normative direction; see [calibration summary](visual-calibration.md). |
| PO approval | [#955](https://github.com/baerenmarke90/eimir/issues/955) body read in full; zero comments at integration precheck. | Accepted v1, five experiences, D1–D8, precedence and eleven-slice sequence. Package candidate labels describe an earlier state. |
| Identity implementation | [#954](https://github.com/baerenmarke90/eimir/pull/954) merged as `9da8087695f3f952ab344e25dc693d87f5d327d5`. | Preserve canonical identity and deliberately scoped compatibility boundaries. |
| Repository rename completion | [#956](https://github.com/baerenmarke90/eimir/pull/956) merged as `839b5cef801f13a17e6c71a742eabacd012a09b1`; [#953](https://github.com/baerenmarke90/eimir/issues/953) closed with reason COMPLETED. | Canonical repository is `baerenmarke90/eimir`; start documentation branch from fresh post-rename main. |
| Integration baseline | Fetched `origin/main` at `839b5cef801f13a17e6c71a742eabacd012a09b1`, matching the supplied expected SHA. | This is a dated starting point, not a permanently current-main claim. |
| Final product gate | [#946](https://github.com/baerenmarke90/eimir/issues/946), including its intuitive-mobile-interaction addendum, read. | Final acceptance uses v1 and complete real-runtime journeys; prior gate completion is not final product acceptance. |

`git log` and the documentation/token diff from the calibration baseline to the integration baseline contain #954 and #956 only. The design-document edits in that delta update identity; the migration guide and verification add the completed rename record. There is no newer competing design decision or token change to overwrite. The integration uses canonical `eimir` links and preserves migration compatibility semantics.

### Open-PR collision review

The precheck read descriptions and changed-file lists for all 18 open PRs:

- dependency updates: #763, #762, #339, #234, #233, #232, #207, #157, #156, #142, #141, #140, #139, #136, #135, #133, #132;
- [#317](https://github.com/baerenmarke90/eimir/pull/317), an older Space-selection branch targeting another feature branch, touching `App.tsx`, Space-context code/tests and German localization.

None changes the documentation/governance files integrated here. Dependency updates are not competing design directions. F1/F2 must still repeat the live precheck before implementation; F2 must preserve account/Space isolation and avoid absorbing #317's feature work. A file list cannot guarantee that future PR revisions remain collision-free.

## Source custody and fingerprints

The Product Owner supplied two ZIP files with a download suffix `(1)`. The source packages are retained outside git; the repository contains compact English summaries and the normative distilled direction. This avoids importing a redundant full audit, screenshots, harness output, font files and PDF binaries. The full audit package expands to 160 files / 17,759,490 bytes; calibration expands to 29 files / 2,561,198 bytes.

| Supplied archive | ZIP bytes | SHA-256 |
| --- | ---: | --- |
| `eimir-product-design-audit-2026-09-15 (1).zip` | 15,753,753 | `2a7cd12b7a1610950e799b24a11a6db4fe6ad130454b506e69b3743226381be6` |
| `eimir-visual-product-calibration-2026-09-15 (1).zip` | 2,196,041 | `6b45c74dcd88732efc51b50036f543ffa60f6cb3296380cc64c43cf2eea33b75` |

Original package roots are `eimir-product-design-audit-2026-09-15/` and `eimir-calibration/`. The audit's `package-manifest.json` verified all 159 listed payload files, including byte counts. Calibration's `checksums.sha256` verified all 28 listed payload files. Each manifest excludes itself. These checks confirm the supplied package identity, not the semantic truth of every finding.

Key calibration payload fingerprints, relative to `eimir-calibration/`:

| Source file | SHA-256 | Use |
| --- | --- | --- |
| `01-product-reference-v1.md` | `400fe64a1347ee7baa1015bbefa5d9cc080b7da6b6c0ac11d43a4e6b9292dc3f` | Detailed visual/interaction direction. |
| `02-reference-screens.md` | `d668a6fbe44f418bb9d2b3515600ded0e2d6de2a0b88f8ed26c263223ab39820` | Five reference tasks and states. |
| `03-system-and-backlog.md` | `56958473b2757943b769bb60dd6611e3f7a8f280603c3aace83a1a8d734bc564` | Content types, primitives and eleven slices. |
| `04-evidence-and-decisions.md` | `060e13ef8e0fb2a3864cb7ff3c61cbc0d873aab42b4fb96df019cf2b186fcea4` | Evidence limits, D1–D8 and reference reconciliation. |
| `eimir-visual-direction.pdf` | `a1c251918a326be4aa3c14e93d18d22d21cf771b89a6d2747b070aa2ab54920e` | Static visual studies; no runtime acceptance claim. |
| `eimir-visual-overview.png` | `79f72c1086ba10a07309765a19202137e6a17a8671e9136c4801706b9fb4767b` | Five-experience overview inspected during integration. |

For the raw artifacts, retrieve the matching original package from the Product Owner's supplied evidence. This repository does not claim a public download URL or durable hosting for those binaries. Future implementation and review can use the complete in-repository normative contracts without the ZIP files; forensic inspection of the original screenshots requires the retained source package.

## Decision mapping

| Decision | Normative record | Evidence rationale |
| --- | --- | --- |
| D1 | [Palette/type base](../../product-reference-v1.md#accepted-product-owner-decisions-d1d8) | Existing identity is strong; role use and hierarchy need improvement. |
| D2 | [System surface language](../../design-system-direction.md) | Nested wrappers and repetitive cards obscure content. |
| D3 | [R1 capture](../../reference-screens.md) | Personal photo/text capture and draft/result continuity form one job. |
| D4 | [R2 Moments](../../reference-screens.md) | Visible scope and a stable origin make rediscovery dependable. |
| D5 | [R3 Planning](../../reference-screens.md) | Retain useful planning and #952 while giving anticipation priority. |
| D6 | [R5 utility](../../reference-screens.md) | Named destinations eliminate avatar-only inference and unrelated settings stacks. |
| D7 | [System layout rhythm](../../design-system-direction.md) | Deliberate Compact gutter mapping replaces inconsistent prose/runtime assumptions. |
| D8 | [Implementation roadmap](../../implementation-roadmap.md) | Establish foundations and complete capture/find/return before propagating and retiring patterns. |

## What this integration does not establish

Documentation adoption changes no runtime behavior and does not verify the original findings on today's deployed application. It does not accept F1/F2, R1–R5, native parity or the final #946 gate. New implementation evidence must identify the exact build and exercise visual and behavioral acceptance together. No technical, business, privacy or accessibility gate is waived by approval of the visual direction.

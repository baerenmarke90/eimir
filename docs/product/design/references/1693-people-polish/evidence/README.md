# Runtime evidence for People and add actions (#1693 / #1694)

Reviewed source: `1752a341294cb180d855bd07cce90c175452284e`, tree `b7cb958b01c60d1718695ae9cbc624b54edc0ee1`.
Hosted pull-request merge tested: `275e5f5d795b8f61d928cd9b8eb88000dfb163a2`; baseline main `72cad78823337f32293bb0041b05e748824b7f51`.

These unmodified browser screenshots are stored in an evidence-only commit whose parent is the tested source. They are linked from the owning PR and issue, preserving the tested implementation head and its completed checks. File bytes were checked against their Git blob IDs. [manifest.json](manifest.json) records original artifact paths, dimensions, sizes and checksums.

## Reviewed views

| Evidence | Browser setup and observed result |
| --- | --- |
| [People](people-compact-light.png) | 390×844, Light. Circular blue header plus with the existing photo/name-led list. Long authored names reflow; the legacy sibling row remains readable. |
| [Reopened note](person-note-reopened-compact-light.png) | 390×844, Light. Saved Tochter relationship and multiline note reload in the editor. The complete textarea remains above the normal-flow Save button. |
| [Saved profile](person-saved-compact-light.png) | 390×844, Light. Persisted name, relationship, birthday and plain-text note are readable in the actual result. |
| [Day add](day-add-compact-light.png) | 390×844, Light. Circular blue plus, keyboard focus ring, successful authored date and People birthday hand-off. |
| [Expanded editor](person-editor-expanded-dark.png) | 1440×900, Dark. Same bounded task and note, with native fields and completion. |
| [Short height](person-editor-short-height-dark.png) | 430×420, Dark. Save remains reachable through ordinary scrolling. Focused skip link is visible in this keyboard capture. |
| [200% zoom](person-editor-200-light.png) | 780×844, CSS zoom 2, Light. Note and completion reflow within the page; native single-line inputs retain their normal internal text scrolling. |
| [400% zoom](person-editor-400-dark.png) | 1280×1024, CSS zoom 4, Dark. Effective 320 CSS px reflow and reachable completion; note remains above Save. Focused skip link is visible. |
| [Tag Light](tag-compact-light.png) / [Dark](tag-compact-dark.png) | 360×844 Light / 390×844 Dark. Authored-tag input and circular blue 48 px plus share one row. |
| [Tag Expanded](tag-expanded-dark.png) | 1280×844, Dark. Same inline control in the bounded capture editor. |
| [Memory](tag-large-memory.png), [Heart Moment](tag-large-heart.png), [Plan](tag-large-plan.png), [Wish](tag-large-wish.png) | 320×844, 200% root text, Light. The shared tag entry and plus remain operable in all four owned editors. |

Captures use full-page screenshots, so image dimensions can exceed the viewport. Fixed navigation and focused skip links retain their capture scroll/focus position. The complete browser journeys, geometry assertions and keyboard/focus checks are the behavioral evidence.

## Validation

- [Browser QA](https://github.com/baerenmarke90/eimir/actions/runs/42425384799): **1,149 passed** (878 core across four shards plus 271 additional), with no failed or flaky cases reported. Includes complete People save/read/reopen/Back/Planning, photo-source import/cancel/save and private tag/location save/edit/reload, accessibility, reflow, shared circular-blue geometry and stationary hover-edge checks.
- [Backend/API CI](https://github.com/baerenmarke90/eimir/actions/runs/42425384813): **1,360 passed**, 45 supported environment-dependent skips; all **3,463 PostgreSQL integration tests passed**, including migration 0117/schema completeness, note protection/legacy/import/version/tenant cases and all relationship values. Generated client drift, types, lint, supply chain and secret scan passed.
- [Web Reference Flow](https://github.com/baerenmarke90/eimir/actions/runs/42425384833): **2,771 passed**, 2 existing skips; production build and static checks passed.
- CodeQL, G2, media, bootstrap, deployment and recovery gates passed on the same source.
- Three coherent implementation source pushes were used. Original/retry diagnostics from the first two sources were inspected before correction. No workflow was manually rerun, and assertions/timeouts/retries were not weakened.

## Scope disposition

The reviewed requested controls, notes and relationships meet the owning issue's scoped interaction and visual requirements. The note footer overlap found during review was corrected before these final captures.

The 320 px / 200% Heart Moment image also exposes an existing readability defect in its emotion and visibility choice grids. Both owning components/styles are byte-unchanged from baseline main. [#1695](https://github.com/baerenmarke90/eimir/issues/1695) records the source, root cause and acceptance for that separate responsive-choice correction. The new tag control remains readable and operable; this evidence does not declare the surrounding pre-existing choice layout resolved.

## Provenance

Actual eimir. UI rendered by the pinned hosted Chromium/Playwright stack, using synthetic account names, authored text and mocked API responses. No real couple or child data is included.

The People avatar is the existing `web/e2e/fixtures/recap-lake.webp` illustrative empty lake/jetty photograph, generated in the eimir. workflow with built-in ImageGen on 2026-10-30. It is a project-owned test fixture as recorded in `docs/DEPENDENCIES.md`, not a claimed user photo/location/event. UI screenshots are project validation assets with no separate public license grant.

The [generated Compact preflight](../generated-reference.png) and [implementation/upgrade contract](../README.md) remain in the tested source. No generated screenshot substitutes for the actual browser evidence above. This evidence commit adds no runtime dependency, application behavior or release artifact.

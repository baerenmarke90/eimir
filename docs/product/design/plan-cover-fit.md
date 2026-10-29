# Complete, bounded Plan images

Date: 2026-10-29. Main baseline: `f35f82dbab2465fe337850a1e8db147f4eb3942a` (merged #1502). The PO reports a cropped, enlarged cover on the Plan detail and the Planen overview. Current PlanCover forces 16:9/object-fit cover and always chooses a 512px thumbnail when available. The shared checkout contains other ongoing work; this correction uses a separate clean checkout. The release and browser-parallelization chats were inspected; neither owns this image correction. No release selection is changed here.

## Pre-implementation design review

Product Reference v1, R3 Planning, the design-system image direction, Detail/Create-Edit templates and the current Plan image contract govern this correction. Keep the actual shell/navigation, title/edit action, schedule, notes, place link, completion and return behavior. Reuse PlanCover, the authorized Story media loader/cache/Object URL lifecycle and SensitiveMedia controls.

The [generated Compact and Expanded reference](references/plan-cover-fit/compact-reference.png) was created with the built-in Imagegen tool before UI code. Its fictional poster is illustrative only. The generated navigation, extra overview images/place metadata, title ordering and two-column desktop arrangement are not implementation requirements; preserve the actual production hierarchy and capabilities. The accepted change is complete image framing, a bounded detail/editor image and a compact overview preview.

## Mobile interaction contract

- The entire selected image remains visible without stretching or cropping, including portrait posters, square photographs and landscape images.
- Detail and local edit previews respect their natural ratio and a viewport-aware height cap; large desktop widths never enlarge a thumbnail into a banner.
- The overview keeps image, actual title/date and existing notes in one canonical Plan link. A compact image sits beside wrapping copy when space allows; at narrow widths or large text it stacks naturally. No new navigation or click target.
- Detail/editor reads use the existing original variant; the compact overview uses the 512px thumbnail when available, otherwise the original. Preserve parent authorization, scoped caching, retry, URL cleanup and sensitive-image concealment.
- Preserve Loading, Empty/no-cover, Error/retry, offline and pending draft behavior. File selection is staged until the existing Save. Existing sensitive reveal and reduced-motion semantics remain unchanged.
- Verify production overview -> Plan -> Edit -> replace/local preview -> cancel/retain -> return, at 320/390/430 and 1280px, Light/Dark and 200% text, plus portrait/landscape/square and sensitive media. Use synthetic disposable images, not the PO screenshot as a runtime fixture.

## Reuse, business and quality

No business/freemium impact: Plan covers remain Free/Core, with the same one-image domain limit, ownership, managed-media quota, retention/deletion/export and Cloud/Self-Hosted behavior. Existing transport variants avoid a new image service, dependency, API or migration. Full-resolution reads are limited to the opened detail/editor; overview previews stay bounded to thumbnail scale. No private image URL, content, token or telemetry is persisted. This is a presentation/read-variant correction; uploads and versioned writes are unchanged.

## Verification

Implementation and rendered evidence are recorded after the preflight commit.

## Implementation verification

- Six production-browser journeys passed with retries disabled: 390px portrait Light, 430px landscape Dark, 1280px portrait Dark, 1280px square Light, 320px portrait at 200% text, and sensitive portrait conceal/reveal. Every selected image retains its natural aspect and stays inside the bounded frame. Detail reads demonstrably decode an original larger than 512px; overview reads decode the 512px thumbnail.
- Every journey opens the canonical Plan, opens Edit, selects a local landscape image, verifies its complete preview, discards deliberately, restores Edit focus and returns to the overview without a write. Sensitive previews remain concealed and contain no nested reveal button. Axe finds no violations on detail.
- The complete Web suite passes 2,259 tests with two existing skips. Production build, TypeScript, token/PWA checks, strict changed-code lint, formatting and engineering/documentation language audits pass. The six new browser tests are registered in the existing PR-critical inventory. No retries, timeouts or existing test dispositions were weakened.
- The narrow large-text journey exposed the existing segmented-control grid minimum and overflow of the Add Plan label. Scoped minimum tracks and wrapping keep the overview inside 320px without shrinking the user's font size.
- [Compact overview](references/plan-cover-fit/evidence/plan-cover-overview-390-portrait-light-false-false.png), [portrait detail](references/plan-cover-fit/evidence/plan-cover-detail-390-portrait-light-false-false.png), [landscape Dark](references/plan-cover-fit/evidence/plan-cover-detail-430-landscape-dark-false-false.png), [Expanded portrait](references/plan-cover-fit/evidence/plan-cover-detail-1280-portrait-dark-false-false.png), [Expanded square](references/plan-cover-fit/evidence/plan-cover-detail-1280-square-light-false-false.png), [200% text](references/plan-cover-fit/evidence/plan-cover-overview-320-portrait-light-true-false.png), [sensitive overview](references/plan-cover-fit/evidence/plan-cover-overview-390-portrait-dark-false-true.png). All are disposable synthetic corner-marker fixtures; no PO photo is committed or modified.

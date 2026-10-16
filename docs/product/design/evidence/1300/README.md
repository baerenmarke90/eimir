# Momente, Photos and Timeline regression QA — 2026-10-12

Dated evidence for [#1300](https://github.com/baerenmarke90/eimir/issues/1300), related to #601. This is a bounded Web regression record, not a living project-status source or final product acceptance under #946.

## Identity and environment

- Fresh `main` baseline: `dd46f6d1c6df3bb8c684715266b832334b6354e6`, checked again before publication.
- Final implementation/test commit: `b7d1ec7735928abbd3046b43c0965ff399bebf23`.
- Local macOS; Playwright 1.62.1 and its pinned Chromium 151.0.7922.34 (revision 1234). Final browser validation used Node 24.19.0, one worker, zero retries and a separate localhost port.
- The real React/Vite product ran with mocked HTTP records and the repository's approved demo photographs. These checks exercise client behavior; they do not establish live backend authorization or native-device acceptance.

## Reproduced defect and repair

The complete Dark-mode Discover audit failed after removing its two selector exclusions:

| Surface | Before | Required | Repair |
| --- | --- | --- | --- |
| Timeline handoff action | 2.35:1 in Dark; the token regression also found 3.96:1 in Light | 4.5:1 | Existing theme-aware `--color-link-text` |
| Content-kind metadata | 1.54:1 on the Dark content surface | 4.5:1 | Existing `--color-text-secondary` |
| Featured-context kicker | The same action-fill foreground was visibly unreadable on the Dark gradient | 4.5:1 | Existing `--color-text-secondary`; test both delivered gradient stops |

Only three runtime foreground assignments change. The existing hierarchy, layout, actions, navigation, media loading, privacy and motion contracts remain. The axe audit no longer excludes either selector. The token regression reads the actual runtime CSS and delivered identity palette, checks contrast numerically, and does not require a particular foreground token by name. It covers the gradient surfaces that axe cannot reliably evaluate.

The first QA batch also reproduced six failures in existing tests: stale three-destination expectations and the missing partner-nickname mock. Tests now require Photos, Milestones, Chapters and Years with their canonical routes, usable narrow-screen targets and no overflow. Unexpected requests still fail. New screenshots use the test output directory instead of overwriting historical #972 evidence.

## Behavioral and automated validation

**43 distinct browser cases passed**, with the final result composed of the 38 non-gallery cases and a final five-case gallery batch. One combined run exposed a test-setup race: its helper navigated immediately after clicking Sign In, before authentication completed. The helper now waits for the actual login screen to disappear, following the existing repository pattern; all five gallery cases then passed without delays or retries. No runtime source changed between those final batches.

The reviewed browser specs are:

- `momente-discover-canonical.spec.ts`
- `momente-timeline-filter-refresh.spec.ts`
- `momente-timeline-progressive-loading.spec.ts`
- `momente-timeline-reference.spec.ts`
- `shared-photos.spec.ts`
- `story-discover-tapestry.spec.ts`
- `story-timeline-attachment-meta.spec.ts`
- `story-timeline-comment-presence.spec.ts`
- `story-years-product-reference.spec.ts`

Coverage includes canonical Discover order, Timeline filters and pull-to-refresh, progressive pagination and its manual failure fallback, month/year presentation, all Story detail kinds, attribution/comment metadata, and complete photo open → browse → Back / source detail → return journeys. Photo return preserves loaded pages, focus and tile position. Overview reads remain lazy; originals stay limited to the selected photo and immediate neighbors.

Two new gallery cases verify:

- A 503 on the next page retains 40 loaded photos, exposes a contextual retry, retries the same cursor once, yields 44 unique photos and never opens originals.
- A 404 on selected-original authorization refreshes the projection, removes the affected tile and dismisses its viewer while staying in the photo gallery.

Light/Dark, Compact/Expanded, 320px reflow, enlarged text (including the gallery's 200% matrix), reduced motion, empty/error/offline states and axe checks remain covered. **60 focused unit/component/contrast tests**, TypeScript, the production Web build, token/PWA checks, formatting, browser inventory and diff checks passed. Lint completed with two pre-existing non-null-assertion warnings in the gallery mock; no new warning was added.

## Visual evidence

The Discover screenshots use real repository demo photographs instead of the old one-pixel image fixture. The current labels and actions are readable in Light and Dark, remain subordinate to personal content, and retain the existing composition. Narrow-screen reflow and the four browse destinations were reviewed. The Dark 320px screenshot is a top-of-page reflow state; the Expanded Dark screenshot exposes the corrected content labels and Timeline action.

- [Discover, 390px Light](discover-390-light.png)
- [Discover, 320px Dark / 125% text](discover-320-dark-125pct.png)
- [Discover, 1440px Light](discover-1440-light.png)
- [Discover, 1440px Dark](discover-1440-dark.png)
- [Photos, 390px Dark](photos-390-dark.png)
- [Photos, retained content after next-page failure](photos-next-page-error.png)
- [Photos, projection after revoked access](photos-revoked-access.png)

The non-gallery screenshots precede the test-only login-helper synchronization; the shipped UI source is identical to the final implementation commit. Gallery evidence comes from the final gallery rerun.

## Scope and evidence limits

The existing eight HTTP/PostgreSQL shared-photo tests were invoked and **skipped**, not passed: no local PostgreSQL instance was available. Starting the installed Docker runtime did not establish a test database; its API returned HTTP 500. Server-side owner-private exclusion, cursor binding, tenant isolation and byte revocation therefore remain CI evidence requirements. The mocked browser revocation case proves client response to a denial, not server enforcement.

An intermediate run encountered local ENOSPC errors, and another Node-26 runner invocation ended before completion. Those invocations are excluded from successful evidence. Only duplicated Git objects and disposable files created for this QA task were removed; final results use the completed Node-24 batches.

No Android/native capability, new domain feature, final #946 audit, merge or deployment is part of this package. #601 retains its remaining epic scope.

**No business/freemium impact:** Story history and shared photo browsing remain Free/Core. Accessibility is non-paywallable. No entitlement, quota, ownership, managed cost, retention, downgrade or Cloud/Self-Hosted behavior changes.

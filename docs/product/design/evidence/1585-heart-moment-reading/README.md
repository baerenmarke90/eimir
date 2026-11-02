# Readable HeartMoment description — runtime evidence

Issue [#1585](https://github.com/baerenmarke90/eimir/issues/1585). Runtime source: `1a7dde356be2739dd32e68286f8e6d4ca920523b`. Base main: `26369e5d54f91fe63c180b5bc6d47cba6a8b4900`. The [generated Compact preflight](../../references/1585-heart-moment-reading/README.md) was linked in the issue before UI implementation.

Long HeartMoment prose is no longer a large page heading. A compact localized type heading and a semantic date lead into the existing content area. The authored text appears there once, with line breaks, calibrated UI reading typography and bounded width; emotion, tags, optional media, Places, conversation and privacy/provenance remain in the existing flow. The heading/reading roles are reused from the Memory typography system. No new title field, payload, card inside the content card, privacy projection, API, provider or dependency.

## Executed verification

- Web unit suite: **2,468 passed, 2 existing skips**. The 14 HeartMoment component tests pass, including exact body placement, unmodified newline fidelity, one authored-text occurrence and semantic date. TypeScript, production build, token/PWA checks and scoped engineering-language audit pass. Focused lint has only pre-existing warnings in the existing component/tests; the added browser file uses the standard syntax.
- **6 new actual browser journeys pass**: shared/photo at 360 Light and 390 Dark, private/text at 430 Light, shared/photo at 1440 Dark, shared/text at 320 Light with 200% font, and tag-only without invented prose. The five full journeys verify body inside the existing article, preserved emotion/tags, no prose in h1, exactly one text occurrence, axe WCAG checks, no horizontal overflow, Edit → existing text → save once → actual changed read result → return to the originating Diary, with no unexpected API requests. Private mode has no shared CommentsPanel.
- **15 existing HeartMoment create/reference/visibility cases are covered successfully**: 8 creation/reflow/tag/photo/Quick Create cases passed; 7 visibility pending/return/error/retry/offline cases passed after their old prose-as-heading assertions were updated to check the same authored text in the content area. No lifecycle/ownership/privacy/negative assertion was removed. Their explicit title assertions for textless results now use the stable localized type heading.
- Runtime: Playwright **1.62.1**, local Chromium **153.0.8010.0**, actual React/Vite application with synthetic signed-in API fixtures. The alternate cloud-browser executable and local-only launch configuration do not alter CI or project dependencies. No wrapper/native capability changes; no physical-device acceptance is claimed.

## Actual captures

| Variant | Capture |
| --- | --- |
| Shared + photo, 360 Light | [Read](heart-reading-360-light.webp) |
| Shared + photo, 390 Dark | [Read](heart-reading-390-dark.webp), [saved viewport](heart-reading-saved-390-dark.webp) |
| Private text, 430 Light | [Read](heart-reading-430-light.webp) |
| Expanded, 1440 Dark | [Read](heart-reading-1440-dark.webp) |
| 320 Light / 200% font | [Read](heart-reading-320-light.webp) |

All prose, identities and dates are synthetic; the landscape is the existing demo asset. The user's personal screenshots and their text/images were not published. Full-page captures retain fixed navigation at its original viewport position; the saved viewport illustrates actual scroll/reading composition.

## Review results and limits

Product Reference v1 R2 / Detail View and the existing StoryDetailPageShell remain authoritative. Content is the focal point; Edit and conversation remain contextual. No additional playful animation or relationship banner is appropriate beside the authored thought. Existing navigation/task feedback, focus and reduced motion are retained. The existing shared/private, owner/capability, unavailable, offline, mutation and return contracts are unchanged.

Reuse: existing detail shell, semantic Memory title/body roles, emotion/tag/gallery/place/comment/provenance components and native time element. No external component or new infrastructure. Business/freemium impact reviewed: Free/Core with identical Cloud/Self-Hosted behavior, no entitlement, cost, quota, retention, downgrade, export or existing-data change. Backend/API tests are not rerun for this read-only composition correction; the current client suite and hosted gates cover the affected boundary.

## Hosted rediscovery assertion refinement

The first hosted browser run found one remaining old prose-as-heading assertion in Today rediscovery. Its canonical HeartMoment step now explicitly verifies the localized compact h1 and the same exact authored text in `.heart-moment-detail-text`; return, section precedence, dismissal and persistence assertions are retained. All **5 affected rediscovery journeys pass** locally at 360/390/430/1280 and 320px enlarged text in Light/Dark. This changes test expectations to the approved reading contract, without additional production UI changes. No manual workflow rerun was used; the configured runner retry reproduced the deterministic old-heading mismatch before the test correction. Fresh hosted checks remain required on this revision.

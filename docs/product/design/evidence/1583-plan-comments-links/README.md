# Plan comments and authored links — runtime evidence

Issue [#1583](https://github.com/baerenmarke90/eimir/issues/1583). Runtime and executable journey source: `743b939f085d3f6be2fd7c80508b7a43c8d34cb1`. Independent base: main `26369e5d54f91fe63c180b5bc6d47cba6a8b4900`; the earlier voice-feedback PR #1582 is unchanged.

The [generated preflight](../../references/1583-plan-comments-links/README.md) was committed and linked in the issue before UI code. R3 / Detail View retain the intention, schedule/calendar, optional gallery/place, editing, completion and canonical return. Conversation follows the description with a readable heading, contextual inline composer and author-only actions. No extra chat/navigation surface. A started reply survives opening/cancelling Plan edit; offline attempts are never queued.

## Actual browser journeys

Playwright 1.62.1, local Chromium 153.0.8010.0, actual React/Vite application with synthetic signed-in API fixtures. The cloud runtime could not download the default browser archive; an isolated Chromium executable and a temporary local configuration supplied sandbox-compatible flags. Neither the alternate browser package nor that local configuration changes project dependencies or CI.

- All **8 new journeys pass**: five full read → resolve description → compose → create → observe → resolve unavailable comment URL → edit → delete → return journeys at 360 Light, 390 Dark, 430 Light, 1440 Dark and 320 Light/200% text; failed create retains draft and request identity; read capability hides forbidden writes; opening Plan edit and going offline preserves the reply without reconnect replay. The five full journeys include axe WCAG 2/2.1/2.2 checks, explicit page-width assertions, selected Plans return and no unexpected API requests.
- **9 existing Planning reference journeys pass** unchanged in their assertions: tabs, overview/detail, loading/error/retry, progressive schedule validation, Light/Dark date ranges, cross-day 320px/Expanded reflow and accessibility. Existing fixture transports now explicitly answer the newly supported typed Plan comment collection with an empty page; no generic error suppression or acceptance removal.
- After final screenshot framing, the 390 Dark and 320/200% journeys were repeated: **2/2 pass**. Viewport captures show actual fixed-navigation coexistence. Full-page captures also contain the fixed bar at its original viewport position; use the viewport image for the lower reading/action area.

| State | Actual capture |
| --- | --- |
| 360 Light, active reply | [Composer](plan-comment-composer-360-light.webp) |
| 390 Dark, active reply | [Composer](plan-comment-composer-390-dark.webp) |
| 390 Dark, resolved description and saved/edited conversation | [Viewport](plan-comment-viewport-390-dark.webp) |
| 430 Light, saved/edited reply | [Result](plan-comment-result-430-light.webp) |
| 1440 Dark, same reading order | [Expanded result](plan-comment-result-1440-dark.webp) |
| 320 Light / 200% text | [Composer](plan-comment-composer-320-light.webp), [result viewport](plan-comment-viewport-320-light.webp) |

All people, authored text, URLs and API results in these captures are synthetic. No uploaded personal screenshots or their content were published. No deployed Immich/third-party metadata result or physical Android acceptance is claimed; the wrapper/native capabilities are unchanged.

## Lower-level verification

- Backend unit suite: **1,199 passed**. Web suite: **2,486 passed, 2 existing skips**. After the final narrow-view calendar/link wrapping adjustment, 42 focused component tests and TypeScript pass; production build, token/PWA checks and lint pass (existing repository lint warnings remain).
- Strict mypy: **334 source files pass**. Full Ruff lint/format: **733 files pass**. Actual ASGI OpenAPI drift check passes. Canonical clients were regenerated using the repository-pinned official OpenAPI Generator 7.24.0 JAR, with the same configuration as CI; hosted API Clients verifies deterministic parity.
- Scoped engineering-language audit and its **27 tests pass**. Browser inventory includes the new PR-critical spec.
- Existing comment create/edit/delete/offline ownership matrices now also exercise PLAN; their 155 focused tests passed with the link/text and Plan detail cases. The existing completion fixture explicitly supplies an empty typed discussion read, retaining all 17 lifecycle assertions.
- PostgreSQL is unavailable locally. Six new real-production-unit-of-work integration cases were collected; hosted integration shards must execute them. They cover idempotent create replay, changed-payload rejection, author/version checks, minimized Plan-target notification projection, foreign/missing parent rollback including create receipts, delete/return-to-Wish cascades, create/delete locking, and preview membership/no-store contracts. Existing shared-target HTTP matrices also include Plans.

## Contract, reuse and privacy

Comments reuse protected payloads, tenant/parent authorization, cursor bindings, request receipts, author-only versioned writes, content-free events and existing notification policy/canonical Plan targets. PLAN is added to the closed target catalog, migration 0100 and export/import validation/pruning. Downgrade refuses to silently delete authored Plan comments; export and explicitly remove them before rolling back that schema. Comments remain available on completed Plans.

For inline detection, [linkify-it 6.1.0](https://github.com/markdown-it/linkify-it) and uc.micro (MIT) are used rather than a handwritten URL regex or HTML/Markdown renderer. A native URL scheme/credential check remains mandatory after detection. User text and metadata render through React escaping. Standard [HTMLParser](https://docs.python.org/3/library/html.parser.html) and [Open Graph title/description fields](https://ogp.me/) supply inert text; no new backend dependency, metadata vendor, embedded content or provider credential. Native anchors use an announced new tab with `noopener noreferrer`.

Links are immediately openable; an explicit preview action discloses the host before the server contacts it. Only the selected URL is sent, never its surrounding comment/description. Reuse of PhotoSourceHttp provides public-address DNS validation, a pinned TLS-verified connection, mixed/private-answer rejection, no proxies/cookies/credentials/referrer, no redirects, bounded DNS/header/body reads and a six-second total deadline. Each request accepts at most 512 KiB of uncompressed HTML, parses at most 200 title/360 description characters and fetches no remote image/canonical URL/script. HTTP-only, blocked, redirected, malformed, slow, oversized, non-HTML and unavailable destinations retain a clickable ordinary-link fallback.

At most three distinct HTTPS preview choices per text avoid flooding dense conversations. An existing durable account rate limit allows 30 deliberate preview requests per 15 minutes. Preview metadata has no persistent cache and uses private/no-store responses; URLs/content do not enter logs, events or analytics. Account/Space/content/offline transitions discard late feedback.

Business/freemium impact reviewed: shared Planning, comments and safe text links/previews are Free/Core, identical in Cloud/Self-Hosted. The feature matrix explicitly records Plans and previews; no entitlement, provider subscription, storage quota or artificial Self-Hosted restriction. All migration, API/client, security, privacy, provenance and CI gates remain mandatory.

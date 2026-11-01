# November 1 product corrections

Baseline: PR #1568 `3bebb912c05ade3d0860d770022a42822f2eaffb`. The initial local investigation used an older checkout; those transient-game edits are superseded and are not part of this delivery. This follow-up supersedes the answerless game implementation documented in #1546. The PO requires the existing questions to remain and a text response for each question; the one visibility switch in Settings → Wir remains, while the duplicate inside quote selection is removed.

## Product design preflight

The [current PR Compact preflight](../couple-prompt-correction/preflight.png) supplies the corrected question → answer → share composition. The [initial generated comparison reference](generated-reference.png) was produced with the built-in Imagegen skill before the initial local edits; its game-session structure is superseded. It represents the actual Wish detail, Wir settings/quote-selection sheet and existing Zeitreise session. Source question wording, real catalog entries, existing schedule semantics and actual navigation glyphs take precedence over illustrative details. The image is a composition guide, not runtime evidence. The [prompt](prompt.txt) records the exact request.

Product Reference v1 R3/R4/R5, the Planning/Today/Settings screen templates and the existing Games task composition apply. Reuse native details/summary with the standard button class, global form controls, PageHeader, ShortTaskSheet, PreferenceSwitch and the existing account/Space-scoped overview cache. No new dependencies or provider integration.

## Mobile interaction contract

- Experiences: restore all six previously authored prompts verbatim in each existing standalone module. The focal prompt offers Answer/share and Next; free writing and retained shared history remain. A stable prompt ID opens the existing focused Memory composer, with the prompt as visible context and the canonical Memory title, and the response as body. Existing owner-local purpose-scoped drafts preserve both. Deliberate share uses normal idempotent save, partner notification, saved result and source-return behavior. No transient-only answer store, new backend domain or automatic write. Keep Pro/two-partner creation and retained Core reads.
- Quotes: Settings → Wir owns the single personal visibility switch. The existing selection sheet edits only source/category IDs, including while display is disabled. Save never sends `enabled`, so it cannot overwrite an independently changed visibility setting. Keep ETag conflicts, offline errors, pending-state guards, cancel/focus return and Free discovery.
- Wishes: the disclosure looks like an ordinary primary button and keeps native keyboard/expanded semantics. Opening reveals the existing completion and conversion flows. Title, description, place, date/time and disabled states remain recognizable. Input boundaries use a dedicated semantic control-border role; the borderless content-surface role must not erase form controls. Existing version, write serialization and canonical result/return contracts remain.
- Startup: show authorized saved overview content and its saved module choices together while refreshing in the background. Avoid serial waits for unrelated account metadata after a current membership read has authorized the active account and Space. Never use a stored membership as authorization, render revoked data or persist entitlements/private checkin entries.
- Compact remains one column, readable at 320/360/390/430 px and large text. Expanded keeps the same bounded reading order. Existing semantic feedback/focus and reduced-motion behavior remain; no added decorative animation.

## Reuse, business and quality

Reuse review: use the existing React Query and bounded IndexedDB cache rather than a second persistence mechanism or whole-client hydration. Quote purchasing is research only; no subscription, purchase or external disclosure is authorized or performed. Record provider findings separately with primary-source links.

Business/freemium impact reviewed: new experience sharing and Daily Quote remain Pro under the existing matrix; retained saved sources, Wish/Plan and startup remain Core. No quotas, new SKU, ownership, downgrade, provider cost or Cloud/Self-Hosted differences. No answer-history domain is introduced.

Cross-cutting review: authored answers use the existing shared Memory/draft lifecycle and remain absent from logs and analytics. Existing session, tenant, denial, logout and cache-generation checks remain cumulative. All new copy uses i18n; controls have accessible labels, native keyboard support and visible focus. Verify slow startup, authoritative denial, preference continuity, quote payloads, prompt selection, answer/share/read/return, Wish conversion and theme-sensitive field contrast in actual browser journeys.

## Validation

Verified on PR #1568 baseline plus the correction diff prepared on branch `fix/product-corrections-1568`. The PO subsequently authorized publication and merge after the required checks pass. Android release publication remains outside this task.

- Typecheck, token/PWA checks and production build pass. Lint has no errors; existing repository warnings remain. The English-engineering audit and browser inventory check pass.
- 210 targeted client/component tests pass across 13 files, including saved-choice continuity, authoritative cache denial, preferences, canonical creation, retained experience history and all twelve original prompt texts. The final focused rerun covers the additional downgrade assertion and accessible prompt updates.
- Fourteen distinct browser cases pass: two experience author/share/read/partner/return cases, four Wish control/completion cases, four slow-Wir-refresh/denial cases, two pre-authorization startup privacy cases and two personal quote settings cases. Happiness additionally reloads a saved draft under another question URL and proves that the original question remains paired with its answer. The existing uncertain-create path still produces only one saved source.
- Earlier runs exposed test-fixture issues (the older sign-in helper lands on Moments, a moved quote control had an outdated selector, and the new draft check lacked its locale import). Those fixtures were corrected and the affected cases rerun; no retries, timeouts, assertions or authorization gates were relaxed. Checks from the initial older checkout are not counted as acceptance of PR #1568.

| Actual browser evidence | Artifact |
| --- | --- |
| Happiness answer and restored question context | [360 Light](evidence/happiness-compose-360-light.png) |
| Time-travel question with text response | [390 Dark](evidence/timeTravel-compose-390-dark.png) |
| Quote selection without a second visibility control | [390 Light](evidence/today-daily-quote-preferences-390-light.png) |
| Saved Wir content during background refresh | [360 Light](evidence/wir-background-start-360-light.png), [390 Dark](evidence/wir-background-start-390-dark.png), [430 Light](evidence/wir-background-start-430-light.png), [1280 Dark](evidence/wir-background-start-1280-dark.png) |
| Standard Wish action and visible conversion controls | [390 Light](../../evidence/r3/wish-visible-controls-390-light.png), [390 Dark](../../evidence/r3/wish-visible-controls-390-dark.png), [320 reflow](../../evidence/r3/wish-visible-controls-320-reflow.png), [1440 Expanded](../../evidence/r3/wish-visible-controls-1440-expanded-light.png) |

All browser data is synthetic. Partner handoff verifies the existing browser/API flow; it is not physical-device Push-delivery evidence. [Quote purchasing findings](quote-licensing-review.md) are research only.

## Merge preparation

The existing #1568 CI failures were inspected before any retry. Three concrete regressions were corrected rather than rerunning a known-bad revision:

- The Memory-map fixture now supplies `ready_at` for READY attachments, respecting the existing database constraint.
- The canonical demo's text-only fallback case isolates one eligible shared historical source. Daily multi-source rotation and private/foreign exclusions retain their independent acceptance coverage.
- The browser contract now follows all three Story modes. A real focus conflict was also corrected: generic source-reader heading focus no longer overrides the selected Story tab during keyboard navigation to the Map. A component regression test covers the return-origin case.

Local merge validation: full Web tests **2,427 passed, two existing skips**, followed by **10 focused keyboard/handoff tests** after the focus correction. The actual-browser Discover/Diary/Map keyboard, filter-return, theme/reflow and accessibility journey passed. **24 PostgreSQL tests passed** for the Memory map, canonical demo and retrospective selection using an isolated local database and Python 3.14.6; CI remains authoritative for the pinned Python 3.14.8 runtime. Backend fixture lint/format and full-tree Web formatting passed. No manual GitHub workflow reruns, timeout increases or relaxed assertions were used.

The broad browser gate then reproduced a pointer-to-keyboard handoff race: clicking a peer tab across the Map route could leave a delayed generic heading handoff pending, so a subsequent End key missed its tab. All deliberate peer-tab selections now retain selected-tab focus, regardless of input method. Both the journal/map appearance journey and the full canonical keyboard/return journey pass with their original timing and focus assertions. The final focused component/client run passed **37 tests**, and the production build passed. Fresh checks are required for this additional source revision; earlier green jobs do not approve a changed commit.

The same gate found one obsolete avatar expectation in the progressive-loading browser test. The approved Diary overview omits author identity, as its existing component tests and journal browser journey require. The loading test now verifies zero avatar elements and zero avatar binary requests before and after pagination, while retaining its media deferral, pagination, motion, accessibility and failure-recovery assertions. All four progressive-loading browser cases pass locally.

Reviewing the related full-regression reference uncovered the same obsolete author-avatar expectation in three overview cases. The reference now asserts absence of overview identity while retaining first-name/viewer-relative attribution in canonical details, comment handoff, filter behavior and Light/Dark accessibility coverage. All thirteen reference cases pass locally after updating the Discover prose assertion to address its existing hero rather than the intentionally absent metadata element. This changed full-regression spec is also subject to the additional changed-spec CI job.

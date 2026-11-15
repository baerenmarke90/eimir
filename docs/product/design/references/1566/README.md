# Shared happiness and time-travel entries (#1566)

## Pre-implementation product contract

Baseline main: cd929f65336b38b70924a0ac2f36596aa8f9e55e.
The Product Owner now requires written entries, a partner Push and animated
presentation on Wir. This explicitly supersedes #1562's transient/no-recording
interaction and the older sofa-only framing in #867/#869.

Read current CoupleExperiencePage/Links and prompts, Today composition and
module catalog, canonical Memory create/receipt/authorization/export, engagement
projection/Push policy and notification preference groups before this reference.
Product Reference v1 R4/R5 and focused Create/Edit/Detail View remain normative.

## Generated whole-composition reference

![Generated Compact reference](generated-reference.webp)

Generated with built-in Imagegen before feature UI code. It shows the existing
Wir shell, couple identity, quote, authored moment, agenda and monthly material
around an incoming authored note, plus both named entry compositions. The image
is composition guidance, not a new icon/font system: use current glyphs,
typography, tokens, ProMark and real current functions. Do not implement invented
photos, counters, hints, paid labels, navigation drawings or extra paragraphs
merely because generation drew them. A focused dirty composer uses the actual
existing task/draft/return contract, not the image's illustrative dock.

## Mobile Interaction Contract

Glucksmomente invites a short present appreciation; Zeitreise invites a shared
recollection and optional past date. One labeled textarea, optional curated
inspiration and one deliberate Share action. State the actual shared-history and
partner-notification consequence briefly. No auto-send, ambient recording,
secret answers, streaks, scores or future scheduled delivery. Keep the existing
Memories domain as canonical authored history rather than a parallel story store.

Compact 320/360/390/430 and large text come first. Reuse current task/draft/create
receipt and query ownership. Pending writes cannot duplicate, uncertain outcomes
reconcile the same identity, failed/offline writes retain the draft, successful
writes lead to their actual saved result and return restores origin. Partner
absence and unavailable Pro are explicit. Reading existing content remains Core.

Wir adds one registered personal module only when a current authorized incoming
experience exists. The partner's words are primary; a bounded preview opens the
actual saved source. Existing avatar/quote/keepsake/agenda/monthly sections remain.
Use finite non-blocking paper/light reveal with ordinary focus and a static
reduced-motion equivalent. Expanded preserves bounded text and the same flow.

## Reuse, business model and cross-cutting review

Use a closed nullable origin on canonical Memory, existing idempotent creation,
shared visibility, author permissions, comments and portability. Add a safe
origin field to the existing Memory-created event so the existing engagement
projector can create a recipient-bound immediate Notification and existing
PushDelivery. No new payload store, provider, SDK, scheduler or generic framework.
No authored words enter Outbox, provider payloads or logs. Respect quiet hours,
recipient choices and current target/member authorization. Replays create one
Memory and one logical notification; imports do not send historical Push.

New creation/sharing remains under existing Space games.couple Pro; incoming display and saved
sources and essential history/edits/export remain Core after expiry. No new SKU,
resource quota or Cloud/Self-Hosted distinction. Record this explicit retained-
source boundary in the authoritative matrix. Nullable migration and validated
transfer metadata preserve older sources/imports. Signed history cursors bind
origin, caller and Space. New controls reuse the existing grouped settings.

## Acceptance plan

Author -> share -> canonical saved result -> partner Notification/PushDelivery ->
Wir reveal -> open saved entry -> return. Include equivalent-request concurrency,
unknown outcomes, 503/offline retry, current authorization/member change, source
deletion, privacy-negative/cross-tenant cases, downgrade retained reads, import
round-trip without notification replay, keyboard/axe, narrow/200% text,
Light/Dark and reduced motion. Automated checks and synthetic browser evidence
must be distinguished from actual installed-device Push delivery acceptance.


## Implemented composition and evidence

Canonical Memory owns text, authorship, comments, edits, deletion and transfer.
The nullable origin is immutable through ordinary edits. Only a new experience
requires `games.couple`; reconciliation of a committed request and retained
history, incoming display, editing and export remain Core. The focused shared
Memory composer keeps separate owner-local drafts per purpose and the existing
uncertain-response verification action. No second submission or story store
was introduced. The partner's latest incoming source is an additive personal
Today module and is excluded from the other Today selections.

The first UI changes followed publication of the generated reference on #1566
in preflight commit `632b876`. These are actual synthetic-browser captures:

| Surface | Evidence |
| --- | --- |
| Happiness composer, Compact light | [360 px](evidence/happiness-compose-360-light.webp) |
| Time-travel composer, Compact dark | [390 px](evidence/timeTravel-compose-390-dark.webp) |
| Incoming happiness, 200% text / narrow | [320 px](evidence/happiness-incoming-320-light.webp) |
| Incoming happiness, Compact dark | [390 px](evidence/happiness-incoming-390-dark.webp) |
| Incoming time travel, Compact light | [430 px](evidence/timeTravel-incoming-430-light.webp) |
| Incoming time travel, Expanded dark | [1280 px](evidence/timeTravel-incoming-1280-dark.webp) |

The browser journey runs in independent signed-in author and partner contexts,
creates both kinds through the generated client, opens the same canonical saved
source, verifies filtered history and returns from the source to Today. The
Happiness journey loses the committed save response and verifies that one
request identity produces one source. Each kind runs at 320/360/390/430/1280 px
with light/dark, reduced-motion/static equivalents, 200% text at 320 px,
horizontal reflow assertions and axe checks on the composer and Today. A new
heading wrap rule fixes the long German heading at 320 px / 200% text.

Local checks: Web build/typecheck/lint/format, registered test inventory, focused
component/draft/native wake tests, backend Ruff and Mypy, API contract checks,
and exact OpenAPI Generator 7.24.0 regeneration (786 files, no differences).
The final complete Web suite passes: 2408 tests, two intentional skips. All ten
viewport/kind browser journeys pass on the final UI composition. The initial
complete Web run exposed old catalog expectations and a removed
conversation-only copy assertion; both were corrected and verified. The
backend unit run had 1084 passes and two failures: the changed DTO expectation
and a missing environment-only `socksio` package. After correcting the DTO
expectation and installing that package only in the local environment, all 19
relevant unit tests passed. No dependency manifest or lockfile changed.

Local browser evidence uses isolated Chromium 153 because the pinned browser
archive could not be unpacked in this environment. Local Python is 3.12; CI
owns the pinned runtime and PostgreSQL integration acceptance. The 13 new
PostgreSQL cases cover recipient isolation, duplicate/replayed/concurrent saves,
generic provider payloads, deletion, partner exit, entitlement downgrade,
filtered cursors, prior channel opt-outs, invalid content and transfer restore
without historical notification replay. They are collected but skipped locally
because a real PostgreSQL service is unavailable. No SQLite substitute is used.
Actual Android device delivery and keyboard/IME behavior still require the
normal installed-device release acceptance; mocked provider and browser results
do not establish that acceptance. No transport/provider/native bridge changed.

The initial CI revision was inspected: change detection rejected German
synthetic author text and an obsolete German assertion in engineering tests;
Web Reference Flow also caught one unformatted assertion. Fixtures now use
English authored sample content, the obsolete assertion is removed, and
format/language checks pass locally. The failed Backend Integration aggregate
had not run PostgreSQL because change detection failed; it is not reported as
a database result. Fixes receive a new commit and fresh checks, with no manual
workflow reruns.

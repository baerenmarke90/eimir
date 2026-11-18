# Personal gentle prompts

**Owning Product Owner decision:** #1620, 2026-11-03.
**Product tier:** Free/Core on Cloud and Self-Hosted.
**Scope:** Web/Mobile Web, with the existing supported push registrations.

This narrowly supersedes the previous blanket exclusion of automatic inactivity
invitations in the notification workflow. It does not introduce daily summaries,
streaks, response pressure, relationship judgements, partner presence, recap
invitations, post-Plan inference, new rituals or a native feature project.

## Consent and surfaces

`Account.gentle_prompts_enabled` is the single authoritative personal opt-in.
It defaults to false for both existing and new accounts. The notification
preferences API exposes the dedicated `GENTLE_PROMPT/PUSH` choice through that
same value; ordinary group inheritance, email, Center choices and OS permission
cannot enable it. The explicit device-onboarding action described below can opt in through this same API; OS permission alone cannot. No independent NotificationPreference override can grant it.

The existing settings category adds one localized switch, with confirmed
immediate-save/pending/error feedback. Device permission remains separate and
uses the existing explicit device-enablement flow when relevant. The combined onboarding copy names Small Invitations: choosing Activate first confirms device registration and then enables `GENTLE_PROMPT/PUSH`. Later, denial and token refresh never enable it. A failed preference write retains an explicit retry without repeating registration. The independent settings switch remains authoritative after onboarding. There is no
day, time, frequency, topic or per-channel configuration for these invitations.

The existing contextual Wir region may offer one quiet invitation when it has
no more relevant current item. The ordinary sparse first-use invitation,
rediscovery, questions and personal module visibility retain their semantics.
An invitation is neither an unread item nor a transient global banner. Its
server-owned daily occasion remains dismissed/opened for that day. A selected
Memory already featured elsewhere in Wir is suppressed in this region.

Writing opens the existing blank Memory composer; helper wording is never
silently stored in title/body. Memory rediscovery opens the currently authorized
canonical detail. Opening resolves current recipient/source state before the
existing task-origin navigation; late completions cannot redirect a departed
surface. Existing editor leave protection remains the external-open boundary.
The existing short contextual sheet provides personal source exclusion. It
preserves the Memory and the partner's access, and confirmed dismissal restores
focus to readable feedback. New copy is in `i18n/locales/gentlePrompts.ts`.

## Bounded own-use learning

Collection requires explicit consent, current authentication and membership.
Visible, trusted pointer/keyboard interaction is coalesced to at most one
foreground request per 15 minutes per mounted owner context, including failures.
There is no timer, background polling, offline queue or replay of unsent use.
The server supplies the timestamp/timezone and coalesces ordinary foreground
updates. Successful deliberate HTTP Memory, HeartMoment and Plan saves record
current activity, including when their content date is historical. Idempotent
create replays do not manufacture another save. Domain imports, Outbox events,
background refresh, token/media requests and scheduler work never call this
learning seam. Collection failure cannot fail a normal content save.

An existing intentional Memory-detail receipt can mark an observed reading day.
Old Story receipts are never replayed into a new adaptive profile. No diary
prose, images, moods, relationship quality, location, contacts, calendar outside
eimir., partner activity, external analytics or AI provider is examined.

Store at most eight distinct local activity dates from the last 90 days,
each with bounded three-hour window observations and one reading-day flag.
Multiple sessions on a date do not add confidence. Three distinct days are
required for cadence; the median positive calendar-date gap is the interval.
A window needs three supporting dates. Rank supported windows by support,
then most recent own use, then stable window identity. Choose the strongest
window that has an available portion under personal Quiet Hours. Missing or
insufficient window/cadence evidence authorizes no automatic push.

Own use recomputes this profile and resets the unobserved-use attempt sequence.
It retains the elapsed-time delivery budget. During absence, prune old date
observations without erasing derived cadence/windows. After 120 days without
qualifying use, clear learning and stop automatic delivery even when fewer than
three attempts occurred. Only enough fresh use can establish a new rhythm.

## Eligibility and ranking

All gates intersect. First eligibility is last qualifying use plus
`max(7 days, 2 × typical interval)`. Apply one recipient-wide rolling seven-day
ceiling, across Spaces, types and devices. After the first logical attempt with
no new use, wait at least 14 days; after the second, 28 days; after the third,
pause until actual use resumes. New sources never reset those rules. Returning
applies the initial inactivity threshold again, without an immediate greeting.

Use the authoritative Account timezone and existing DST resolver. A learned
local three-hour window expires at its local end; missed windows are dropped.
Existing personal Quiet Hours filter it. Null boundaries are already the
documented off/default policy, so no second 09:00–21:00 schedule overrides
explicit evening/shift-work use. Cold start never substitutes a fallback time.
Elapsed-time budget/backoff timestamps survive timezone changes and DST folds.

Suppress current/newer own activity, relevant completion, opened/dismissed or
excluded occasions, lost membership/source access, unsupported registration,
the 24 hours following a real partner push, and a deliberately scheduled manual
Reminder occurrence in the same window. Later intentional partner events keep
their ordinary delivery behavior.

V1 is two typed cases, not a campaign engine. At least two observed Memory
reading days in the bounded profile prefer rediscovery. Select the oldest
eligible shared Memory with stable UUID tie-break, using one metadata query
with indexed exclusion/view/repeat predicates. Otherwise offer a localized
rotating writing invitation. A recent own manual save satisfies the current
day's in-app writing occasion. A partner's save cannot satisfy it.

Rediscovery requires a shared Memory in the recipient's current two-person
context, at least 30 days old, with current Core access and a usable destination.
Owner-only/private sources are never candidates. Suppress the recipient's
intentional view within 30 days, a previous suggestion within 90 days, and
personal permanent exclusions. Missing view receipts are not evidence of not
having read a source. Fetching/rendering a suggestion consumes no external-send
attempt and creates no partner message.

## Canonical delivery and concurrency

The existing Account effect barrier serializes account-wide reservations.
An occasion and reference-only `GENTLE_PROMPT_READY` Outbox fact commit together.
Projection creates one invisible canonical recipient Notification, and the
normal PushDelivery/Job pipeline selects one newest supported endpoint. No new
inbox, unread ledger, transport, service, credential or external scheduler exists.

An optional job preparation hook commits a submission claim before provider
I/O. Only that worker invocation receives the transient handoff token. The
normal push handler reacquires Account/current membership barriers, rechecks
consent, rhythm, budget, activity, collisions, source/exclusion, window expiry,
endpoint and current destination capability, then submits through the existing
provider. A crash after claim, an ambiguous provider response or rollback after
provider acceptance keeps the logical attempt counted and cannot blindly
resubmit. A positively known pre-provider non-delivery releases its claim;
unknown acceptance is never described as the user ignoring an invitation.
Notification read/bulk-read state is not display, dismissal or click evidence.

Legacy generic-only wakes do not qualify for these optional invitations.
UnifiedPush needs its existing negotiated reference version; FCM needs the
existing encrypted-preview key and live bound session family. Registration is
rechecked at submission. Generic lock-screen transport and the existing
encrypted reference/preview boundary remain; no arbitrary route or private
content is added to plaintext. No identical sound/banner behavior across every
browser/device is promised.

Offboarding retains its Membership-first lifecycle. It clears the departing
recipient's learning and unsent sources without taking the PushDelivery lock in
reverse order. Current membership gates immediately stop delivery; subsequent
reconciliation also invalidates an unusable relationship context. Source
deletion nulls its adaptive reference without erasing the technical attempt
budget. The protected source is checked again on explicit push open.

## Lifecycle, operations and costs

Opt-out immediately stops collection, removes observations/derived state and
unsent occasions, and cancels queued deliveries. Explicit exclusions remain
personal choices. Retain only minimal canonical attempt/source repetition
evidence under its bounded lifecycle; re-enabling starts an empty observation
profile and does not backfill from old content/views.

The existing PostgreSQL worker processes indexed batches of 100 recipients;
full batches schedule another ordinary queue job promptly, otherwise every
15 minutes. Candidate retention cleanup is indexed and bounded. Occasions older
than 120 days are pruned. Exclusions cascade with source/Space/account deletion
and are removed on departure from their Space. Account deletion clears all
adaptive state through the existing fail-closed deletion pipeline.

Personal exports include only the caller's consent, observations/derived profile
and exclusions for the exported Space. Shared exports contain none of this
behavior data. These export-only settings never silently activate collection
or paid choices when an untrusted bundle is imported. Ordinary content, Story
views, Notification/PushDelivery retention and backup behavior retain their
existing lifecycle. Downgrade does not remove content or this Core control.

No activity/source behavior is exported to analytics or a partner/admin view.
The application excludes the narrow adaptive receipt/action routes from access
logging; request IDs and authentication still apply. Operators must retain the
same no-content/behavior boundary in their reverse-proxy/access-log setup.
Aggregate technical diagnostics are sufficient; private use is not support data.

Migration 0104 is additive and defaults off. Downgrade removes only this derived
state and new notification semantic, preserving authored content. Existing
infrastructure/provider readiness determines external availability equally on
Self-Hosted and Cloud. No new provider or media storage cost is introduced.

## Acceptance evidence

[Generated preflight and Mobile Interaction Contract](design/references/1620-gentle-prompts/README.md).
Pure policy tests inject time. PostgreSQL tests cover independent concurrent
workers, account-wide reservation, consent/activity/source cancellation, durable
submission ambiguity, offboarding lock order, retention and current manual
historical saves. Browser/component tests cover one switch, save failures,
consent persistence, dismissal/open/exclusion, blank composition, late ownership,
Compact/Expanded, Light/Dark, 200% text, reduced motion and axe.

Browser mocks and fake provider evidence are not real-device provider delivery.
Physical push/cold-start/long-background acceptance requires an available
supported device/provider environment; retain that limitation in the PR.

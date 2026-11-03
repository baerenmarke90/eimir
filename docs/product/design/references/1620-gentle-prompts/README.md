# Gentle prompts — implementation preflight

Issue: #1620. Inspected main: `9bb7bd4673ffbc19965baffbbf07ce6c4ef21d4a`.
Dependency: #1619 at `f4d52360c7a979547c972b9c4444dd7e066ac585`, merged
locally with main before implementation. Its ordered media, Memory period,
Place, editor lifecycle and source-authorization contracts are preserved.

## Repository-aware visual preflight

The current `/more/settings/notifications` was rendered at 390 CSS px using
the repository's authorized fixture before UI changes. It contains the focused
category heading, personal recipient explanation, device registration where
supported, email destination, shared-activity and closeness groups with their
existing disclosure, Quiet Hours, important-date settings, inbox link and the
four-destination shell. The generated [Compact reference](compact-reference.png)
adds one off switch after the destination. It is a composition reference, not
runtime evidence. The native device-registration section remains conditional.
No new topic, schedule, channel matrix or onboarding task is added.

Authority: Product Reference v1 principles 1–9, Design DNA 4–9 and D6/D7;
R5 Settings and Privacy, R4 Today and R1 capture; Settings and Privacy, Today,
Detail View and Create/Edit templates. Existing `PreferenceSwitch`,
`ProblemState`, immediate preference mutation, `TodayDestinationLink`,
task-origin/leave guards, contextual actions and semantic typography, spacing,
surface, focus, touch-target and motion tokens are the selected primitives.

## Mobile Interaction Contract

- Outcome: personally opt into occasional useful invitations without making
  the relationship feel like a task. The partner never sees the adaptation.
- Compact: one labeled switch with actual saved state and a short explanation.
  Immediate save is the only settings action. Existing notification groups and
  permissions remain independent. No keyboard is activated.
- In-app: at most one dismissible invitation in the existing contextual Wir
  region; normal memories and rediscovery retain their existing consent rules.
  Content/meaning leads, one action opens an existing detail or Memory composer.
  No new unread count, transient global banner or competing widget stack.
- Navigation: canonical authorized routes, source revalidation and existing
  task-origin/leave protection. No prompt is silently saved as authored content.
  Contextual Memory exclusion is personal and never deletes the source.
- Initial/loading: existing settings loading feedback; optional suggestions
  render nothing until confirmed. Empty, insufficient history and no candidate
  produce no push. Permission unavailable is truthful and uses existing device
  registration controls; it does not silently turn consent on or repeatedly ask.
- Error/offline: preserve confirmed preference, show existing inline failure
  feedback and block offline writes. Collection/selection errors stay quiet and
  never interrupt normal reading or editing. No offline activity backlog.
- Success: switch reflects server confirmation and announces the existing saved
  status. Dismissal stays dismissed for its occasion; explicit Memory exclusions
  survive opt-out. No guilt, streak, reciprocity or relationship judgement.
- Touch/a11y: native semantic switch/menu/button/link, named controls, keyboard
  focus and existing >=44 CSS px targets. Text wraps at 320/360/390/430 px and
  enlarged text; long descriptions increase height. No color-only state.
- Motion: shared immediate-state feedback and contextual transitions; no autoplay
  or celebratory animation. Reduced motion preserves information and focus.
- Expanded: same utility hierarchy and bounded content width, existing shell;
  no new table or desktop settings matrix. Lists are appropriate for utility
  controls, not for presenting authored relationship content.
- Validation: switch open/change/persist/failure/return, suggestion dismiss/open,
  exclusion and dirty-draft interruption; Compact/Expanded, Light/Dark, narrow
  enlarged text, reduced motion and axe evidence on the final implementation.

## Reuse, business and cross-cutting decisions

Reuse the existing PostgreSQL queue, Outbox, recipient Notification,
PushDelivery, own-account choice and account/membership barriers, protected
target authorization, Story explicit views, timezone/DST helpers, Quiet Hours,
generic/encrypted payload and canonical navigation. No marketing provider,
analytics vendor, AI model, parallel scheduler or unread ledger is needed.
Custom code is limited to the deterministic product policy and bounded private
state. No new runtime dependency or credential is introduced.

Basic prompts and attention protection are Free/Core under the explicit #1620
PO decision, equally on Cloud and Self-Hosted. Existing target permissions,
entitlements, technical quotas and retained-content access continue to apply.
Downgrade is non-destructive. No new media storage or provider charge.

Security/privacy: authenticated account-owned signals, server time and timezone,
no raw events/content/presence, account/Space isolation and race rechecks.
Lifecycle: eight recent active dates/90 days, derived-state expiry after 120
days; opt-out clears learning immediately, retaining only explicit exclusions
and minimum attempt evidence. Account/source/Space cleanup and personal export
must cover the new state. No per-account behavior in telemetry.

Concurrency/resilience: serialize account-wide reservations with the existing
Account barrier, expire pending occasions at the eligible window end, recheck
consent/activity/source/collisions at submission, and retain ambiguous attempts
without unsafe provider resubmission. A missed occasion never becomes backlog.
Use indexed bounded batches and separate read state from attempt evidence.

API/migrations: additive default-off state, controlled notification semantic,
generated clients and migration/drift/rollback validation. No native Compose,
APK, release or deployment is in scope. Provider/device acceptance must be
reported separately from mock transport and browser evidence.

## CI preflight

Inspected before implementation: AGENTS.md and CONTRIBUTING.md; CI change-scope
classifier; Backend and four integration shards; encrypted-backend integration;
OpenAPI/generated clients; Web S8; Web Browser QA groups/aggregate; Product
Design Review and Reuse Review metadata gates. Metadata events include `edited`;
ordinary CI source checks need a fresh source head. No required gate is removed.

Plan: run formatting/lint/types, focused pure/component tests, contract/codegen,
browser inventory and relevant build checks before the initial PR push. Add
meaningful PostgreSQL coverage for reservation, cancellation and ambiguous
submission and use hosted PostgreSQL when unavailable locally. Collect useful
independent failures before a coherent correction push; target unchanged retries
only to diagnosed transient failures. No hosted run has been manually retried.

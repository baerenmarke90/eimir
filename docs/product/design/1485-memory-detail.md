# Approved compact Memory detail and photo reactions

Owner: [#1485](https://github.com/baerenmarke90/eimir/issues/1485). Baseline reviewed: `460d7cb6`.

The Product Owner approved the executable compact composition and explicitly requested an exact implementation on 2026-10-28. The [generated reference image](evidence/memory-detail-approved.png) and [executable reference](evidence/memory-detail-approved.html) preserve that decision. Location labels in published evidence are synthetic; personal location data from the conversation is not published.

## Product Design Preflight and Mobile Interaction Contract

This is a bounded R2/Detail View refinement under Product Reference v1. The later owner decision selects the compact sans-serif heading, lighter reading ground and the exact media/location rhythm. Existing media delivery, authored prose/tags, author edit permissions, map links, place actions/attribution, comments and provenance remain available.

- A custom title is the heading, followed immediately by an independently formatted date. An empty or exact localized generated fallback title uses the date as the heading, without a duplicate eyebrow. Stored titles are not rewritten. Missing event dates remain honestly unspecified.
- Concealed photos retain recognizable broad color/shape with the centrally configured 12px blur. A 48px circular eye-off indicator replaces visible warning text; localized accessible names remain. Tap reveals/hides the sensitive photo directly. Background, scope and classification boundaries retain the existing volatile reveal lifecycle.
- The small smile-plus entry is anchored to the photo's lower-right edge. A 450ms primary-pointer hold opens the same six presets; movement, cancellation and removal cancel a pending hold. Releasing a hold does not reveal the photo. Full viewing remains a secondary action after reveal, and ordinary photo taps retain full viewing.
- Each account has at most one reaction per bound Memory photo. Selecting another replaces it; selecting the current reaction removes it. Chips appear only for actual confirmed reactions. There is no empty reserved row.
- The location starts 12px after the media/chips. The section retains an assistive heading while omitting its visible heading. Existing map, manage/unlink and attribution behavior remain.
- Native buttons, the existing dismissible-popover/history primitives, keyboard focus, Escape/Back/outside dismissal and a visible alternative to holding remain available. Large text may wrap the preset strip. Feedback uses existing motion roles and is static with reduced motion.
- Compact is normative. Expanded retains the same reading order and bounded content width. Loading, failure, offline and denied reads retain existing honest states. Offline reactions are disabled; confirmed writes alone update chips and the scoped read cache. A failed write retains existing reactions and offers retry.

## Reuse and business model

Reuse review: existing React Pointer Events/timers, MediaGallery, EimirIcon, semantic tokens, React Query ownership, protected Memory payloads, tenant/parent guards and transfer infrastructure cover the task. A general emoji library, external reaction provider, additional media processing or a second gallery/domain store would add dependencies without functional value. Custom code is bounded to the six domain choices and their interaction. No new third-party license, provider, account, configuration or operating cost is introduced.

Business/freemium impact reviewed: this extends Free/Core shared Memory communication identically in Cloud and Self-Hosted. The authoritative feature matrix explicitly records the classification. No entitlement or quota change; security, accessibility, deletion, export and existing data remain available after downgrade.

## Data, concurrency and privacy

Reactions live in the existing encrypted-at-rest `MemoryPayload`, with a legacy-compatible empty default and a 40-entry bound (two members × twenty photos). They are not independent media access grants. Shared historical reactions follow the same retained/tombstoned-account semantics as shared comments; no profile details or account identifiers are exposed in the aggregated reaction DTO.

The set/remove endpoint authenticates the current account and membership, holds the account deletion barrier and an exclusively locked, authorized Memory, and verifies that the target is a currently bound ready image. The caller cannot supply another account's identity. Unknown, unbound, foreign and malformed photo targets remain absent. Only the caller's reaction changes. Retries of an already selected value or an already removed reaction are no-ops, including version and outbox count. Changed reactions advance the parent version, so stale editors conflict rather than overwrite them. Author edits preserve reactions; detach prunes them.

Only a neutral existing Memory-updated event is recorded. No reaction content enters logs, notification payloads or an additional browser store. Parent/Space deletion and encrypted backup use the existing payload lifecycle. Transfer validation checks embedded member/photo references and parent bindings, then remaps both references on import. Old clients ignore additive response fields. Older backend binaries with strict payload parsing must not be rolled back over payloads written by this feature without restoring a compatible backup/version.

## Evidence and validation

The actual application is exercised with synthetic location data and the repository's existing demo image, rather than personal conversation media:

- [Compact Light, 390px](references/1485/approved-light-390.png)
- [Compact Light, 360px](references/1485/approved-light-360.png)
- [Compact Dark, 320px](references/1485/approved-dark-320.png)
- [Compact Dark, 430px](references/1485/approved-dark-430.png)
- [Expanded Light, 1280px](references/1485/approved-light-1280.png)

Browser journeys cover the measured 12px gap, tap/hold without accidental reveal, six preset choices, confirmed persistence/reload/removal, no reserved empty row, accessible names, keyboard/Back/background concealment, carousel/fullscreen stability, Light/Dark, 200% text and reduced motion. Component tests additionally exercise canceled gestures, failure and late completion after a scope change. Backend tests cover idempotence, partner isolation, validation, stale editing, detach cleanup and protected transfer remapping.

Local validation details and any remaining CI/database evidence are recorded in the pull request. This is shared Web/Capacitor UI work; no Android packaging or release-channel change is included.

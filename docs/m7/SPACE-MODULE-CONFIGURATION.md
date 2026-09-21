# Space Module Configuration v1

**Status:** M7-S0 product/domain decision for #432  
**Version:** 1.0  
**Date:** 2026-09-20  
**Depends on:** #432, ADR 0006, ADR 0007, `docs/FREEMIUM-FEATURE-MATRIX.md` v1.2  
**Implementation sequencing:** G5 is complete and #1113 has merged; this matrix freezes the product/domain contract before typed persistence, API, and runtime enforcement proceed.

## 1. Purpose

Space module configuration is a **shared product choice for one relationship Space**. It is not a second deployment feature-flag system, not a commercial Entitlement store, and not a replacement for personal preferences.

The effective capability remains an intersection:

```text
deployment/server capability
        intersection
commercial entitlement capability
        intersection
Space module configuration
        intersection
personal preference/consent where required
        =
effective product capability
```

A Space switch can only remove an optional experience from the Space. It cannot grant a capability that deployment or Entitlement policy withholds, weaken Privacy/Security/Data Rights, or override a partner's personal consent.

## 2. Classification vocabulary

Every larger product capability must be classified before runtime is added:

- **SPACE_CONFIGURABLE** — the configuration manager may enable/disable the shared optional module.
- **PERSONAL_CONFIGURABLE** — each Account decides independently; the Space manager cannot change the partner's preference.
- **ALWAYS_AVAILABLE** — core product, Security, Privacy, Accessibility, essential portability/data rights, or another capability whose availability must not be controlled by one partner.
- **DEPLOYMENT_ADMIN_CONTROLLED** — operator/deployment state, not relationship product state.

Commercial classification is a separate axis. A capability may be Free/Core or Premium and still be classified independently here.

## 3. V1 typed Space module catalog

The V1 catalog is deliberately small. These are the only Space-wide module booleans #432 should persist initially.

| Typed field | Product module | Owner | Commercial class | Default | Classification | Rationale |
|---|---|---:|---|---:|---|---|
| `vibeCheckEnabled` | Vibe Check | #429 / ADR 0007 | Free/Core | `false` | SPACE_CONFIGURABLE | New optional daily relationship ritual. Explicit enablement avoids silently introducing emotional-status prompts into existing Spaces. |
| `energyCheckInEnabled` | Daily Energy Check-in | #431 / ADR 0007 | Free/Core | `false` | SPACE_CONFIGURABLE | Independent optional DailyCheckIn dimension; may be enabled without Vibe. |
| `loveNotesEnabled` | Liebesbriefkasten / partner notes | #429 | Free/Core | `false` | SPACE_CONFIGURABLE | Optional shared interaction. Existing delivered notes remain protected/readable when disabled. |
| `supportGesturesEnabled` | Thinking of You + bounded support gestures | #455 / #429 | Free/Core | `true` | SPACE_CONFIGURABLE | Existing ThinkingOfYou behavior is already shipped, so the rollout default preserves current behavior. Future support gestures reuse the same module boundary rather than adding one switch per gesture. |
| `sharedAchievementsEnabled` | Shared achievements / celebrations | #430 | Free/Core | `false` | SPACE_CONFIGURABLE | Optional relationship-depth presentation over existing authoritative completions. |
| `dailyQuestionsEnabled` | Daily Questions / shared answers baseline | #444 and related M7 work | Mixed (Free baseline) | `false` | SPACE_CONFIGURABLE | Optional recurring relationship ritual. Premium reflection extensions remain Entitlement-controlled separately. |

The database/API representation must remain typed. V1 must **not** persist arbitrary `module_key -> value` rows or a free-form JSON feature blob.

Adding a future Space module requires:
1. a product classification decision;
2. a stable typed field and default;
3. explicit read/create/update/delete/jobs/notifications/re-enable semantics;
4. Entitlement relationship;
5. data lifecycle and Privacy behavior;
6. generated-client coverage;
7. a versioned update to this catalog.

## 4. Shared DailyCheckIn configuration

The following fields are typed Space configuration but are **not module switches**:

```text
dailyContextTimezone: IANA timezone | null
vibeVisibilityMode: IMMEDIATE | MUTUAL_REVEAL
energyVisibilityMode: IMMEDIATE | MUTUAL_REVEAL
```

Rules from ADR 0007:

- `dailyContextTimezone` is validated with the existing authoritative IANA timezone validator.
- There is no request-time fallback to a caller/device/account timezone.
- Enabling `vibeCheckEnabled` or `energyCheckInEnabled` requires a persisted `dailyContextTimezone`.
- The UI may preselect the manager's validated Account timezone, but persistence happens through the Space configuration write before a DailyCheckIn dimension becomes effective.
- Changing the timezone while a current Space-day DailyCheckIn exists is rejected with a conflict.
- Vibe and Energy can be enabled independently.
- Visibility modes are dimension-scoped; enabling one dimension does not unlock/reveal the other.
- `MUTUAL_REVEAL` affects projection eligibility only. It is not another module or Privacy class.

Web surface (#432): the Account timezone is not part of any client-visible API, so the Web
settings surface suggests the manager's device time zone for the first Vibe/Energy enable and sends it
in the same atomic configuration write. The zone then stays visible and deliberately changeable in the
Space settings; a refused change while current-day state exists is explained in place. The device zone
is a one-time suggestion only and is never used to derive the shared day afterwards.

The initial visibility mode is `IMMEDIATE`. Mutual Reveal is an explicit configuration choice rather than an implicit consequence of enabling a dimension.

## 5. What is not a Space module

### 5.1 Personal configuration

These remain Account-scoped and cannot be changed by the Space manager for the partner:

| Capability | Existing/owning contract | Reason |
|---|---|---|
| Today/Dashboard module show/hide | #817, Dashboard preferences | Presentation preference is Account + Space scoped; every person chooses their own Dashboard. |
| Notification channels, digest, quiet hours | notification preferences | Attention/notification preference is personal even when the underlying module is shared. |
| Locale and Account timezone | Account preferences | Personal presentation/context. `dailyContextTimezone` is separately shared Space state. |
| Appearance/theme selection where personal | appearance settings | Personal presentation must not become creator authority. |
| Participation in Vibe/Energy/Daily Questions | owning M7 domain | Enabling a module permits participation; it never forces a person to submit personal relationship information. |

### 5.2 Always available / not Space-disableable

The V1 Space manager cannot turn off:

- Account identity, authentication, passkeys, session security and recovery;
- Tenant isolation and authorization;
- Account deletion, Space offboarding and required Privacy controls;
- essential machine-readable export/portability;
- Accessibility and i18n foundations;
- Space creation/Membership/invitations/relationship lifecycle;
- core Memories/Timeline and authorized media access;
- Wishes/Plans and core planning;
- Search needed to locate authorized history;
- Profile/relationship context;
- owner-private `PrivateNote`, `GiftIdea`, private HeartMoment and their isolation guarantees;
- core read access to already-authorized content;
- shared content deletion/export rights that remain available under the owning domain contract.

In particular, the manager cannot use #432 to delete, hide permanently, reclassify, or revoke the partner's OWNER_ONLY data.

### 5.3 Deployment/admin controlled

The following are outside Space configuration:

- registration enabled/disabled;
- maintenance mode;
- authentication provider/mechanism availability;
- ServerAdmin capabilities;
- mail/storage/media provider configuration;
- Demo deployment mode;
- deployment feature/capability switches;
- Entitlement source adapters and billing provider configuration;
- backup/recovery/runtime topology.

## 6. Premium and other M7 capabilities

Some optional product capabilities are **not** added to the V1 Space-module catalog merely because they are optional.

| Capability | V1 #432 classification | Reason |
|---|---|---|
| `Gemeinsam spielen` / couple games (#866) | ALWAYS_AVAILABLE when Entitlement permits; not Space-configurable in v1 | It is a first-class paid product area. Allowing the creator to hide a capability purchased/sponsored by the partner creates avoidable control asymmetry. Entitlement remains the availability authority; either person may simply choose not to play. Revisit only by explicit Product Owner decision. |
| Voice notes (#512) | ALWAYS_AVAILABLE within owning content domain | It is a content modality, not a separate relationship module; Cloud storage capability/quota remains a different axis. |
| Printable chronicle/yearbook (#517) | Entitlement/action controlled, not a Space module | A generated artifact action does not require persistent shared module visibility state. |
| Annual video montage | Entitlement/action controlled, not a Space module | Same reason as printable artifacts. |
| Surprise Mode (#514) | Entitlement/owning interaction controlled, not in v1 catalog | Specialized reveal action; underlying Privacy remains non-paywallable. |
| Premium themes/covers | PERSONAL_CONFIGURABLE subject to Entitlement | Presentation choice should not let the creator style/control the partner's client. |
| External integrations (M8) | Deferred to owning integration decision | Provider authorization, data flow and operator/user ownership need integration-specific semantics rather than a speculative generic Space switch. |

## 7. Disable / re-enable semantics

**Disable is not delete.** Configuration changes never delete domain rows, media, history, or protected partner data.

The module switch gates **product participation**, not ownership, Privacy, retention, or data rights:

- a disabled module may hide its normal navigation/Today surface and reject new feature participation;
- a user's existing delete/clear/export/data-right path remains governed by the owning domain and must not be blocked merely because the module is disabled;
- the configuration manager gains no new read, update, or delete authority over the partner's data;
- required retention, minimization, account deletion, Space offboarding, and cleanup work continues even when feature work is suppressed;
- every job/notification side effect that belongs to a configurable module must re-check effective capability before creating a new module effect.

In the table below, **Read** means ordinary product read/projection. Mandatory export, deletion, Privacy, and lifecycle paths remain separate authorities.

| Module | Read while disabled | Create while disabled | Update while disabled | Delete / clear while disabled | Jobs while disabled | Notifications while disabled | Re-enable |
|---|---|---|---|---|---|---|---|
| Vibe Check | No active partner/current-status projection. Required owner/data-right access remains governed by the DailyCheckIn/Privacy contract; Mutual Reveal is never bypassed. | Block new Vibe participation and omit prompts. | Block Vibe value changes. | The owner may clear their own Vibe dimension; clearing the final populated DailyCheckIn dimension follows ADR 0007's normal row-removal semantics. | Prompt/projection work skips; bounded retention/minimization continues. | No new Vibe-derived notification. | A still-current retained value may become effective again; expired/minimized data is never resurrected. |
| Energy Check-in | Same as Vibe, scoped only to the Energy dimension. | Block new Energy participation and omit prompts. | Block Energy value changes. | The owner may clear their own Energy dimension; final-dimension cleanup follows the shared DailyCheckIn contract. | Energy prompt/projection work skips; bounded retention/minimization continues. | No new Energy-derived notification. | Same as Vibe, dimension-scoped. |
| Love Notes | Already delivered notes remain readable to their authorized recipient/history under the owning note contract. | No new sends. | Existing recipient open/read-state transitions remain allowed; #432 grants no content-edit authority. | Any owning-domain self-delete/clear right remains available to its authorized user; the Space manager cannot delete the partner's notes. Disable itself deletes nothing. | New module delivery/prompt work skips; required retention/deletion cleanup continues. | No new note-delivery notification after disable; existing notification read/retention state follows its own lifecycle. | Existing notes remain; sending resumes without synthetic notes or replayed delivery notifications. |
| Support Gestures | Existing authorized Activity/Notification history remains readable under its existing lifecycle. | No new ThinkingOfYou/support sends; module entry points disappear. | Gestures are not edited; existing notification read-state remains governed by the notification contract. | Existing retention/deletion rules continue; the Space switch never deletes historical events or notifications. | Queued/new gesture effects re-check effective capability and no-op while disabled; retention cleanup continues. | No new gesture notification; already-persisted notification state remains readable/manageable under its own contract. | Sending resumes without replaying or synthesizing gestures. |
| Shared Achievements | Underlying Plan/Collection/etc. data and authorized historical Activity remain readable; active celebration presentation is hidden. | No new celebration derivation. Underlying domain creation/completion is unaffected by this module switch. | No module-specific celebration update; underlying source updates remain governed by their own domains. | Underlying content deletion/data rights remain available; disabling the celebration module deletes no source or historical record. | Achievement derivation work skips; owning-domain cleanup continues. | No new achievement-specific notification. | Future qualifying completions may be celebrated; no retroactive replay unless a later explicit product decision defines one. |
| Daily Questions | Revealed answers/history remain readable; each Account's own otherwise-authorized answer remains accessible. A partner's unrevealed answer remains completely absent. The current daily module entry is hidden. | No new daily occurrence participation or answer submission. | No answer edits while disabled; revealed answers stay frozen and unrevealed partner content stays hidden. | If the owning Daily Questions contract exposes self-delete/clear, that path remains available and cannot reveal or delete the partner's answer. Disable itself deletes no answer. | No new daily occurrence/prompt work; required retention/lifecycle work continues. | No new Daily Questions prompt/reveal notification. | Normal authoritative scheduling/participation resumes; no retroactive prompt replay or dummy answers; existing reveal state is preserved. |

Direct API/deep-link create and update actions must enforce effective module availability server-side. UI hiding is presentation only and never the security boundary. **Delete/clear/privacy endpoints must not reuse a blanket "module enabled" guard when doing so would prevent an otherwise-authorized user from exercising the owning domain's data rights.** They still enforce normal Membership, ownership, Privacy, tenant-isolation, concurrency, and lifecycle rules.

The API slice must expose a stable typed unavailable error for gated participation without confirming foreign-Space resource existence.

## 8. Versioning and concurrency contract

Space configuration is one versioned server resource, not independent client booleans.

Required runtime shape:

- one typed configuration row per Space;
- optimistic concurrency using the repository's existing `version` / ETag primitive;
- both partners may read the same effective Space configuration;
- only `canManageSpaceConfiguration` may mutate it;
- writes are server-authoritative and update only declared typed fields;
- clients refetch/refresh configuration after a successful mutation and when the active Space/account context changes.

For forward compatibility, the API should prefer a **typed PATCH + If-Match** contract over a full replacement body. An older generated client must not reset a newer field merely because it does not know that field.

A config write must validate the complete resulting state atomically. Examples:

- enabling Vibe/Energy without `dailyContextTimezone` fails;
- invalid IANA timezone fails before any field changes;
- stale ETag returns 409 with no partial update;
- an unauthorized partner receives no write capability even if they construct the request manually;
- deployment/Entitlement state is not written into this resource.

### 8.1 Legacy configuration-manager reconciliation

Migration 0062 deliberately fails closed for a pre-M7 Space whose retained
Membership history does not prove one unique founder: its
`configurationManagerAccountId` remains unassigned. The application must not
repair that state from Membership order, `joinedAt`, invitation history,
Account creation time, or client ordering.

V1 recovery is an explicit one-time ServerAdmin operation:

- the Space must still have no configuration manager;
- the operator selects one Account that currently has an `ACTIVE` Membership
  in that same Space after out-of-band verification/consent;
- reconciliation locks the selected active Membership first and the Space row
  second, matching the existing tenant/offboarding lock order; the Membership
  lock closes the exit race and the Space lock serializes competing assignments;
- an already assigned manager is never replaced by this operation;
- the privileged action is recorded in the existing content-free ServerAdmin
  audit with actor, target Account and target Space identifiers;
- ordinary partner reads remain safe while authority is missing, but
  configuration writes continue to fail closed until reconciliation succeeds.

The same unassigned state is produced when the current configuration manager leaves the
Space: the exit clears the authority in the offboarding transaction, under the existing
Space lock. It is never transferred to the remaining partner by inference. The Space stays
readable and fails closed for configuration writes until the explicit reconciliation above
assigns an active member (account deletion already produces the same state through the
`SET NULL` foreign key).

This is legacy-state recovery, **not** a general configuration-manager transfer
feature. Any future transfer/consent UX requires its own product decision and
contract.

## 9. Demo contract

The canonical Demo Space receives explicit deterministic configuration rather than environment-dependent defaults.

For M7 reference/QA, the intended deterministic Demo configuration is:

```text
vibeCheckEnabled = true
energyCheckInEnabled = true
loveNotesEnabled = true
supportGesturesEnabled = true
sharedAchievementsEnabled = true
dailyQuestionsEnabled = true
dailyContextTimezone = Europe/Berlin
vibeVisibilityMode = IMMEDIATE
energyVisibilityMode = IMMEDIATE
```

This is seed/reference configuration only. It creates no synthetic user action, check-in, answer, note, support gesture or achievement by itself.

## 10. Enforcement boundaries

The Space configuration resource answers **what this Space has chosen to use**. It does not replace owning-domain authorization.

Each configurable module must enforce the matrix consistently at:
- entry/navigation/Today composition;
- ordinary read/projection boundaries where the matrix suppresses the active module surface;
- create and update API boundaries;
- delete/clear/data-right boundaries **without** letting a disabled-module guard remove an otherwise-authorized cleanup right;
- notification/event production where applicable;
- background scheduling/job execution where applicable;
- deep links/direct routes;
- reconnect/refetch after the configuration changes.

Reads, deletes, exports, retention, and cleanup of retained existing content follow the module-specific table plus the underlying Privacy/authorization contract. Space configuration never replaces those authorities.

There must not be a repository-wide scatter of `if feature_x` decisions with inconsistent semantics. Each owning domain consumes a shared effective-capability primitive that composes deployment capability, Entitlement, Space configuration and any required personal consent.

## 11. Acceptance consequences for future feature PRs

After #432 lands, every larger product feature PR must state:

1. its classification from section 2;
2. if Space-configurable, its typed field and default;
3. exact disable/re-enable behavior for read/create/update/delete;
4. job/notification behavior;
5. Entitlement composition;
6. OWNER_ONLY/privacy impact;
7. Demo default;
8. Web generated-client consumption;
9. Today/navigation/deep-link behavior where applicable.

A feature is not complete if it introduces a bespoke client flag, unregistered key, or second configuration/Entitlement authority.

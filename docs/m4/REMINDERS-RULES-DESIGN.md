# M4-C Reminders and Rules Design

**Status:** DECIDED for M4-C runtime  
**As of:** August 30, 2026  
**Owning readiness issue:** #277  
**Runtime changes in this document:** none

## Purpose

This document freezes the M4-C contract for:

- manual and source-generated Reminders;
- `ONCE`, `ANNUAL` and `RELATIONSHIP_DAY_COUNT` schedules;
- dedicated `ReminderOffset` rows;
- per-account Reminder preferences/muting;
- the controlled Rule catalog and `RulePreference`;
- timezone, daylight-saving and leap-day behavior;
- durable occurrence planning, retry and idempotency;
- the handoff from due Reminder occurrences to M4-B Notifications;
- the Free/Core versus future advanced-automation boundary.

M4-C is a deterministic scheduling/automation layer. It is not a general workflow engine, script runner, AI agent, push provider or notification subsystem.

## Product and privacy boundary

### Reminder scope in v1

The binding Reminder model is Space-scoped and has no owner-only visibility field. M4-C v1 therefore treats Reminder as **shared Space content**.

Consequences:

- active members of the same Space may read manual and generated Reminder definitions that belong to that Space;
- `createdBy` is provenance, not an owner-only authorization boundary;
- both active partners may create/update/delete manual shared Reminders, subject to normal optimistic concurrency/version rules;
- generated Reminders are not freely editable or deletable because their source/rule is authoritative;
- each Account may independently mute a Reminder through `ReminderPreference`;
- an owner-only/private Reminder class is deliberately **not** invented in M4-C v1.

A future personal/owner-only Reminder feature requires an explicit model/privacy decision and cannot be implemented by attaching a shared Reminder to `OWNER_ONLY` source content.

### Source privacy

M4-C v1 automatic Reminders use only shared/currently authorized source domains.

Allowed initial source classes:

- shared `ImportantDate`;
- shared `RelatedPerson` birthday;
- relationship start/anniversary information;
- shared `Plan` scheduled start.

Explicitly excluded as automatic Reminder sources in v1:

- PrivateNote;
- GiftIdea;
- PrivateCollection / PrivateCollectionItem;
- PRIVATE HeartMoment;
- any other `OWNER_ONLY` resource;
- Search results;
- Questions/Recaps;
- external provider/integration data.

No private source existence, date, identifier, count or scheduling metadata may influence partner-visible Reminder state or M4-B Notification state.

## Reminder classes

### Manual Reminder

A manual Reminder is explicitly created by an active Space member.

The user-controlled definition includes, conceptually:

```text
Reminder
- id
- spaceId
- title
- description?
- source = MANUAL
- createdBy
- createdAt
- updatedAt
- version
```

A manual Reminder owns one schedule definition and zero or more `ReminderOffset` rows.

Both active partners may edit/delete it because it is shared Space content. Concurrent writes use the repository's normal version/ETag conflict behavior.

### Generated Reminder

A generated Reminder is derived from a supported shared source plus a stable rule key.

Conceptually it carries:

```text
- source = GENERATED
- sourceType
- sourceId
- ruleKey
```

The source resource and Rule catalog remain authoritative.

Generated Reminders:

- are not freely editable as manual Reminders;
- are not independently deleted by one partner;
- may be muted per Account;
- are updated/recomputed when the source date/state changes;
- become inactive/removed when the source is deleted or no longer eligible;
- never copy owner-only/private source content;
- use stable rule/presentation kinds rather than treating a copied source title as authoritative data.

If a Rule is disabled for one Account, that Account receives no future occurrence delivery for that Rule, while another Account's enabled preference remains independent.

## ReminderPreference

`ReminderPreference` remains per Account + Reminder.

v1 field:

```text
muted: boolean
```

Rules:

- default is unmuted when no preference row exists;
- each Account can mutate only their own preference;
- muting suppresses only future delivery for that Account;
- muting does not delete the shared Reminder or the partner's preference/delivery;
- unmuting recomputes only future eligible occurrences; it does not replay every historical missed occurrence;
- a preference cannot grant visibility to a Reminder in another Space.

## Schedule model

A Reminder has exactly one active schedule definition in v1.

Supported types are binding:

```text
ONCE
ANNUAL
RELATIONSHIP_DAY_COUNT
```

Schedule parameters are typed fields/JSON with schema validation, not arbitrary expressions.

### ONCE

Canonical parameters:

```text
at: RFC3339 offset-aware timestamp
```

Semantics:

- `at` is normalized and persisted as a UTC instant;
- it represents one absolute target instant;
- later Account/device timezone changes do not move the target instant;
- offsets are subtracted as exact 24-hour day durations from that instant;
- a past `at` value is rejected on creation unless a later explicit migration/import contract says otherwise.

The client may help the user choose the instant in local time, but the server receives an offset-aware timestamp and remains authoritative.

### ANNUAL

Canonical parameters:

```text
month: 1..12
day: valid calendar day for the selected month
localTime: HH:MM[:SS]
```

Semantics:

- the schedule defines a recurring calendar month/day and local wall-clock time;
- each recipient occurrence is resolved in that recipient Account's current configured IANA timezone;
- the device timezone is never authoritative;
- future undelivered occurrences are recomputed when the Account timezone changes;
- offsets are applied as calendar days before the target date, then `localTime` is resolved in the Account timezone.

This allows two partners living/travelling in different configured timezones to receive a shared annual Reminder at the intended local wall-clock time rather than forcing one partner to inherit the other partner's device timezone.

#### February 29

For an `ANNUAL` schedule on February 29, a non-leap year resolves to **February 28**.

This rule is explicit and deterministic; clients must not choose a different fallback locally.

### RELATIONSHIP_DAY_COUNT

Canonical parameters:

```text
dayCount: integer >= 1
localTime: HH:MM[:SS]
```

Semantics:

- relationship day 1 is the configured relationship start calendar date;
- target date = `relationshipStartDate + (dayCount - 1) calendar days`;
- the schedule has one logical target for the current relationship-start value, not an annual recurrence;
- each recipient resolves `localTime` in their current configured Account timezone;
- offsets are calendar days before the target date;
- if no relationship start date exists, the schedule cannot produce an occurrence;
- changing the relationship start date invalidates/recomputes every still-pending `RELATIONSHIP_DAY_COUNT` occurrence;
- already delivered historical Notifications are not rewritten.

`dayCount` must be bounded by the final API validation contract to a value representable by the supported date range; no arbitrary commercial quota is introduced.

## Timezone and DST rules

### Authority

- Account-configured IANA timezone is authoritative for `ANNUAL` and `RELATIONSHIP_DAY_COUNT` recipient delivery.
- Device timezone is presentation/input assistance only.
- `ONCE` is an absolute instant and does not move with timezone changes.
- server/database clocks are authoritative for whether an occurrence is due.

### Nonexistent local time (DST spring-forward gap)

If `localTime` falls inside a timezone gap, resolve it by shifting forward by the size of the gap while preserving the intended minutes/seconds where possible.

Example for a one-hour gap:

```text
02:30 -> 03:30
```

### Ambiguous local time (DST fall-back overlap)

If a local time occurs twice, use the **earlier instant / earlier offset occurrence**.

The choice is deterministic and server-side.

### Timezone changes

When an Account timezone changes:

- future undelivered `ANNUAL` and `RELATIONSHIP_DAY_COUNT` recipient occurrences are invalidated and recomputed;
- `ONCE` occurrences keep their absolute due instants;
- stale already-enqueued jobs must no-op after loading the superseded occurrence state.

## ReminderOffset

Offsets remain dedicated rows and are never stored as CSV/text lists.

Canonical v1 field:

```text
daysBefore: integer
```

Rules:

- allowed range: `0..365`;
- `0` means at the target occurrence;
- negative/after-event offsets are not supported in v1;
- duplicate values for one Reminder are canonicalized/rejected by a uniqueness rule;
- API output order is ascending by `daysBefore` for stable client behavior;
- changing offsets invalidates only future pending occurrences and recomputes them;
- technical validation is not a Premium quota.

For `ANNUAL` and `RELATIONSHIP_DAY_COUNT`, `daysBefore` means calendar days before the target calendar date before local-time timezone resolution.

For `ONCE`, `daysBefore` means exact multiples of 24 hours before the absolute target instant.

## Rule engine boundary

M4-C uses a versioned controlled catalog:

```text
trigger + typed conditions + deterministic action
```

It does **not** support:

- arbitrary scripts;
- arbitrary SQL;
- user-defined executable expressions;
- remote code/hooks as Rule actions;
- an AI requirement;
- a general-purpose workflow DAG engine.

### Rule catalog

The application owns the catalog in versioned code/documentation.

Each Rule definition has conceptually:

```text
ruleKey
catalogVersion
sourceType
trigger semantics
parameter schema
default parameters
action kind
```

`ruleKey` is a stable machine identifier and must not be reused for incompatible semantics.

If semantics must change incompatibly, introduce a new rule key or an explicit catalog migration.

### RulePreference

`RulePreference` remains per Account + Space + `ruleKey`:

```text
enabled: boolean
parameters: typed JSON object
```

Rules:

- each Account controls only their own preference;
- absence uses the catalog default enabled state/parameters;
- parameter validation is server-side against that rule's schema;
- disabling a rule invalidates future pending delivery occurrences for that Account;
- re-enabling plans only future eligible occurrences; it does not replay unbounded history;
- a rule preference in one Space cannot affect another Space.

## Initial M4-C rule catalog

The v1 catalog is intentionally small and uses existing stable Domain data only.

| ruleKey | Source | Trigger / generated Reminder | Default `daysBefore` | Classification |
|---|---|---|---:|---|
| `important_date_reminder` | shared ImportantDate | next annual occurrence | `[7, 1]` | Free/Core |
| `related_person_birthday_reminder` | shared RelatedPerson with birthday | next birthday | `[14, 7, 1]` | Free/Core |
| `relationship_anniversary_reminder` | configured relationship start date | next anniversary | `[30, 7, 1]` | Free/Core |
| `plan_start_reminder` | shared PLANNED Plan with scheduled start | Plan start | `[1, 0]` | Free/Core |

Default local delivery time for calendar-only source dates is **09:00** in the recipient Account's configured timezone unless the source already contains an authoritative scheduled instant/time.

Rule parameters may allow the Account to choose a different permitted `daysBefore` set and local delivery time within the final API validation contract.

No Question, Recap, private GiftIdea/PrivateNote, external integration or AI rule is pulled into M4-C merely to expand the catalog.

`RELATIONSHIP_DAY_COUNT` remains available for manual Reminders in v1. Automatic catalog templates such as 100/500/1000-day celebrations require a later explicit product decision rather than silently creating notifications.

## Generated Reminder reconciliation

Generated Reminder identity is stable for its logical source and rule.

Conceptual uniqueness:

```text
spaceId + sourceType + sourceId + ruleKey
```

Reconciliation is idempotent:

- eligible source appears/changes -> create or update the generated Reminder definition;
- source date changes -> recompute schedule and pending occurrences;
- source becomes ineligible/deleted -> deactivate/remove generated Reminder and cancel pending occurrences;
- repeated source events -> no duplicate logical Reminder;
- RulePreference changes affect only the corresponding Account's future delivery eligibility.

The exact storage constraint may encode this identity differently, but the logical result is binding.

## Durable occurrence model

M4-C introduces a small technical `ReminderOccurrence`/equivalent ledger as `SYSTEM_METADATA` so retryable jobs can produce idempotent user-visible effects.

Conceptual fields:

```text
ReminderOccurrence
- id
- reminderId
- recipientAccountId
- occurrenceKey
- daysBefore
- dueAt
- state
- generation
- createdAt
- deliveredAt?
```

The ledger contains schedule/delivery metadata only. It does not copy Reminder descriptions or source ProtectedPayload.

Logical uniqueness:

```text
reminderId + recipientAccountId + occurrenceKey + daysBefore
```

`occurrenceKey` is server-derived from the logical target occurrence, not from the client clock.

### Generation / stale-work protection

Schedule/source/timezone/preference changes may invalidate a previously planned job.

A pending occurrence therefore has a current generation/state. Jobs reference the occurrence row, not authoritative copied schedule data.

At execution, the worker reloads the row and no-ops if it is:

- cancelled;
- superseded;
- already delivered;
- no longer authorized/eligible;
- no longer due under the current schedule generation.

This makes queued stale jobs harmless after edits, timezone changes or source deletion.

## Scheduling strategy

M4-C reuses the existing PostgreSQL Job Queue. It does not pre-generate an unbounded future calendar.

### Next-occurrence planning

On a transaction that changes a Reminder, source, RulePreference, ReminderPreference, Account timezone or relationship start date:

1. determine affected recipient(s);
2. cancel/supersede future pending occurrence rows as needed;
3. compute the next eligible logical target(s);
4. create only the next required occurrence per configured offset/recipient;
5. enqueue/refresh a Job with `run_after = dueAt` using the existing transactional queue path.

After a recurring occurrence is handled, compute and plan the next recurrence.

This bounds durable future work to the next occurrence horizon instead of materializing years of jobs.

### Reconciliation

A bounded periodic/startup reconciliation path must recover from:

- worker/application downtime;
- backup restore;
- missed enqueue after older application versions;
- stale pending jobs;
- interrupted upgrade.

Reconciliation computes from authoritative Reminder/source/preferences and uses occurrence uniqueness, so repeated runs are safe.

A new distributed scheduler, Redis, Celery, Quartz-like service or workflow engine is not required.

## Due and missed occurrence behavior

When a due job is claimed:

- server time decides due state;
- current Space Membership, Reminder existence, source eligibility, ReminderPreference and RulePreference are rechecked;
- stale/cancelled work no-ops;
- a valid due occurrence emits the M4-C -> M4-B handoff once logically;
- the occurrence is marked delivered only through an idempotent transaction/effect boundary.

### Downtime catch-up

If the service was offline at `dueAt`, reconciliation may deliver an occurrence only within a **24-hour catch-up window** after `dueAt`.

Older missed occurrences are marked expired/skipped rather than creating a burst of stale notifications after a long outage or restore.

This is a reliability/UX safeguard, not data deletion: the Reminder definition remains intact and future recurrences continue.

## M4-C -> M4-B handoff

M4-C owns **when** an occurrence is due. M4-B owns user-visible Notification/read state and PushDelivery.

The provider-neutral handoff is a content-minimized due fact, conceptually:

```text
REMINDER_DUE
- occurrenceId
- reminderId
- spaceId
- recipientAccountId
- ruleKey? / source kind where needed for stable presentation
- dueAt
```

It must not contain Reminder description text or copied source ProtectedPayload.

M4-B then creates the recipient Notification using its existing idempotency and privacy rules and may optionally deliver Push.

M4-C must not introduce a second Notification table, push provider stack or lock-screen preview policy.

Runtime dependency:

- M4-C-S1 Reminder Domain/API can be implemented independently after this S0 merge;
- M4-C delivery integration cannot be considered complete until the required M4-B in-app Notification foundation exists.

## API contract summary

Later runtime slices publish concrete OpenAPI definitions consistent with these contract-level routes.

### Reminders

```text
GET    /api/v1/spaces/{spaceId}/reminders
POST   /api/v1/spaces/{spaceId}/reminders
GET    /api/v1/spaces/{spaceId}/reminders/{reminderId}
PUT    /api/v1/spaces/{spaceId}/reminders/{reminderId}
DELETE /api/v1/spaces/{spaceId}/reminders/{reminderId}
PUT    /api/v1/spaces/{spaceId}/reminders/{reminderId}/preference
```

Rules:

- create/update/delete applies to manual Reminders only where mutation is allowed;
- generated Reminders expose source/rule metadata but reject manual-content/schedule mutation;
- preference mutation applies only to the authenticated Account;
- list/read responses include typed schedule/offset data and a server-derived next occurrence where useful;
- APIs return typed dates/instants, not localized prose;
- current authorization is always re-evaluated.

### Rules

```text
GET /api/v1/spaces/{spaceId}/rules
GET /api/v1/spaces/{spaceId}/rules/{ruleKey}/preference
PUT /api/v1/spaces/{spaceId}/rules/{ruleKey}/preference
```

The catalog response exposes stable machine keys, parameter schemas/defaults in API-safe form and current Account preference state. Clients localize human-facing names/descriptions through i18n keys.

## Concurrency

Manual Reminder writes use the existing optimistic version/ETag contract.

Additional required concurrency semantics:

- source-event replay cannot create duplicate generated Reminders;
- concurrent reconciliation cannot create duplicate occurrences;
- preference disable racing a due worker must result in at most one allowed effect and must not deliver after the disable transaction wins before the delivery authorization check;
- source deletion/privacy/eligibility change racing due delivery must be rechecked before M4-B handoff;
- timezone change racing planning cannot leave an old-generation occurrence deliverable;
- multiple workers use existing `FOR UPDATE SKIP LOCKED` job claims and occurrence uniqueness.

The system promises idempotent logical effects where it controls the boundary. It does not claim transport-level exactly-once Push.

## Data lifecycle

- deleting a manual Reminder cascades/cancels its pending occurrence metadata and per-Reminder preferences;
- deleting/inactivating a generated source removes/deactivates the generated Reminder and pending occurrences;
- historical already-created M4-B Notifications follow M4-B lifecycle/privacy rules and are not rewritten into a new Reminder history table;
- Space/account deletion removes dependent Reminder/Rule/occurrence state according to the existing lifecycle contract;
- `ReminderOccurrence` is technical scheduling metadata and is excluded from user-facing export as an independent Domain object, while Reminder/RulePreference user-owned configuration follows normal export/data-rights rules.

No hidden Cloud-only Reminder retention policy is introduced by M4-C.

## Logging and observability

Allowed aggregate operational metrics:

- planned occurrence count;
- due/expired/cancelled counts by schedule/rule kind;
- scheduling latency;
- worker retry count;
- reconciliation duration/failure count.

Forbidden log/metric content includes:

- Reminder title/description;
- RelatedPerson names;
- ImportantDate labels;
- source ProtectedPayload;
- partner-private identifiers;
- occurrence/resource IDs as high-cardinality metric labels.

Errors use bounded stable reason codes rather than dumping raw payloads.

## Business / freemium classification

M4-C promotes these v1 classifications:

| Capability | Classification | Rationale |
|---|---|---|
| Manual shared Reminders | **Free/Core** | Basic remembering/planning is ordinary couple utility, not advanced automation. |
| Basic ImportantDate/birthday/anniversary/Plan reminders | **Free/Core** | Core date-aware reminders use existing relationship data and keep the free product meaningful. |
| Initial deterministic Rule catalog | **Free/Core** | The small controlled rule set is the baseline reminder experience. |
| Per-account mute and core RulePreference parameters | **Free/Core** | Basic control over notifications must not require Premium. |
| Advanced multi-condition/multi-step rules, templates, sophisticated automation or external-trigger rules | **Future Mixed/Premium candidate** | Additional automation depth may provide Premium differentiation and maintenance/integration cost. |

M4-C does not add entitlement checks. M6/#262 remains the runtime entitlement/billing boundary under ADR 0006.

Technical limits such as schedule validation, offset bounds, retry windows and API page sizes are safety/correctness constraints, not commercial quotas.

## Reuse-before-build decision

Reuse review is **relevant**.

Reuse:

- existing PostgreSQL Job Queue;
- existing `run_after`, lease recovery, `FOR UPDATE SKIP LOCKED`, max-attempt and exponential-backoff semantics;
- existing transactional enqueue behavior;
- existing transactional Outbox for safe domain-to-projection handoff;
- existing Account IANA timezone field;
- existing clock abstraction;
- existing optimistic concurrency/version patterns.

Do not add in M4-C v1 without a new explicit decision:

- Redis/Celery;
- Quartz-like external scheduler;
- Kafka/RabbitMQ;
- a general workflow engine;
- a custom expression language;
- executable user scripts;
- an AI scheduling dependency.

A small eimir.-specific Reminder occurrence ledger and controlled Rule catalog are application Domain/metadata that cannot be replaced by a generic queue package without losing the required semantics.

## Runtime delivery sequence

After this S0 package merges:

1. **M4-C-S1 — Reminder Domain + Schedule API**
   - Reminder/Schedule/Offset/Preference persistence;
   - shared/manual/generated invariants;
   - `ONCE`/`ANNUAL`/`RELATIONSHIP_DAY_COUNT` evaluation;
   - timezone/DST/leap-day behavior;
   - manual Reminder CRUD/preference APIs;
   - OpenAPI/generated clients;
   - PostgreSQL/HTTP/privacy/time tests.
2. **M4-C-S2 — Rule Catalog + Occurrence Planner + M4-B Handoff**
   - controlled Rule catalog and RulePreference API;
   - source reconciliation/generated Reminders;
   - durable occurrence ledger;
   - Job Queue planning/reconciliation/retry;
   - 24-hour catch-up behavior;
   - content-minimized `REMINDER_DUE` handoff to M4-B Notification foundation;
   - concurrency/idempotency evidence.
3. **M4-C-S3 — integrated M4-C evidence**
   - Cross-Tenant/privacy/source transitions;
   - timezone/DST/leap-day matrix;
   - restart/restore/stale-job reconciliation;
   - duplicate worker/source-event races;
   - M4-B Notification integration;
   - business/freemium consistency;
   - OpenAPI/generated-client consistency;
   - representative performance/query evidence;
   - normal CI/CodeQL/Supply Chain/Self-Hosted gates and status sync.

Full Web/Android screen productization, offline Read Cache and systematic parity remain M5.

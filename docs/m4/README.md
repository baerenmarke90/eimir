# M4 Technical Readiness Package

**Status:** complete — M4-A, M4-B and M4-C runtime plus integrated evidence delivered
**As of:** August 30, 2026  
**M4-A tracking:** #272  
**M4-B tracking:** #276  
**M4-C tracking:** #277

M4 — Engage follows M3/G3 and remains split into separate risk classes:

- **M4-A:** Search + Dashboard Read Models;
- **M4-B:** Activity + Notifications;
- **M4-C:** Reminders + Rules.

All three M4 risk classes have their frozen S0 contracts and delivered runtime. Search/Dashboard, Activity/Notifications/Thinking-of-you/PushDelivery, and Reminders/Rules/occurrence planning are complete for the M4 scope. Integrated runtime evidence and the final migration chain are indexed in [M4-EVIDENCE.md](./M4-EVIDENCE.md). Full client productization remains M5 and G4 is not implied by M4 completion.

## Binding sources and precedence

If sources conflict, use this order:

1. `specification/CLEAN-ROOM-MASTER-SPEC.md`;
2. `specification/PRODUCT-SPEC.md`;
3. `docs/SECURITY.md` and existing authorization/privacy invariants;
4. `docs/REUSE-BEFORE-BUILD.md`;
5. `docs/CROSS-CUTTING-QUALITY.md`;
6. `docs/BUSINESS-MODEL.md` and `docs/FREEMIUM-FEATURE-MATRIX.md`;
7. published OpenAPI contract;
8. explicitly `DECIDED` M4 documents in this package.

No M4 decision may weaken Clean-Room separation, Tenant Isolation, `OWNER_ONLY` protection, authorization, data rights, or existing security gates.

# M4-A — Search + Dashboard

## Search

Version 1 uses PostgreSQL Full Text Search behind an application-facing Search abstraction. Elasticsearch/OpenSearch is not required. Search authorization happens in SQL/service selection before any result DTO exists.

The initial searchable surface is:

- Memory;
- HeartMoment, including the caller's own private HeartMoments but never a partner's private HeartMoments;
- Milestone;
- Wish;
- Plan;
- Place;
- Chapter;
- shared Collection and CollectionItem;
- the caller's PrivateNote;
- the caller's GiftIdea;
- the caller's PrivateCollection and PrivateCollectionItem.

Questions remain M7 Relationship Depth. Comments, Profiles, RelatedPersons and ImportantDates are deliberately not part of the first global Search contract.

Detailed contract: [Search Design](./SEARCH-DESIGN.md).

## Dashboard

Dashboard is a derived Read Model. There is no `dashboard` table, copied Domain payload, or separate persisted dashboard truth.

The first M4-A Dashboard derives only data whose owning Domain already exists:

- Space/partner summary;
- optional relationship duration;
- deterministic basic retrospective (`Weißt du noch?`) from authorized shared history;
- upcoming scheduled Plans and date-based relationship items;
- recent shared root content.

`Ich denke an dich` is not faked by M4-A. M4-B owns its runtime contract. Activity/Notification/Reminder/Rule data remains absent until its owning M4 slice delivers it. Questions/Year Summary remain M7 Relationship Depth.

Detailed contract: [Dashboard Design](./DASHBOARD-DESIGN.md).

## M4-A privacy rule

M4-A Read Models are authorization-first, not projection-first.

For Search:

- shared results require active Membership and matching `space_id`;
- owner-only rows require `owner_id == current_account_id` in SQL/authorized joins;
- partner-private rows do not enter ranking, pagination, counts, excerpts or cursor positions.

For Dashboard:

- only shared relationship data enters the shared Dashboard;
- owner-only data is excluded even for its owner;
- no private counts, timestamps, existence flags or indirect metadata are projected.

Detailed evidence contract: [M4-A Privacy and Test Matrix](./PRIVACY-TEST-MATRIX.md).

# M4-B — Activity + Notifications

M4-B keeps four concepts separate:

```text
OutboxEvent   = internal transactional integration fact
Activity      = user-visible shared Space event
Notification  = recipient-specific state
PushDelivery  = technical delivery attempt/channel
```

Detailed contract: [Activity and Notification Design](./ACTIVITY-NOTIFICATIONS-DESIGN.md).
The later #515 delivery-class foundation is tracked in
[Notification Delivery Policy](./NOTIFICATION-DELIVERY-POLICY.md); digest, Quiet
Hours and per-account channel preferences are not part of the M4-B baseline.

## Activity

Activity is a persisted, minimized asynchronous projection of a controlled set of committed safe Outbox facts.

The initial feed includes only selected shared meaningful events such as creation of Memory/Milestone/SHARED HeartMoment/Wish/Plan/Place/Chapter/Collection, Plan completion and Comment creation.

It deliberately excludes:

- `OWNER_ONLY` events;
- ordinary edits/reorders/item toggles;
- Auth/Audit/Job/Outbox/Attachment-processing internals;
- worker/provider attempts;
- `Ich denke an dich` in v1.

Activity stores stable kinds/references, not copied ProtectedPayload plaintext. Current target authorization is re-evaluated before projection.

## Notifications

Notification is Account+Space recipient state with server-authored read/unread status.

- recipients are derived server-side;
- a Notification never grants target access;
- stale/deleted/newly-private targets cannot continue to leak through rows or unread counts;
- mark-one-read is idempotent;
- mark-all-read uses a server transaction cutoff so newer Notifications stay unread;
- Notification persistence stores safe references/kinds, not copied relationship plaintext.

## `Ich denke an dich`

M4-B owns the v1 content-free partner nudge.

- no free-text payload;
- no separate durable content object;
- recipient derived from the other active Space Membership;
- caller-generated `clientRequestId` provides retry idempotency;
- one new logical send per sender/Space per rolling 30 minutes (product cooldown, #790/#791), plus normal rate limiting; state is server-authoritative and exposed via `Dashboard.thinkingOfYouAvailableAt`;
- creates recipient Notification and optional PushDelivery;
- does not create Activity feed noise in v1.

## Push

Push is optional delivery for an existing Notification through a provider-neutral adapter.

Default push/lock-screen presentation contains no protected relationship plaintext. Rich previews require a later explicit opt-in privacy decision.

Self-Hosted without configured push remains fully functional for Activity, in-app Notifications/read state and in-app `Ich denke an dich` delivery.

Detailed evidence contract: [M4-B Activity and Notification Privacy/Test Matrix](./ACTIVITY-NOTIFICATIONS-PRIVACY-TEST-MATRIX.md).

# M4-C — Reminders + Rules

M4-C defines deterministic shared Reminders, per-account preferences, a controlled Rule catalog and durable retry-safe occurrence scheduling.

Detailed contract: [Reminders and Rules Design](./REMINDERS-RULES-DESIGN.md).

## Reminder privacy/scope

Reminder is shared Space content in v1.

- `createdBy` records provenance, not owner-only authorization;
- both active partners may collaborate on manual shared Reminders;
- generated Reminders are source/rule-owned and are not freely editable/deletable;
- each Account can mute independently through `ReminderPreference`;
- private/owner-only Reminder semantics are deliberately deferred rather than simulated through shared rows;
- automatic v1 Reminder sources are shared ImportantDates, shared RelatedPerson birthdays, relationship start/anniversary data and shared scheduled Plans;
- GiftIdeas, PrivateNotes, private collections, PRIVATE HeartMoments and other `OWNER_ONLY` sources never generate shared Reminder/delivery metadata.

## Schedule types

### `ONCE`

- one future RFC3339 offset-aware timestamp;
- normalized to an absolute UTC instant;
- timezone changes do not move it;
- day offsets are exact 24-hour durations.

### `ANNUAL`

- month/day/local wall-clock time;
- each recipient resolves using their current configured Account IANA timezone;
- device timezone is not authoritative;
- day offsets are calendar days before timezone resolution;
- February 29 falls back to February 28 in non-leap years.

### `RELATIONSHIP_DAY_COUNT`

- relationship day 1 is the relationship start date;
- target = start + (`dayCount - 1`) calendar days;
- recipient local time uses Account timezone;
- missing relationship start produces no occurrence;
- relationship-start changes recompute future pending occurrences.

## DST/timezone behavior

For calendar-based schedules:

- a nonexistent local time in a DST gap shifts forward by the exact gap;
- an ambiguous/repeated local time chooses the earlier instant/offset;
- Account timezone changes recompute undelivered calendar-based occurrences;
- stale already-enqueued jobs no-op through occurrence generation/state checks;
- server/domain time remains authoritative for due delivery.

## Offsets

`ReminderOffset.daysBefore` remains a dedicated integer row:

- range `0..365`;
- `0` means at target occurrence;
- no negative/after-event offsets in v1;
- duplicate offsets are prevented/canonicalized;
- technical bounds are not commercial quotas.

## Rules

M4-C uses a controlled versioned catalog:

```text
trigger + typed conditions + deterministic action
```

It does not introduce arbitrary scripts, SQL, executable user expressions, a general workflow engine or an AI requirement.

Initial Free/Core catalog:

- `important_date_reminder` — default `[7, 1]` days before;
- `related_person_birthday_reminder` — `[14, 7, 1]`;
- `relationship_anniversary_reminder` — `[30, 7, 1]`;
- `plan_start_reminder` — `[1, 0]`.

Calendar-only sources default to 09:00 in the recipient Account timezone unless the source has an authoritative time.

`RulePreference` is per Account+Space+ruleKey. One partner disabling a rule does not change the other's preference.

## Scheduling and retry

M4-C reuses the existing PostgreSQL Job Queue and Outbox.

A small content-free `ReminderOccurrence`/equivalent system-metadata ledger provides logical identity and stale-work protection.

- plan only the next required occurrence per recipient/offset;
- use Job Queue `run_after` for due work;
- after recurring delivery, plan the next recurrence;
- bounded repeatable startup/periodic reconciliation recovers from downtime/restore/stale jobs;
- schedule/source/timezone/preference changes supersede old pending occurrence generations;
- worker retry cannot create duplicate logical user-visible effects;
- missed due work may be caught up for 24 hours; older missed occurrences expire without a stale notification burst.

## M4-C -> M4-B boundary

M4-C owns **when** a Reminder occurrence is due. M4-B owns Notification/read state and PushDelivery.

M4-C emits a minimized `REMINDER_DUE` logical handoff containing safe identifiers/schedule metadata only. It does not build a second Notification or push subsystem.

Detailed evidence contract: [M4-C Reminders/Rules Privacy/Time/Test Matrix](./REMINDERS-RULES-PRIVACY-TIME-TEST-MATRIX.md).

# Reuse-before-build results

Reuse review is relevant for all current M4 risk classes where platform capability is involved.

## M4-A

Selected:

- PostgreSQL built-in Full Text Search;
- existing signed cursor infrastructure.

Rejected for v1:

- Elasticsearch/OpenSearch;
- custom search/index service;
- unindexed `ILIKE` as primary global Search.

## M4-B

Selected/reused:

- transactional Outbox;
- minimized safe event payload boundary;
- PostgreSQL Job Queue;
- `FOR UPDATE SKIP LOCKED` lease behavior;
- retry/exponential backoff;
- content-free COMMENT_CREATED notification hook pattern.

## M4-C

Selected/reused:

- PostgreSQL Job Queue `run_after`/lease/retry behavior;
- transactional Outbox;
- Account IANA timezone field;
- existing clock abstraction;
- optimistic concurrency/version patterns.

Not introduced by M4-B/M4-C:

- Redis/Celery;
- Kafka/RabbitMQ;
- Quartz-like scheduler;
- another event store/message broker;
- general workflow engine;
- custom executable rule language;
- AI scheduling dependency.

# Business / freemium results

M4 currently promotes these v1 classifications:

- basic global Search: **Free/Core**;
- basic relationship Dashboard: **Free/Core**;
- basic shared Activity: **Free/Core**;
- basic in-app Notifications/read state: **Free/Core**;
- basic `Ich denke an dich`: **Free/Core**;
- basic push capability when infrastructure is configured: **Free/Core capability**;
- manual shared Reminders: **Free/Core**;
- core ImportantDate/birthday/anniversary/Plan reminders: **Free/Core**;
- initial deterministic Rule catalog and basic per-account controls: **Free/Core**.

Potential future Mixed/Premium extensions remain separate decisions, including semantic/AI Search, advanced analytical views, notification digests/routing, richer preview customization and advanced multi-condition/multi-step/external-trigger automation.

M4 introduces no Premium entitlement runtime. M6/#262 remains the entitlement/billing implementation boundary under ADR 0006.

# Definitions of Ready

## M4-A runtime

- [x] M3 complete and G3 passed;
- [x] all M4-A blocking decisions `DECIDED`;
- [x] Search privacy/query/ranking/cursor/index semantics fixed;
- [x] Dashboard sections/ordering/time/privacy semantics fixed;
- [x] PostgreSQL FTS reuse decision traceable;
- [x] Search and Dashboard confirmed Free/Core;
- [x] required negative/privacy/performance evidence specified;
- [ ] each runtime slice publishes its concrete OpenAPI contract;
- [ ] each runtime slice passes normal CI/security/reuse/business/cross-cutting gates.

## M4-B runtime

- [x] model split fixed;
- [x] Activity event catalog/exclusions fixed;
- [x] privacy-transition semantics fixed;
- [x] read/unread/count semantics fixed;
- [x] `Ich denke an dich` semantics fixed;
- [x] push privacy/Self-Hosted behavior fixed;
- [x] Outbox/Job reuse selected;
- [x] Free/Core classification fixed;
- [x] mandatory evidence specified;
- [ ] each runtime slice publishes its concrete OpenAPI contract;
- [ ] each runtime slice passes normal repository gates.

## M4-C runtime

- [x] shared/manual/generated Reminder ownership semantics fixed;
- [x] all schedule parameter/time semantics fixed;
- [x] DST/timezone/leap-day behavior fixed;
- [x] offset rules fixed;
- [x] private-source non-generation fixed;
- [x] Rule catalog/RulePreference contract fixed;
- [x] occurrence/job/reconciliation/idempotency model fixed;
- [x] M4-B handoff fixed;
- [x] Free/Core vs future advanced-automation boundary fixed;
- [x] mandatory privacy/time/concurrency evidence specified;
- [ ] each runtime slice publishes its concrete OpenAPI contract;
- [ ] each runtime slice passes normal repository gates.

# Runtime sequence

See [Delivery Plan](./DELIVERY-PLAN.md).

Defined runtime slices now include:

1. M4-A-S1 Search Foundation;
2. M4-A-S2 Dashboard Read Model;
3. M4-A-S3 integrated evidence;
4. M4-B-S1 Activity + in-app Notification foundation;
5. M4-B-S2 `Ich denke an dich` + PushDelivery boundary;
6. M4-B-S3 integrated evidence;
7. M4-C-S1 Reminder Domain + Schedule API;
8. M4-C-S2 Rule Catalog + Occurrence Planner + M4-B handoff;
9. M4-C-S3 integrated evidence.

Runtime order may use safe parallelism only when migration/router/OpenAPI/generated-client surfaces do not conflict and dependencies are respected. In particular, M4-C-S2 user-visible delivery must integrate with the M4-B Notification foundation rather than create a parallel stack.

# Deliberately not pulled forward

- full Web/Android productization, Offline Read Cache and systematic parity — M5;
- Questions and Recaps — M7 Relationship Depth;
- semantic/AI Search — later explicit scope;
- private/owner-only Reminder semantics — later explicit model/privacy decision;
- external-trigger/general-purpose automation — later explicit scope;
- real E2EE — MX;
- Premium entitlement runtime — M6/#262.

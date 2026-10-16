# M4 Delivery Plan

**Status:** complete — all M4 runtime slices and cumulative S3 evidence delivered
**As of:** August 30, 2026  
**M4-A readiness:** #272  
**M4-B readiness:** #276  
**M4-C readiness:** #277

This plan sequences M4 after G3 while keeping Search/Dashboard, Activity/Notifications and Reminders/Rules in separate risk classes.

# M4-A — Search + Dashboard

## M4-A sequence

```text
S0 Readiness / Contract (#272)
        |
        +--> S1 Search Foundation (#274)
        |       |
        |       +--> PostgreSQL FTS expressions + GIN indexes
        |       +--> Search abstraction/repository
        |       +--> /search API + OpenAPI
        |       +--> privacy/cursor/integration evidence
        |
        +--> S2 Dashboard Read Model
        |       |
        |       +--> shared-only projections
        |       +--> relationship duration
        |       +--> retrospective
        |       +--> upcoming
        |       +--> recent shared
        |       +--> /dashboard API + OpenAPI
        |
        +--> S3 Integrated M4-A evidence
                |
                +--> generated client parity check
                +--> cross-target privacy regression set
                +--> performance/query evidence
                +--> status synchronization
```

S1 and S2 may be implemented sequentially from the same S0 contract. They should not be combined into one oversized runtime PR merely because both are read models.

## M4-A-S0 — readiness and contracts

**Owner:** #272  
**Runtime changes:** none  
**Status:** delivered

Deliverables:

- M4 package/precedence;
- complete M4-A blocking Decision Log;
- Search design;
- Dashboard design;
- M4-A Privacy/Test Matrix;
- runtime delivery sequence;
- Reuse-before-build and business/freemium decisions.

## M4-A-S1 — Search Foundation

**Owner:** #274  
**Runtime PR:** #275 at the time of the M4-C readiness decision

Scope:

- per-target PostgreSQL FTS expression indexes/migration;
- application Search abstraction and PostgreSQL implementation;
- authorized multi-target query;
- owner-only/private branches;
- Search DTOs and `/api/v1/spaces/{spaceId}/search`;
- signed Account+Space+query+filter-bound keyset cursor;
- OpenAPI and generated TypeScript/Kotlin clients;
- unit/PostgreSQL/HTTP privacy tests from `PRIVACY-TEST-MATRIX.md`;
- representative query-plan/index evidence.

Explicitly out:

- Dashboard;
- semantic/vector/AI Search;
- external Search service;
- persistent client Search cache;
- full Search client UI.

Business classification:

- basic Search = Free/Core.

Reuse result:

- PostgreSQL built-in FTS + existing signed cursor infrastructure;
- no new search daemon/provider/dependency unless a new explicit decision supersedes S0.

## M4-A-S2 — Dashboard Read Model

Create a dedicated issue after/around S1 only when contract/client overlap is coordinated.

Scope:

- shared-only Dashboard service/read repository;
- Space/partner summary;
- optional relationship duration;
- basic exact-date retrospective;
- upcoming Plans/ImportantDates/birthdays/anniversary;
- recent shared root items;
- `/api/v1/spaces/{spaceId}/dashboard`;
- OpenAPI and regenerated clients;
- privacy/indirect-leakage tests;
- bounded query-count/performance evidence.

Explicitly out:

- Activity;
- Notifications;
- Reminder-derived cards;
- `Ich denke an dich` runtime;
- Rules/Suggestions;
- Questions/Recaps;
- full Dashboard UI productization.

Business classification:

- basic Dashboard = Free/Core.

## M4-A-S3 — integrated evidence and status sync

**Status:** delivered cumulatively; see [M4-EVIDENCE.md](./M4-EVIDENCE.md).

Goal:

Prove Search and Dashboard together do not introduce a cross-domain privacy/read-model regression.

Evidence includes at minimum:

- real HTTP + PostgreSQL Search across representative shared/private targets;
- partner-private Search non-generation;
- Account-bound cursor replay rejection;
- Search update/delete/privacy-transition consistency;
- Dashboard owner-only non-influence;
- deterministic retrospective/upcoming/recent behavior;
- published OpenAPI and generated-client consistency;
- representative performance/query evidence;
- current normal CI/CodeQL/Supply Chain/Self-Hosted gates.

S3 is evidence/status work, not a feature-expansion opportunity.

---

# M4-B — Activity + Notifications

M4-B readiness was delivered through #276/#278.

Binding design:

- `ACTIVITY-NOTIFICATIONS-DESIGN.md`;
- `ACTIVITY-NOTIFICATIONS-PRIVACY-TEST-MATRIX.md`;
- `DECISION-LOG.md` M4-D31 through M4-D46.

## M4-B sequence

```text
S0 Readiness / Contract (#276) ✓
        |
        +--> S1 Activity + in-app Notification Foundation
        |       |
        |       +--> Activity/Notification persistence
        |       +--> safe Outbox projector
        |       +--> controlled event catalog
        |       +--> Activity/Notification APIs
        |       +--> read/unread + unread count
        |       +--> OpenAPI/generated clients
        |
        +--> S2 Thinking-of-you + PushDelivery Boundary
        |       |
        |       +--> idempotent content-free nudge command
        |       +--> server-derived partner recipient
        |       +--> cooldown/abuse safeguard
        |       +--> provider-neutral PushDelivery adapter
        |       +--> generic lock-screen-safe payload
        |       +--> Self-Hosted no-provider behavior
        |
        +--> S3 Integrated M4-B Evidence
                |
                +--> Cross-Tenant/OWNER_ONLY regression
                +--> privacy-transition evidence
                +--> projector/job retry/idempotency
                +--> read-state concurrency
                +--> push payload/privacy evidence
                +--> status synchronization
```

M4-B runtime must not be combined into one oversized PR merely because Activity and Notification share source events.

## M4-B-S0 — readiness and contracts

**Owner:** #276 / PR #278  
**Runtime changes:** none  
**Status:** delivered

Deliverables:

- Activity/Notification/PushDelivery model split;
- controlled Activity event catalog;
- Notification recipient/read/unread contract;
- source-deletion/privacy-transition behavior;
- `Ich denke an dich` ownership/idempotency/cooldown;
- push privacy/provider/Self-Hosted boundary;
- Reuse-before-build decision using existing Outbox/Jobs;
- business/freemium classification;
- dedicated privacy/test matrix;
- concrete runtime sequence.

## M4-B-S1 — Activity + in-app Notification foundation

Create a dedicated issue before runtime implementation.

Scope:

- Activity and Notification persistence/migrations;
- idempotent safe-Outbox projector;
- controlled v1 Activity/Notification source mapping;
- authorization-first current-target projection;
- Activity API with Account+Space-bound keyset cursor;
- Notification list/unread-count APIs;
- idempotent mark-one-read and cutoff-safe mark-all-read;
- OpenAPI and regenerated TypeScript/Kotlin clients;
- unit/PostgreSQL/HTTP evidence from the M4-B privacy/test matrix.

Explicitly out:

- Push provider selection;
- `Ich denke an dich` send runtime;
- Reminder/Rule scheduling;
- full Activity/Notification client screens (M5).

Business classification:

- basic Activity and in-app Notifications = Free/Core.

Reuse result:

- transactional Outbox + PostgreSQL Job Queue where asynchronous work is required;
- no new broker/queue stack.

## M4-B-S2 — `Ich denke an dich` + PushDelivery boundary

Create a dedicated issue after S1 or in parallel only if migration/API overlap remains low and `main` is synchronized.

Scope:

- content-free `POST /api/v1/spaces/{spaceId}/thinking-of-you`;
- `clientRequestId` idempotency;
- server-derived active partner recipient;
- rolling 30-minute sender/Space cooldown (product decision, #790/#791), server-authoritative and exposed via `Dashboard.thinkingOfYouAvailableAt`;
- recipient in-app Notification;
- provider-neutral PushDelivery persistence/adapter/job boundary;
- stable logical push idempotency identity;
- generic no-sensitive-plaintext push presentation;
- deterministic Self-Hosted-unconfigured behavior;
- provider fake/adapter tests.

Explicitly out:

- user-authored thinking-of-you text;
- rich lock-screen previews;
- notification digests/routing automation;
- final Android distribution/push-provider commercial setup;
- entitlement runtime.

Business classification:

- basic `Ich denke an dich` and push capability = Free/Core; transport configuration remains an operating-model concern.

## M4-B-S3 — integrated evidence and status sync

**Status:** delivered cumulatively; see [M4-EVIDENCE.md](./M4-EVIDENCE.md).

Goal:

Prove engagement projections and delivery state do not create a new privacy/tenant leak or duplicate-effect path.

Evidence includes at minimum:

- real HTTP + PostgreSQL Activity/Notification behavior;
- Cross-Tenant isolation;
- `OWNER_ONLY` non-generation/non-influence;
- SHARED-to-PRIVATE target transition suppression;
- source-delete behavior;
- Account-bound cursor replay rejection;
- recipient/read/unread isolation;
- mark-all/new-notification concurrency;
- projector duplicate processing;
- Job Queue retry/worker-crash scenarios;
- safe generic push payload;
- Self-Hosted without push provider;
- `Ich denke an dich` recipient derivation/idempotency/cooldown;
- published OpenAPI/generated-client consistency;
- representative query/performance evidence;
- normal CI/CodeQL/Supply Chain/Self-Hosted gates.

S3 is evidence/status work, not a feature-expansion opportunity.

---

# M4-C — Reminders + Rules

M4-C readiness is delivered by #277 when its documentation PR merges.

Binding design:

- `REMINDERS-RULES-DESIGN.md`;
- `REMINDERS-RULES-PRIVACY-TIME-TEST-MATRIX.md`;
- `DECISION-LOG.md` M4-D47 through M4-D66.

## M4-C sequence

```text
S0 Readiness / Contract (#277)
        |
        +--> S1 Reminder Domain + Schedule API
        |       |
        |       +--> Reminder/Schedule/Offset/Preference persistence
        |       +--> shared/manual/generated invariants
        |       +--> ONCE/ANNUAL/RELATIONSHIP_DAY_COUNT evaluation
        |       +--> timezone/DST/leap-day semantics
        |       +--> Reminder CRUD/preference APIs
        |       +--> OpenAPI/generated clients
        |
        +--> S2 Rule Catalog + Occurrence Planner + M4-B Handoff
        |       |
        |       +--> controlled Rule catalog + RulePreference API
        |       +--> source reconciliation/generated Reminders
        |       +--> durable occurrence ledger
        |       +--> PostgreSQL Job Queue planning/reconciliation
        |       +--> retry/stale-generation/catch-up behavior
        |       +--> content-minimized REMINDER_DUE handoff
        |
        +--> S3 Integrated M4-C Evidence
                |
                +--> Cross-Tenant/private-source regression
                +--> DST/timezone/leap-day matrix
                +--> source/preference/timezone race evidence
                +--> restart/restore/stale-job reconciliation
                +--> M4-B Notification integration
                +--> status synchronization
```

## M4-C-S0 — readiness and contracts

**Owner:** #277  
**Runtime changes:** none  
**Status:** delivered

Deliverables:

- shared-v1 Reminder scope and manual/generated mutation semantics;
- `ReminderPreference` behavior;
- typed schedule contracts;
- DST/timezone/leap-day rules;
- dedicated offset contract;
- deterministic controlled Rule catalog/RulePreference contract;
- generated Reminder identity and source reconciliation;
- occurrence ledger and PostgreSQL Job Queue strategy;
- M4-C-to-M4-B handoff;
- Reuse-before-build and business/freemium decisions;
- dedicated privacy/time/test matrix;
- concrete runtime sequence.

## M4-C-S1 — Reminder Domain + Schedule API

Create a dedicated issue only after M4-C-S0 merges.

Scope:

- Reminder, ReminderSchedule, ReminderOffset and ReminderPreference persistence/migrations;
- shared Space authorization and manual/generated invariants;
- manual Reminder CRUD;
- generated Reminder read-only mutation boundary;
- per-account mute preference;
- `ONCE`, `ANNUAL` and `RELATIONSHIP_DAY_COUNT` evaluation;
- Account-timezone/DST/Feb-29/start-date semantics;
- offset validation/uniqueness;
- next-occurrence projection;
- OpenAPI and regenerated TypeScript/Kotlin clients;
- unit/PostgreSQL/HTTP privacy/time/concurrency evidence.

Explicitly out:

- Rule catalog runtime;
- occurrence jobs/delivery;
- M4-B Notification handoff;
- full Reminder client productization (M5).

Business classification:

- manual shared Reminders and per-account mute = Free/Core.

Reuse result:

- existing Account timezone/clock/concurrency patterns;
- no scheduler/message infrastructure required for S1 domain semantics.

## M4-C-S2 — Rule Catalog + Occurrence Planner + M4-B handoff

Runtime dependency:

- the Reminder Domain from S1 is required;
- final user-visible delivery integration requires the M4-B in-app Notification foundation rather than creating a parallel notification stack.

Scope:

- controlled v1 Rule catalog;
- RulePreference API/validation;
- shared source reconciliation/generated Reminders;
- technical ReminderOccurrence/equivalent ledger;
- next-occurrence planning and bounded reconciliation;
- existing PostgreSQL Job Queue `run_after`/lease/retry reuse;
- stale-generation cancellation/no-op behavior;
- 24-hour missed-occurrence catch-up window;
- content-minimized `REMINDER_DUE` handoff to M4-B;
- PostgreSQL race/restart/idempotency tests.

Explicitly out:

- arbitrary scripts/expression language;
- general workflow engine;
- AI automation;
- external integration triggers;
- separate Notification/Push implementation;
- entitlement runtime.

Business classification:

- initial deterministic ImportantDate/birthday/anniversary/Plan rules = Free/Core;
- advanced automation remains future Mixed/Premium candidate.

Reuse result:

- PostgreSQL Job Queue + Outbox + existing retry/lease primitives;
- no Redis/Celery/Quartz/Kafka/RabbitMQ/new scheduler stack.

## M4-C-S3 — integrated evidence and status sync

**Status:** delivered by the final M4-C-S2/S3 closeout; see [M4-EVIDENCE.md](./M4-EVIDENCE.md).

Goal:

Prove date/time automation stays deterministic and cannot leak private/cross-tenant data or create duplicate user-visible effects under retry/restart/race conditions.

Evidence includes at minimum:

- real HTTP + PostgreSQL manual/generated Reminder flows;
- Cross-Tenant isolation;
- private-source non-generation/non-influence;
- all schedule validation boundaries;
- Europe/Berlin plus another DST pattern;
- February 29 fallback;
- Account timezone change recomputation;
- relationship start change recomputation;
- offset mutation/uniqueness;
- RulePreference account isolation;
- generated Reminder source-event replay/idempotency;
- concurrent planner/worker behavior;
- stale job suppression;
- 24-hour catch-up and no stale burst;
- M4-B Notification handoff idempotency/privacy;
- published OpenAPI/generated-client consistency;
- representative query/performance evidence;
- business/freemium traceability;
- normal CI/CodeQL/Supply Chain/Self-Hosted gates.

S3 is evidence/status work, not a feature-expansion opportunity.

## Parallelism rule

Parallel work is allowed only when branches do not compete for the same authoritative contract/migration/generated-client surface.

Examples:

- docs-only readiness work may coexist with M4-A Search runtime;
- M4-C-S1 may proceed independently from M4-B runtime if migration/router/OpenAPI/client-generation overlap is coordinated;
- M4-C-S2 can implement planning/rule internals, but its user-visible delivery integration must target the delivered M4-B Notification foundation;
- two branches that both edit the same generated OpenAPI/client surfaces should normally serialize or synchronize through merge commits rather than rely on rebase;
- no runtime slice may silently change a DECIDED contract merely to increase parallelism.

## Definition of Done per runtime slice

A runtime slice is not done until:

- source decision remains satisfied;
- business/freemium result is traceable;
- Reuse-before-build is traceable where relevant;
- API/OpenAPI/generated clients are synchronized;
- Tenant/Privacy negative tests pass;
- PostgreSQL integration evidence exists for persistence/concurrency/query semantics;
- time/DST behavior is tested where relevant;
- cross-cutting review is complete;
- branch is current enough for repository rules;
- all required CI checks are green before Merge Commit.

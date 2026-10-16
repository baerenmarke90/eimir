# M4 Completion Evidence

**Status:** M4 complete on merge of the final M4-C-S2/S3 pull request
**As of:** August 30, 2026
**Scope:** M4 — Engage only

This document is the living evidence index for the completed M4 backend/API milestone. It maps the frozen M4 decisions to delivered runtime, migrations, executable evidence, generated contracts and the final repository gates. It does not declare G4 passed; M5 remains responsible for complete Web/Android productization and parity.

## Delivery map

| Risk class | Readiness | Runtime / closeout | Result |
|---|---|---|---|
| M4-A Search + Dashboard | #272 / PR #273 | Search #274 / PR #288; Dashboard #280 / PR #291; FTS metadata correction PR #294 | delivered |
| M4-B Activity + Notifications | #276 / PR #278 | Activity/Notifications #282 / PR #284; Thinking-of-you/Push #289 / PR #305 | delivered |
| M4-C Reminders + Rules | #277 / PR #279 | Reminder domain #285 / PR #308; Rules/Occurrences + integrated closeout #292 / PR #309 | delivered |

Historical replacement/draft PRs are not part of the final delivery identity. The merged PRs above are the authoritative runtime line.

## Migration chain

M4 preserves one linear Alembic head:

```text
0028  Search FTS
  -> 0029  Activity + Notifications
  -> 0030  Thinking-of-you + PushDelivery
  -> 0031  Reminder domain + schedules/preferences
  -> 0032  RulePreference + ReminderOccurrence + REMINDER_DUE notification kind
```

The final M4-C validation exercises upgrade through `0032`; the final closeout additionally verifies `0032` downgrade/upgrade and Alembic drift before merge.

## M4-A evidence

- Search applies Tenant/authorization predicates before ranking or projection. Caller-owned private results are permitted only for the caller; partner-private rows cannot influence results, counts or cursors.
- Search uses PostgreSQL Full Text Search with GIN expression indexes and an Account+Space+query/filter-bound signed keyset cursor; no external Search service or copied plaintext search table exists.
- Dashboard is derived from authoritative rows and is deliberately shared-only. `OWNER_ONLY` data is excluded even for its owner and cannot influence shared counts/cards.
- Search and Dashboard endpoints are covered by the cross-cutting Tenant matrix, PostgreSQL integration evidence, the authoritative OpenAPI contract and generated TypeScript/Kotlin clients.
- PR #294 aligns compound SQLAlchemy FTS metadata with migration `0028` and protects `Base.metadata.create_all()` with PostgreSQL compilation regression coverage.

## M4-B evidence

- Activity and Notification are minimized durable projections from safe Outbox facts; ProtectedPayload prose is not copied into projection metadata.
- Activity is shared-Space state; Notifications and unread/read state are Account+Space scoped. Current target authorization is re-evaluated before exposing projected state.
- Projection uniqueness makes Outbox replay idempotent; mark-one-read is idempotent and mark-all-read uses a server cutoff.
- Thinking-of-you is content-free, derives the other active partner server-side, uses sender+Space+`clientRequestId` idempotency and a rolling cooldown, and creates Notification but no Activity noise.
- PushDelivery reuses the existing PostgreSQL Job Queue and receives only generic presentation keys plus technical Notification references. Self-Hosted without a provider remains nonfatal.

## M4-C evidence

- Manual Reminder definitions are shared Space content with optimistic concurrency, exactly one typed schedule and dedicated offset rows. `ReminderPreference.muted` is independent per Account.
- The controlled Rule catalog contains exactly the four M4 keys and defaults: ImportantDate `[7,1]`, RelatedPerson birthday `[14,7,1]`, relationship anniversary `[30,7,1]`, and Plan start `[1,0]`.
- `RulePreference` is Account+Space+ruleKey scoped, server-validates typed parameters, uses catalog defaults when absent and changes only that recipient's future eligibility.
- Generated Reminders reconcile only from shared/eligible ImportantDate, RelatedPerson birthday, relationship start and PLANNED Plan start sources. Private/`OWNER_ONLY` sources cannot generate Reminder, occurrence or notification state.
- Source mutations, relationship-start changes and Account timezone changes trigger reconciliation; periodic/startup reconciliation remains bounded and idempotent for restore/downtime recovery.
- `ReminderOccurrence` persists technical metadata only and has logical uniqueness over Reminder+recipient+occurrenceKey+offset. Jobs carry occurrence ID + generation, so stale/superseded work no-ops after reloading current state.
- Planning materializes only the next eligible recurrence set per recipient/offset rather than years of future jobs.
- ONCE uses an absolute UTC instant and exact 24-hour offsets. ANNUAL and RELATIONSHIP_DAY_COUNT use recipient IANA timezone and calendar-day semantics. February 29 falls back to February 28 in non-leap years.
- DST gaps shift forward by the gap and ambiguous times choose the earlier instant. Europe/Berlin and a second DST pattern are part of final closeout evidence.
- Due handling rechecks Membership, source eligibility, Reminder mute, RulePreference and current occurrence generation/state. Catch-up is bounded to 24 hours; older work expires without a stale burst.
- M4-C emits one minimized `REMINDER_DUE` Outbox fact and reuses the existing M4-B Notification/PushDelivery stack. Replay cannot create a duplicate logical Notification/PushDelivery.

## Query/resource bounds

M4 deliberately avoids a new infrastructure tier. Representative hot paths are bounded by database indexes and logical uniqueness:

- Search uses the M4-A PostgreSQL GIN expression indexes and keyset pagination.
- Activity reads use `(space_id, occurred_at, id)` ordering; Notification reads use recipient+Space+created ordering with a partial unread index.
- RulePreference has unique Account+Space+ruleKey identity plus a Space+Account index.
- ReminderOccurrence has logical uniqueness plus recipient/state/due and reminder/state/due indexes.
- occurrence planning stores only the bounded next recurrence set; no unbounded future materialization is performed.

## Contract and repository evidence

The final M4 tree must satisfy all of the following before its Merge Commit:

- one Alembic head through `0032`, upgrade/downgrade/drift clean;
- Endpoint/Tenant matrix includes Search, Dashboard, Activity, Notifications, Thinking-of-you, Reminders and Rules;
- authoritative `backend/openapi.json` matches runtime routes/models;
- repository-native generator produces matching TypeScript and Kotlin clients;
- PostgreSQL integration evidence covers Privacy/Tenant isolation, replay/idempotency, Reminder time/DST/catch-up and M4-B handoff;
- normal CI, Backend Integration, Supply Chain, Secret Scan, Provenance, CodeQL, Self-Hosted Deployment Guard, Reuse Review and client-regression checks are green on the final current head.

## Business and reuse traceability

The delivered M4 baseline remains **Free/Core** for Self-Hosted and Cloud/Managed: basic Search, Dashboard, Activity, in-app Notifications, Thinking-of-you, basic push capability, manual shared Reminders, the four deterministic rules and per-account core preferences. M4 introduces no entitlement runtime.

Reuse decisions remain binding: PostgreSQL FTS instead of a second Search service; transactional Outbox and the existing PostgreSQL Job Queue instead of Redis/Celery/Kafka/RabbitMQ/Quartz; one M4-B Notification/PushDelivery path instead of a Reminder-specific duplicate stack.

## Boundary after M4

M4 completion freezes the backend/API contracts needed by M5. It does not complete M5 or G4. Complete Web/Android screens, parity, Deep Links, Read Cache, Export/Import, Accessibility and client performance remain M5/G4 scope.

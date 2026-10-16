# M4-C Reminders and Rules Privacy/Time/Test Matrix

**Status:** binding evidence contract for M4-C runtime  
**As of:** August 30, 2026  
**Owning readiness issue:** #277

This matrix defines the minimum evidence required before M4-C can be considered complete.

Reminder correctness is time-dependent, privacy-sensitive and retryable. Happy-path unit tests alone are insufficient.

## Core invariants

1. M4-C v1 Reminders are shared Space content; owner-only/private Reminder semantics are not invented implicitly.
2. Automatic Reminder sources are shared/currently authorized only.
3. `OWNER_ONLY` source content cannot influence partner-visible Reminder rows, occurrence metadata, counts or M4-B Notifications.
4. Server/domain time is authoritative; device clocks are not.
5. `ONCE`, `ANNUAL` and `RELATIONSHIP_DAY_COUNT` have deterministic, separately tested semantics.
6. Job retry/reconciliation cannot create duplicate logical Reminder deliveries.
7. Schedule/source/timezone/preference changes make stale queued jobs harmless.
8. M4-C owns due-time calculation; M4-B owns Notification/Push state.
9. Rule behavior comes from a controlled catalog, never executable user expressions/scripts.

## Reminder authorization and lifecycle evidence

| Area | Required case | Required result |
|---|---|---|
| Tenant isolation | Account from Space B lists/gets Space A Reminder | Privacy-safe deny; no row/schedule/source/offset leakage. |
| Tenant isolation | Account from Space B mutates Space A Reminder/preference | Privacy-safe deny. |
| Membership | Removed/inactive member accesses Reminder APIs | No access after Membership becomes inactive. |
| Manual shared | Partner A creates manual Reminder | Both active partners can read it; `createdBy` is provenance, not owner-only scope. |
| Manual shared | Partner B updates manual Reminder with current version | Shared update succeeds. |
| Manual shared | stale concurrent update | Stable optimistic conflict; no partial schedule/offset mutation. |
| Manual shared | either active partner deletes manual Reminder | Reminder disappears and pending occurrences are cancelled/superseded. |
| Generated mutation | client attempts to edit generated Reminder title/schedule/source | Stable validation/domain error; source/rule remains authoritative. |
| Generated mutation | client attempts independent delete of generated Reminder | Rejected; per-account mute/source/rule controls are used instead. |
| Preference | Account A mutes Reminder | A future delivery suppressed; B preference/delivery unaffected. |
| Preference | Account B attempts to mutate A's preference | Privacy-safe deny. |
| Unmute | Account un-mutes after historical occurrences | Only future eligible occurrences planned; no unbounded replay. |

## Source/privacy evidence

| Area | Required case | Required result |
|---|---|---|
| Allowed source | shared ImportantDate eligible | One logical generated Reminder for source+rule. |
| Allowed source | shared RelatedPerson birthday eligible | One logical generated Reminder. |
| Allowed source | relationship start configured | anniversary rule can produce generated Reminder. |
| Allowed source | shared PLANNED Plan with scheduled start | Plan rule can produce generated Reminder. |
| Private exclusion | GiftIdea/PrivateNote/PrivateCollection/private item mutation | No generated shared Reminder, occurrence or partner Notification. |
| Private exclusion | PRIVATE HeartMoment date/text mutation | No generated shared Reminder or scheduling metadata. |
| Source replay | same source event processed twice | No duplicate generated Reminder. |
| Source update | source date changes | Existing generated Reminder reconciled; old pending occurrences superseded; new due state planned. |
| Source delete | source deleted | Generated Reminder removed/inactivated; pending occurrence cannot deliver. |
| Source eligibility | Plan leaves PLANNED state before due time | pending Plan Reminder occurrence cannot deliver if no longer eligible. |
| Cross-Tenant source | manipulated source ID from another Space | rejected before Reminder/reconciliation state is created. |

## Schedule validation evidence

### ONCE

Required cases:

- valid RFC3339 offset-aware future timestamp;
- normalization to one UTC instant;
- missing offset rejected;
- invalid timestamp rejected;
- past creation rejected;
- Account timezone change does not alter due instant;
- `daysBefore=1` subtracts exactly 24 hours;
- all supported offsets produce deterministic due instants.

### ANNUAL

Required cases:

- valid month/day/local time;
- invalid month/day combinations rejected;
- Feb 29 in leap year resolves to Feb 29;
- Feb 29 in non-leap year resolves to Feb 28;
- current recipient Account timezone used, never device-submitted current timezone as authority;
- Account timezone change recomputes undelivered occurrence;
- calendar-day offset crosses DST transition correctly;
- next occurrence selection around year boundary is deterministic.

### RELATIONSHIP_DAY_COUNT

Required cases:

- day 1 equals relationship start date;
- day N equals start + N-1 calendar days;
- missing relationship start means no occurrence;
- invalid/non-positive day count rejected;
- relationship start change supersedes/recomputes pending occurrence;
- Account timezone change recomputes undelivered recipient due instant;
- already delivered historical Notification is not rewritten after start-date change.

## DST evidence

Use real IANA timezone data in deterministic tests.

At minimum prove:

- spring-forward nonexistent local time shifts forward by the exact timezone gap;
- one-hour example `02:30 -> 03:30` where applicable;
- fall-back ambiguous local time uses the earlier instant/offset occurrence;
- calendar-day offsets are computed on calendar dates before local-time resolution;
- no duplicate occurrence is generated merely because a local time repeats;
- timezone rules are evaluated server-side from the configured IANA zone.

Include Europe/Berlin plus at least one timezone with a different DST transition pattern to avoid encoding one-zone assumptions.

## ReminderOffset evidence

Required cases:

- `0` accepted;
- `365` accepted;
- negative value rejected;
- value above `365` rejected;
- duplicate value cannot create duplicate persisted offsets;
- API returns stable ascending order;
- offset edit cancels/supersedes old pending occurrences;
- multiple offsets produce distinct logical occurrence identities;
- technical offset bound is identical for Self-Hosted and Cloud and has no entitlement check.

## Rule catalog evidence

| Rule | Required evidence |
|---|---|
| `important_date_reminder` | controlled source mapping, defaults `[7,1]`, parameter validation, annual recurrence. |
| `related_person_birthday_reminder` | defaults `[14,7,1]`, birthday source requirement, Feb 29 handling. |
| `relationship_anniversary_reminder` | defaults `[30,7,1]`, missing-start behavior, start-date change reconciliation. |
| `plan_start_reminder` | defaults `[1,0]`, only eligible scheduled PLANNED Plan, state/date change reconciliation. |

For every Rule prove:

- stable `ruleKey` lookup;
- unknown rule key rejected;
- parameters validated against that rule's schema;
- default parameters applied when no preference exists;
- Account A enable/disable does not alter Account B preference;
- disabling removes/supersedes only A's future pending delivery eligibility;
- re-enabling plans future occurrences without historical burst;
- no arbitrary executable expression/script is accepted by API/persistence.

## Generated Reminder identity/concurrency evidence

Real PostgreSQL tests must prove:

- unique logical source+rule identity under concurrent reconciliation;
- source event replay cannot create duplicate generated Reminder rows;
- source update racing reconciliation converges on the current source definition;
- source delete racing reconciliation cannot leave a deliverable orphan;
- concurrent RulePreference changes converge without cross-account overwrite;
- generated Reminder is never silently converted into an editable manual Reminder.

## Occurrence ledger evidence

Real PostgreSQL tests must prove logical uniqueness for:

```text
reminder + recipient + occurrenceKey + daysBefore
```

Required cases:

- duplicate planner execution creates one logical occurrence;
- concurrent planners create one logical occurrence;
- queued job reloads current occurrence state;
- cancelled occurrence job no-ops;
- superseded generation job no-ops;
- already delivered job retry no-ops at logical-effect layer;
- preference mute before execution prevents delivery;
- source deletion/ineligibility before execution prevents delivery;
- timezone change makes old planned job stale and new occurrence authoritative.

## Job Queue and retry evidence

Use the existing PostgreSQL Job Queue behavior rather than mocks for the final concurrency proof.

At minimum:

- `run_after` prevents early claim/delivery;
- multiple workers cannot simultaneously own the same due Job;
- lease expiry permits recovery after worker crash;
- transient failure follows existing retry/backoff;
- terminal max-attempt handling does not duplicate M4-B Notification effects;
- recurring Reminder plans the next occurrence without materializing unbounded future jobs;
- startup/periodic reconciliation is repeatable and idempotent;
- backup/restore with stale pending jobs converges on current authoritative schedule state.

## Catch-up evidence

Required cases:

- service recovers 1 minute after due time -> eligible delivery occurs;
- service recovers just inside 24-hour catch-up window -> eligible delivery occurs;
- service recovers beyond 24 hours -> old occurrence marked skipped/expired, no stale Notification burst;
- future recurrence still plans after an expired missed occurrence;
- catch-up rule applies identically in Self-Hosted and Cloud.

## M4-B handoff evidence

M4-C integrated evidence must run against the delivered M4-B Notification foundation, not a second notification implementation.

Prove:

1. one valid due occurrence creates one logical recipient Notification;
2. retry of the same due occurrence does not create a duplicate Notification;
3. the handoff contains no Reminder description or source ProtectedPayload;
4. muted/ineligible recipients generate no Notification;
5. Cross-Tenant source/recipient manipulation cannot redirect delivery;
6. M4-B current authorization/read-state rules remain authoritative;
7. push, where configured, remains M4-B's responsibility and uses its safe preview policy.

## HTTP evidence

At least these integrated HTTP + PostgreSQL scenarios are required.

### Manual Reminder flow

1. partner A creates a shared manual Reminder with `ANNUAL` schedule and offsets;
2. partner B reads it;
3. B mutes their own preference;
4. A remains eligible;
5. schedule is updated with a current version;
6. stale concurrent update is rejected;
7. future occurrence is recomputed without duplicate jobs.

### Generated birthday flow

1. shared RelatedPerson birthday is eligible;
2. generated Reminder is reconciled exactly once;
3. A has default-enabled rule, B disables it;
4. only A receives eligible due handoff;
5. birthday changes;
6. old occurrence is superseded and new date planned;
7. no source plaintext leaks into occurrence/job/log state.

### Relationship day-count flow

1. relationship start exists;
2. manual day-count Reminder is created;
3. day 1/N math is verified;
4. start date changes before delivery;
5. stale job no-ops and new dueAt is authoritative.

### Private non-generation flow

1. owner creates/updates private GiftIdea/PrivateNote/private HeartMoment;
2. partner lists Reminders/Rules and later Notifications;
3. no row, count, scheduling timestamp, occurrence, job metadata or Notification is influenced by the private source.

## Logging and observability evidence

Validation/error/retry paths must prove logs and metric labels do not include:

- Reminder title/description;
- RelatedPerson names;
- ImportantDate labels;
- source ProtectedPayload;
- private source identifiers;
- raw job payload dumps containing user content;
- Account/Space/resource IDs as high-cardinality metric labels.

Aggregate schedule/rule kind and error-class metrics are allowed.

## Performance/resource evidence

M4-C runtime must demonstrate:

- no unbounded future occurrence materialization;
- indexed lookup of due/pending occurrences and reminder/source relationships;
- bounded reconciliation batches;
- no N+1 source/presentation loading across Reminder list pages;
- no repeated full-Space scan for each due worker execution;
- stable pagination for Reminder list if pagination is exposed;
- source/rule reconciliation has representative query-count evidence.

## Business/freemium evidence

Every M4-C runtime PR must reconfirm:

- manual shared Reminders = Free/Core;
- initial deterministic date/birthday/anniversary/Plan rules = Free/Core;
- per-account mute/core RulePreference controls = Free/Core;
- no entitlement checks in M4-C;
- advanced multi-condition/multi-step/external-trigger automation remains a separate future Mixed/Premium decision;
- technical time/offset/retry/page bounds are not commercial quotas;
- Self-Hosted and Cloud use the same functional Reminder/Rule contract.

## Evidence closure rule

M4-C cannot be considered complete while any of the following is unproven:

- Cross-Tenant isolation;
- private-source non-generation/non-influence;
- schedule-type validation;
- DST/leap-day/timezone semantics;
- relationship-start change behavior;
- offset uniqueness/normalization;
- RulePreference account isolation;
- generated Reminder idempotency;
- occurrence/job retry idempotency;
- stale-job invalidation;
- 24-hour catch-up behavior;
- M4-B Notification handoff consistency;
- OpenAPI/generated-client consistency for delivered routes.

# M4-B Activity and Notification Design

**Status:** DECIDED for M4-B runtime  
**As of:** August 30, 2026  
**Owning readiness issue:** #276  
**Runtime changes in this document:** none

## Purpose

This document freezes the M4-B contract for:

- user-visible Activity;
- recipient-scoped in-app Notifications;
- provider-neutral PushDelivery;
- the `Ich denke an dich` interaction;
- event projection, read state, pagination, privacy, idempotency and delivery boundaries.

M4-B does not redefine the Domain mutation contracts delivered in M1-M3. It consumes safe Domain/Outbox facts and creates an engagement projection without weakening current Tenant Isolation or `OWNER_ONLY` behavior.

## Binding product distinction

The Product and Clean-Room specifications distinguish three concepts:

```text
Activity      = user-visible Space event
Notification  = recipient-specific user state
PushDelivery  = technical delivery attempt/channel
```

`OutboxEvent` is a fourth, internal concept. It is a transactional integration record and is not itself a user-visible feed.

The M4-B implementation must keep these models separate.

## Architecture

### Source path

The approved v1 path is:

```text
Domain mutation
    |
    +-- same DB transaction --> OutboxEvent with safe references only
                                 |
                                 v
                        M4-B projection worker
                         /                 \
                        v                   v
                  Activity?           Notification?
                                            |
                                            +-- optional --> PushDelivery job/attempt
```

The existing transactional Outbox remains the reliable mutation-to-engagement boundary. The existing PostgreSQL Job Queue remains the background-work primitive.

M4-B does **not** introduce Redis, Celery, Kafka, RabbitMQ or another broker.

### Consistency model

Activity and Notification are asynchronous projections of committed Domain events.

Consequences:

- a committed Domain mutation may become visible in Activity/Notifications shortly after the Domain API response rather than in the same request;
- rolled-back Domain writes never create Activity/Notifications because no committed Outbox fact exists;
- projection must be idempotent so worker retry does not create duplicate user-visible effects;
- Privacy is checked again when projections are read, so a later visibility/authorization change takes effect even before asynchronous cleanup removes stale projection rows.

This eventual projection delay is acceptable. A privacy leak is not.

## Data minimization

Activity and Notification are reference-oriented projections, not copied relationship content.

### Activity

Conceptual fields:

```text
Activity
- id
- spaceId
- sourceEventId
- kind
- actorId?
- targetType?
- targetId?
- occurredAt
- createdAt
```

Rules:

- `sourceEventId` is unique for a projected Activity row;
- no Memory body, Comment body, HeartMoment text, Wish title, Plan description, private text or other ProtectedPayload is copied into Activity storage;
- presentation labels are resolved from currently authorized Domain state at read time where needed;
- generic event copy is localized by clients from stable `kind` values;
- a target that is no longer readable makes the Activity row non-projectable to that caller.

### Notification

Conceptual fields:

```text
Notification
- id
- spaceId
- recipientAccountId
- sourceEventId
- kind
- actorId?
- targetType?
- targetId?
- createdAt
- readAt?
```

Rules:

- uniqueness must prevent more than one logical Notification for the same recipient and source-event/kind combination;
- no protected user-authored plaintext is copied into Notification storage;
- recipient state belongs to exactly one Account and Space;
- `readAt` is server-authored state and is not inferred from a client clock.

### PushDelivery

Conceptual fields:

```text
PushDelivery
- id
- notificationId
- endpoint/device reference
- providerKey
- status
- attempts
- lastErrorCode?
- providerMessageId?
- createdAt
- finishedAt?
```

PushDelivery is `SYSTEM_METADATA`.

It must not contain copied notification/relationship plaintext. Provider errors stored for operations must be bounded and sanitized so remote-provider responses cannot become an accidental content/log sink.

Push tokens/endpoints are security-sensitive technical credentials/identifiers and remain excluded from user export as already required by the product specification.

## Initial Activity event catalog

M4-B v1 uses a controlled catalog. Runtime code must not convert every Outbox event automatically into Activity.

Initial user-visible Activity kinds:

- shared Memory created;
- shared Milestone created;
- HeartMoment first shared, either at creation or through an `OWNER_ONLY` → `SHARED` transition;
- Wish created;
- Plan created;
- Plan completed;
- Place created;
- Chapter created;
- shared Collection created;
- Comment created on an authorized shared target.

Deliberately excluded from the initial Activity feed:

- any `OWNER_ONLY` / private event;
- Authentication, Session, Invitation-token, Audit, Job, Outbox and infrastructure events;
- Attachment processing/derivative events;
- ordinary edits;
- list reorders;
- item completion toggles;
- retries, worker attempts or provider delivery state;
- Search and Dashboard reads;
- Reminder scheduling internals;
- `Ich denke an dich` signals, which create a recipient Notification but do not add Activity feed noise in v1.

A later expansion of the Activity catalog requires an explicit event/privacy decision rather than a wildcard mapper.
Re-sharing an already seen HeartMoment does not create a duplicate Activity entry.
The current target privacy check hides the entry from the partner immediately
if visibility later returns to `OWNER_ONLY`. HeartMoments do not gain a new
recipient Notification or PushDelivery kind from this Activity rule.

## Activity authorization

Activity is a shared Space surface.

Every list/read requires:

1. authenticated Account;
2. active Membership in `spaceId`;
3. `activity.spaceId == spaceId`;
4. current authorization for any referenced target.

`OWNER_ONLY` rows are never generated as shared Activity. If a previously shared target becomes private or otherwise non-readable, the partner must not receive the stale Activity row, its count, its target ID or any presentation metadata.

The safe rule is **authorization before projection**.

## Activity ordering and pagination

API order is deterministic:

1. `occurredAt DESC`;
2. `id DESC`.

Use signed opaque keyset cursors with the existing cursor infrastructure.

The cursor binds at least:

- Account;
- Space;
- sort-contract version `activity-v1`;
- last `occurredAt`;
- last Activity ID.

Default page size: 25.  
Allowed range: 1-50.  
No offset pagination.

The technical page-size bound is an abuse/performance safeguard, not a commercial quota.

## Activity source deletion and privacy transitions

If referenced source content is deleted or stops being readable:

- it disappears from API projection immediately through current authorization/source joins;
- the API does not emit a tombstone revealing that private/deleted content existed;
- asynchronous cleanup may later remove orphaned Activity metadata;
- deletion of the projection does not recreate or alter the original Domain resource.

M4-B v1 does not promise a permanent audit history. Activity is a convenience feed, not an AuditEvent substitute and not a replacement for Story/Timeline.

## Notification generation

A controlled mapping decides whether an eligible safe Outbox event creates recipient Notifications.

Initial notification-worthy classes may include:

- Comment created for the other authorized partner;
- selected shared engagement events where the product contract explicitly enables a notification;
- `Ich denke an dich` for the other active partner;
- Reminder/Rule due events handed off later by M4-C.

Activity generation and Notification generation are independent decisions. An event may create:

- Activity only;
- Notification only;
- both;
- neither.

This prevents the Activity catalog from implicitly becoming a push-spam policy.

## Recipient selection

Notification recipients are derived server-side.

For normal couple-space events:

- the actor is not notified about their own action unless a specific future contract says otherwise;
- only active members of the same Space are eligible;
- target authorization is evaluated before Notification creation and again on read;
- `OWNER_ONLY` content can notify only its owner if a future owner-only reminder flow explicitly supports that case; M4-B itself never redirects private content to a partner.

No client-provided arbitrary Account ID can choose a Notification recipient.

## Notification ordering and pagination

Notifications use deterministic order:

1. `createdAt DESC`;
2. `id DESC`.

Use a signed opaque keyset cursor bound to:

- recipient Account;
- Space;
- sort-contract version `notification-v1`;
- last `createdAt`;
- last Notification ID.

Default page size: 25.  
Allowed range: 1-50.

## Read/unread semantics

A Notification is unread when `readAt IS NULL`.

### Mark one read

The command is idempotent:

- marking an unread Notification sets `readAt` to server time;
- marking an already-read Notification succeeds without changing the original `readAt`;
- another Account cannot mutate the row;
- a row in another Space cannot be mutated through the current Space route.

### Mark all read

`mark all read` captures a server-side cutoff instant inside the transaction and updates only authorized recipient Notifications in that Space with `createdAt <= cutoff`.

Notifications committed after the cutoff remain unread.

The command may return the server cutoff/read-through value for client reconciliation, but clients do not choose the authoritative cutoff.

### Unread count

Unread count includes only currently authorized, projectable Notifications.

A Notification whose target became non-readable cannot continue to influence the partner's unread count.

## Notification target behavior

A projectable Notification may expose a typed target reference so the client can open the relevant content.

If the target was deleted or is no longer authorized:

- the Notification is omitted from normal list/count projection or returned as unavailable only where doing so cannot reveal protected existence;
- the API never returns stale ProtectedPayload;
- direct target open follows the normal Domain authorization route and cannot rely on the Notification as authorization evidence.

A Notification is a hint, never an access grant.

## `Ich denke an dich`

M4-B owns the v1 `Ich denke an dich` runtime.

### Product behavior

The action is a lightweight content-free nudge from one active partner to the other active partner in the same Space.

It has **no free-text payload** in v1.

The server derives the recipient from active Membership; callers cannot nominate an arbitrary recipient.

### Persistence

M4-B does not introduce a separate durable `ThinkingOfYou` content model.

The accepted action creates a safe engagement Outbox fact and a recipient Notification projection. The sender-side client may show immediate local confirmation/animation, but there is no separate shared historical content object.

The signal does not create an Activity row in v1.

### API contract

Contract-level endpoint:

```text
POST /api/v1/spaces/{spaceId}/thinking-of-you
```

Request:

```json
{
  "clientRequestId": "<uuid>"
}
```

`clientRequestId` is caller-generated and is used only for idempotency. It is not user content.

The server enforces uniqueness for the sender/Space/request ID combination so normal retries do not create duplicate signals.

### Cooldown

The server enforces a 30-minute rolling sender/Space cooldown between new `Ich denke an dich` signals (`thinking.COOLDOWN_SECONDS`), in addition to normal API rate limiting. This is a deliberate product pacing decision (Product Owner, #790/#791) superseding the earlier 60-second technical anti-spam bound, not merely a stricter version of it.

A replay of an already accepted `clientRequestId` is idempotent and does not consume another logical send or extend the cooldown.

The cooldown state is server-authoritative and surfaced to clients through `Dashboard.thinkingOfYouAvailableAt` (`null` when a send is available now), so the sending control can reflect the real state without a local timer or a failed request. A request that still races past the client-visible state receives a `429 THINKING_OF_YOU_COOLDOWN` response with a standard `Retry-After` header carrying the exact remaining seconds.

The cooldown remains Free/Core behavior, not a Premium quota.

### Membership changes

If there is no other active partner at execution time, the action fails with the normal privacy-safe Domain error and creates no event/Notification.

A historical signal never grants access after Membership changes.

## Push privacy boundary

Push is an optional delivery channel for an existing Notification.

### Default preview

Default push payloads must not contain:

- Memory/HeartMoment/Comment text;
- Wish/Plan/private titles;
- Gift ideas;
- private notes;
- attachment names;
- other relationship plaintext.

The default lock-screen-safe presentation is generic, for example a client-localized equivalent of:

```text
eimir.
There is something new for you.
```

A typed notification kind/ID may be delivered as protected technical data where required for navigation. The client must fetch current authorized Notification state before showing protected in-app detail.

A future user opt-in for richer previews requires a separate explicit privacy decision. M4-B v1 does not enable it.

## Push provider boundary

M4-B defines a provider-neutral application interface rather than embedding provider APIs into Domain services.

Conceptually:

```text
PushProvider.send(
    idempotency_key,
    endpoint,
    notification_reference,
    generic_presentation_key
)
```

Provider-specific credentials/configuration stay at the infrastructure boundary.

### Self-Hosted

A Self-Hosted instance without configured push infrastructure remains fully functional for:

- Activity;
- in-app Notifications;
- read/unread state;
- `Ich denke an dich` in-app delivery.

Push absence is represented as unavailable/not configured, not as a failed Premium entitlement and not as a fatal application dependency.

### Cloud

Cloud may operate the push provider as part of managed operations. The functional notification contract remains the same.

## Retry and idempotency

### Projection

Activity uniqueness:

```text
sourceEventId + activity kind
```

Notification uniqueness:

```text
recipientAccountId + sourceEventId + notification kind
```

The exact database constraint may encode these semantics differently, but retrying the same Outbox event cannot create duplicate logical rows.

### Push

Push delivery uses a stable idempotency key derived from the Notification and endpoint/delivery target.

Provider errors are retried through the existing Job Queue lease/backoff behavior.

A worker crash after external send but before local success marking may repeat the provider call; therefore providers/adapters should use the stable key where supported, and local PushDelivery uniqueness must prevent creating multiple logical delivery records for the same Notification/endpoint.

The system promises idempotent logical effects where controllable; it does not falsely claim network-level exactly-once delivery.

## Retention and deletion

M4-B v1 introduces **no arbitrary time-based product retention limit** for Activity or Notification rows.

Rationale:

- these rows contain minimized references/system metadata rather than copied ProtectedPayload;
- automatic age-based deletion would be a user-visible product behavior not required by the binding specification;
- deterministic keyset pagination bounds normal reads;
- Space/account deletion must delete or anonymize dependent projection state according to the existing data-lifecycle rules;
- source deletion/privacy transition immediately suppresses unauthorized projection even if cleanup is asynchronous.

If Cloud scale later requires an age-based retention policy, it must be introduced as an explicit versioned product/privacy decision rather than as a hidden database cleanup constant.

## Logging and observability

Allowed aggregate telemetry includes:

- projection latency;
- queue depth;
- counts by stable event/notification kind;
- delivery success/failure counts by provider/error class;
- retry count distributions.

Forbidden log/metric labels include:

- relationship text;
- Comment/Memory/HeartMoment content;
- private titles;
- push token values;
- notification target plaintext;
- raw provider response bodies that may contain sensitive request data.

Account/Space/resource identifiers should not become high-cardinality metric labels.

## API contract summary

Later runtime slices publish the concrete OpenAPI definitions for at least:

```text
GET  /api/v1/spaces/{spaceId}/activity
GET  /api/v1/spaces/{spaceId}/notifications
GET  /api/v1/spaces/{spaceId}/notifications/unread-count
POST /api/v1/spaces/{spaceId}/notifications/{notificationId}/read
POST /api/v1/spaces/{spaceId}/notifications/read-all
POST /api/v1/spaces/{spaceId}/thinking-of-you
```

API DTOs carry stable kinds, IDs, timestamps and bounded currently-authorized presentation references. They do not expose raw Outbox payloads, PushDelivery internals or provider details.

## Business / freemium classification

M4-B promotes these v1 classifications:

| Capability | Classification | Rationale |
|---|---|---|
| Basic shared Activity feed | **Free/Core** | Everyday awareness is part of the couple Core and uses already-owned relationship data. |
| Basic in-app Notifications/read state | **Free/Core** | Normal engagement state must not require Premium. |
| `Ich denke an dich` basic content-free nudge | **Free/Core** | Lightweight partner interaction is an everyday Core behavior, not advanced automation. |
| Basic push delivery when infrastructure is configured | **Free/Core capability** | Transport availability may differ by operating model/configuration, but there is no Premium entitlement gate in M4-B. |
| Advanced digests, routing, rich preview customization, complex notification automation | **Future Mixed/Premium candidate** | Additional automation/presentation may be classified later through #262; runtime entitlement enforcement belongs to M6 under ADR 0006. |

Cloud-managed push has operating cost, but M4-B does not convert that fact into an ad-hoc feature gate. Self-Hosted operators remain responsible for their configured delivery infrastructure.

## Reuse-before-build decision

Reuse review is **relevant** and resolved as follows.

Reuse:

- existing transactional `OutboxEvent` boundary;
- existing safe public event payload approach;
- existing PostgreSQL Job Queue;
- existing `FOR UPDATE SKIP LOCKED` worker claim behavior;
- existing lease/retry/exponential-backoff behavior;
- existing content-free COMMENT_CREATED notification hook as a proven idempotent delivery pattern.

Do not add in M4-B v1 without a new explicit decision:

- Redis;
- Celery;
- Kafka/RabbitMQ;
- a second event store;
- a generic notification SaaS dependency inside Domain code;
- copied plaintext Activity documents.

A concrete push provider/SDK can be selected later at the infrastructure adapter boundary without changing the Domain/API contract.

## Runtime delivery sequence

After this S0 package merges:

1. **M4-B-S1 — Activity + in-app Notification foundation**
   - persistence/migrations;
   - Outbox projector;
   - controlled event catalog;
   - Activity/Notification APIs;
   - read/unread and cursor behavior;
   - privacy tests;
   - OpenAPI/generated clients.
2. **M4-B-S2 — `Ich denke an dich` + PushDelivery boundary**
   - idempotent send command;
   - cooldown/rate safeguards;
   - recipient Notification generation;
   - provider-neutral PushDelivery/worker adapter boundary;
   - Self-Hosted unconfigured behavior;
   - safe generic push contract.
3. **M4-B-S3 — integrated evidence**
   - Cross-Tenant/OWNER_ONLY/privacy-transition tests;
   - retry/idempotency/worker-crash tests;
   - unread-count/read-state concurrency evidence;
   - representative query/performance evidence;
   - OpenAPI/generated-client consistency;
   - normal CI/Security/Self-Hosted evidence and status sync.

Full Web/Android screen productization and systematic parity remain M5.

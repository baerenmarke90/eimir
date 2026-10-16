# M4-B Activity and Notification Privacy/Test Matrix

**Status:** binding evidence contract for M4-B runtime  
**As of:** August 30, 2026  
**Owning readiness issue:** #276

This matrix defines the minimum negative, consistency, privacy and delivery evidence required by M4-B runtime slices.

A passing happy-path Activity/Notification screen is not sufficient.

## Core invariants

1. Activity is a shared Space projection and never includes `OWNER_ONLY` content.
2. Notifications are recipient state, not access grants.
3. PushDelivery is technical delivery state and never a plaintext relationship-content store.
4. Current authorization is re-evaluated before Activity/Notification projection.
5. Partner-private data cannot influence rows, counts, cursors, previews, push payloads, logs or retry metadata.
6. Worker retry cannot create duplicate logical Activity/Notification effects.
7. A rollback cannot create an engagement projection.
8. A privacy transition becomes effective for reads immediately after the source transaction commits, even if stale projection cleanup is asynchronous.

## Required evidence by area

| Area | Required case | Required result |
|---|---|---|
| Tenant isolation | Account from Space B lists Space A Activity | Privacy-safe deny; no row/count/cursor leakage. |
| Tenant isolation | Account from Space B lists/reads/mutates Space A Notifications | Privacy-safe deny; no recipient or target leakage. |
| Membership | Inactive/removed member lists Activity/Notifications | No access after Membership becomes inactive. |
| Activity source | Shared Memory create | Exactly one authorized Activity row after projection. |
| Activity source | Shared Milestone create | Exactly one authorized Activity row. |
| Activity source | SHARED HeartMoment create | Exactly one authorized Activity row. |
| Activity source | Wish/Plan/Place/Chapter/Collection create | Controlled catalog only; exactly the decided Activity kind. |
| Activity source | Plan completion | One completion Activity; retries do not duplicate it. |
| Activity source | Comment on shared target | One controlled Activity and recipient Notification where enabled. |
| Activity exclusion | PRIVATE HeartMoment create | No partner Activity row, count influence, cursor entry or Notification. |
| Activity exclusion | PrivateNote/GiftIdea/PrivateCollection mutation | No shared Activity or partner Notification. |
| Activity exclusion | edit/reorder/item-completion event outside catalog | No Activity generated merely because an Outbox event exists. |
| Activity exclusion | technical Job/Outbox/Audit/Auth event | Never user-visible. |
| Projection rollback | Domain transaction rolls back after event construction | No committed Outbox event and therefore no Activity/Notification. |
| Projection retry | Same Outbox event processed twice | Unique logical Activity/Notification result. |
| Ordering | equal `occurredAt` values | Deterministic ID tie-break; stable keyset traversal. |
| Cursor | tampered Activity cursor | Stable validation error; no fallback to unsafe pagination. |
| Cursor | Activity cursor replayed by another Account/Space | Rejected due Account/Space binding. |
| Source deletion | referenced shared content deleted | No stale content/title/existence leak through Activity projection. |
| Privacy transition | SHARED HeartMoment becomes PRIVATE | Partner Activity/Notification disappears from readable projection immediately; owner authorization remains correct. |
| Notification recipient | actor creates notification-worthy event | Actor is not notified unless explicit event contract says otherwise. |
| Notification recipient | unrelated/non-member Account ID supplied/manipulated | Server recipient derivation prevents arbitrary delivery. |
| Notification idempotency | projector retry | Unique recipient+source-event+kind logical Notification. |
| Read state | recipient marks own unread Notification read | `readAt` set from server clock exactly once. |
| Read state | mark same Notification read again | Idempotent success; original `readAt` retained. |
| Read state | partner attempts to mark recipient Notification | Privacy-safe deny. |
| Mark all | notification committed before transaction cutoff | Marked read. |
| Mark all | notification committed after cutoff | Remains unread. |
| Unread count | stale target becomes non-readable | Does not influence unread count. |
| Target open | Notification points to deleted target | No stale payload; normal current authorization governs target access. |
| Target open | Notification points to now-private target | Partner cannot use Notification as an access grant. |
| Thinking-of-you | valid active partner sends with new request ID | One recipient Notification, no Activity row. |
| Thinking-of-you | same request ID retried | Same logical send; no duplicate Notification. |
| Thinking-of-you | second new send within cooldown | Rate/abuse response; no second logical Notification. |
| Thinking-of-you | no other active partner | No event/Notification generated. |
| Thinking-of-you | arbitrary recipient manipulation attempt | Impossible by contract; recipient is server-derived. |
| Push privacy | notification with sensitive target content | Push request contains no protected target plaintext. |
| Push privacy | PRIVATE target event | No partner PushDelivery record or provider call. |
| Push retry | provider transient failure | Existing Job Queue retry/backoff used with stable logical delivery identity. |
| Push retry | worker crash after provider call before local success | Retry cannot create a second logical PushDelivery record; stable provider idempotency key reused where supported. |
| Push unavailable | Self-Hosted has no push provider configured | In-app Notification remains functional; no fatal dependency or Premium error. |
| Provider error | remote error body includes echoed/request data | Stored/logged failure is sanitized/bounded; no raw protected content. |
| Logs | validation/authorization/error paths | No relationship plaintext, push token or private target data in logs. |
| Metrics | latency/count metrics | No query/user content and no resource IDs as metric labels. |

## SQL/PostgreSQL evidence

Runtime evidence must include real PostgreSQL tests for:

- uniqueness/idempotency constraints;
- recipient/Space authorization predicates;
- read/unread updates;
- mark-all cutoff semantics;
- keyset pagination stability;
- source-authorization joins used to suppress stale/private projections;
- concurrent projector processing of the same source event;
- concurrent mark-read/mark-all/new-notification behavior.

SQLite-only or mocked repository tests are insufficient for these persistence semantics.

## HTTP evidence

At least one integrated HTTP + PostgreSQL scenario must prove:

1. partner A creates shared content;
2. the committed source event is projected;
3. partner B sees the allowed Activity/Notification;
4. partner B can update only their own Notification state;
5. source privacy changes or deletion occur;
6. partner B immediately stops receiving any now-forbidden projection metadata;
7. cross-Space Account C never sees rows/counts/cursor state.

A second integrated scenario must prove `Ich denke an dich` idempotency and recipient derivation across the real API boundary.

## Push evidence

A real commercial push provider is not required for S0 or for provider-neutral unit evidence.

Before a concrete provider is enabled, tests must use a deterministic adapter/fake at the provider boundary to prove:

- generic payload shape;
- no ProtectedPayload content;
- stable idempotency key;
- retry/backoff interaction;
- Self-Hosted unconfigured behavior.

A later concrete provider integration must add provider-specific contract/integration tests without weakening these invariants.

## Performance evidence

M4-B runtime must demonstrate:

- keyset pagination rather than offset pagination;
- bounded list sizes (default 25, maximum 50);
- indexed lookup for Space/recipient/unread/order paths;
- no N+1 ProtectedPayload fetch across a page;
- controlled event mapping rather than scanning arbitrary Outbox payload structures;
- bounded projector and worker batches.

No performance optimization may cache or denormalize private plaintext into Activity/Notification rows.

## Business/freemium evidence

Runtime PRs must explicitly reconfirm:

- basic Activity = Free/Core;
- basic in-app Notification/read state = Free/Core;
- basic `Ich denke an dich` = Free/Core;
- push capability has no M4 entitlement gate;
- Self-Hosted push configuration differences are operating-model differences, not hidden commercial restrictions;
- technical rate/page limits are not product quotas.

If a later change introduces advanced notification/digest automation or another Premium boundary, the versioned product decision must be updated before runtime gating.

## Evidence closure rule

M4-B cannot be considered complete while any of the following is unproven:

- Cross-Tenant isolation;
- `OWNER_ONLY` non-generation/non-influence;
- source privacy-transition behavior;
- notification recipient isolation;
- unread-count correctness;
- projector idempotency;
- safe push payload/content boundary;
- `Ich denke an dich` idempotency/cooldown;
- PostgreSQL concurrency semantics;
- published OpenAPI/generated-client consistency for delivered routes.

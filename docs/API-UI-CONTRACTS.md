# eimir. API/UI Contracts

**Status:** Binding integration foundation  
**Version:** 1.0  
**As of:** August 24, 2026

This document defines the shared language between the REST API, React WebApp,
and Android app. OpenAPI under `/api/v1` remains the executable contract; this
file defines how domain and technical states are interpreted and represented in
both clients.

## 1. Sources and precedence

If sources conflict, the following order applies:

1. Clean-Room Master Specification.
2. Product specification and security invariants.
3. Published OpenAPI contract.
4. This document and UX documentation.
5. Platform-specific implementation details.

A client must not introduce a domain rule that exists only locally.

## 2. Transport conventions

| Topic | Contract |
|---|---|
| Base | HTTPS, REST, `/api/v1/...` |
| Format | JSON |
| External field names | `camelCase` |
| Persistent IDs | non-enumerable UUIDv7 encoded as string |
| Technical timestamp | RFC 3339/ISO 8601 with time zone, server-side UTC |
| Domain date | `YYYY-MM-DD`, no time zone |
| Create | 201 |
| Read | 200 |
| Update | 200 |
| Delete | 204 |
| Validation | 400 or 422 according to OpenAPI |
| Unauthenticated | 401 |
| Forbidden | 403, except privacy-safe 404 |
| Not found / hidden | 404 |
| Version conflict | 409 |
| Rate limit | 429 |

- Android authenticates API calls with a short-lived Bearer token and a securely
  stored rotating session.
- Credentials, tokens, and invitation values never appear in URLs after flow
  completion, analytics, crash data, or logs.
- Clients use only OpenAPI fields; unknown additional fields are ignored
  tolerantly.
- Removing or changing the meaning of published fields is not compatible within
  v1.

## 3. Shared types

The following TypeScript-like definitions describe semantics, not a particular
generated file.

```ts
type UUID = string;
type Instant = string;  // RFC 3339, e.g. 2026-08-24T10:15:30Z
type LocalDate = string; // YYYY-MM-DD

type PrivacyClass =
  | "SPACE_SHARED"
  | "OWNER_ONLY"
  | "TEMPORARY_SHARED"
  | "EPHEMERAL_CONTEXT"
  | "SYSTEM_METADATA";

interface EntityMeta {
  id: UUID;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}

interface SpaceResourceMeta extends EntityMeta {
  spaceId: UUID;
  privacyClass: PrivacyClass;
  authorId?: UUID;
}
```

`spaceId` and authorization information in the DTO never replace server-side
Membership and tenant checks.

## 4. Privacy classes and UI mapping

The UI labels below are intentional de-DE product copy.

| API value | Domain meaning | Regular de-DE UI label | Client behavior |
|---|---|---|---|
| `SPACE_SHARED` | both active partners in the Space | Für uns beide | visible in the shared area |
| `OWNER_ONLY` | owner exclusively | Nur für mich | never request, cache, or indirectly display for the partner |
| `TEMPORARY_SHARED` | time-limited sharing | Zeitlich geteilt | display only after domain behavior and expiry are specified |
| `EPHEMERAL_CONTEXT` | short-lived context with expiry | context-dependent | do not represent as persistent content |
| `SYSTEM_METADATA` | technical non-user content | no end-user label | use only for necessary system functions |

- Simplified UI states `private` and `shared` are presentation values, not API
  enums.
- `public` is not an allowed value.
- Not every domain supports changing its privacy class.
- Memory, Wish, and Plan are `SPACE_SHARED` in the current Core; private content
  uses dedicated owner-only domains.
- HeartMoment supports `OWNER_ONLY` and `SPACE_SHARED`.

## 5. Problem Details

Every API error uses a Problem-Details-like schema:

```json
{
  "type": "validation_error",
  "title": "Invalid request",
  "status": 400,
  "detail": "The title must not be empty.",
  "code": "MEMORY_TITLE_REQUIRED",
  "requestId": "0191...",
  "fieldErrors": [
    { "field": "title", "code": "REQUIRED", "message": "Titel fehlt." }
  ]
}
```

The `fieldErrors[].message` value above is intentional de-DE product copy.

### Required and optional fields

| Field | Required | Use |
|---|---:|---|
| `type` | yes | coarse machine-readable category |
| `title` | yes | short technical default summary |
| `status` | yes | HTTP status |
| `detail` | yes | safe, understandable explanation |
| `code` | yes | stable domain error code |
| `requestId` | recommended | support correlation, not a resource ID |
| `fieldErrors` | for field errors | direct form-field mapping |

- UI logic branches on `code` and `status`, never on translated `detail`.
- Clients may display safe localized text based on stable codes.
- `detail` does not reveal existence or metadata of foreign/private resources.
- Unknown codes fall back to a safe generic message with a retry/support path.

## 6. Error-to-UI mapping

| Status | Client state | User response |
|---:|---|---|
| 400/422 | field or form error | preserve input and show error inline |
| 401 | invalid session | secure re-authentication while preserving destination context |
| 403 | known missing capability | explain prerequisite; no retry loop |
| 404 | unavailable | neutral state without confirming existence |
| 409 | version conflict | load current version and require a conscious decision |
| 413/415 | media not allowed | explain/remove affected file |
| 429 | rate limit | show wait time and bound automatic retries |
| 5xx | temporary service failure | preserve existing data and offer retry |
| network error | offline/interrupted | no success; Android may show authorized read cache |

## 7. Optimistic concurrency

Mutable resources carry `version`.

```ts
interface UpdateCommand<T> {
  version: number;
  changes: T;
}
```

- The client sends the last loaded version according to OpenAPI, for example as
  a field or `If-Match`.
- On 409, nothing is marked locally as saved.
- Conflict responses contain only content that the current account remains
  authorized to access.
- Web invalidates the affected TanStack Query; Android updates read cache only
  after a successful authorized response.
- Delete, privacy changes, and Membership states are never merged
  automatically.

## 8. Cursor pagination

Story and other growing lists use cursors rather than page numbers:

```ts
interface CursorPage<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
```

- The cursor is opaque and is not interpreted.
- Filters, sorting, and search parameters are part of cache identity.
- A cursor from another filter context is not reused.
- Private filtering happens server-side before pagination and result counting.
- Duplicate IDs encountered during incremental loading are merged by `id`
  without overwriting a newer `version`.

## 9. Derived views

Story, Dashboard, the de-DE product feature **„Weißt du noch?“**, and recaps are
Read Models, not independently editable resources.

```ts
type StoryItem =
  | { kind: "MEMORY"; item: MemorySummary }
  | { kind: "HEART_MOMENT"; item: SharedHeartMomentSummary }
  | { kind: "MILESTONE"; item: MilestoneSummary };
```

- A StoryItem links to the original resource.
- `OWNER_ONLY` content is viewer-authorized in Story (#1021): it appears in its
  own author's Timeline, never in the partner's.
- Empty statistics blocks may be omitted; clients do not expect artificial
  zero-value cards.
- Read Models contain the minimum information required for the view.

## 10. Capabilities instead of UI guessing

When domain permissions vary, the API exposes explicit capabilities:

```ts
interface ResourceCapabilities {
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  canChangePrivacy: boolean;
}
```

- Capabilities improve presentation but are not authorization; the server
  rechecks every action.
- Clients do not derive authorization from author name, color, or visible
  buttons.
- Unavailable actions are hidden or explained depending on whether the feature
  remains generally relevant.

## 11. Network and cache contract

```ts
type DataFreshness = "LIVE" | "STALE_CACHE";
type WriteAvailability = "AVAILABLE" | "OFFLINE_BLOCKED" | "SESSION_BLOCKED";
```

### Android MVP

- Room acts as an authorized read cache.
- `STALE_CACHE` shows the last successful state and its age/time reference.
- Offline writes, a local Outbox, and automatic later synchronization are
  **not** part of the MVP.
- A form draft may be retained locally but is not represented as a domain
  object or marked `synced`.
- Account sign-out, session revocation, and Space changes handle cache and
  drafts according to the security model.

### Web

- Query caches are transient presentation caches, not a second source of truth.
- After mutations, affected query keys are invalidated deliberately.
- Sensitive content is not persisted in the browser without a separate explicit
  decision.

## 12. Upload contract

Whether using a direct authorized route or a signed upload, the UI needs these
states:

```ts
type UploadState =
  | "SELECTED"
  | "VALIDATING"
  | "UPLOADING"
  | "PROCESSING"
  | "READY"
  | "FAILED";
```

An Attachment DTO contains at least a stable ID, status, safe media type, size,
optional dimensions, and an authorized retrieval mechanism. The original
filename is never the storage key and is not used for authorization.

## 13. Authentication and invitation contract

- Authentication methods are adapters around the same Account/Session core.
- Android sessions can be revoked individually and rotate refresh tokens.
- An Invitation has status, expiry, revocation, and single-use redemption.
- Invitation errors distinguish stable internal codes for `EXPIRED`, `REVOKED`,
  `USED`, `SPACE_FULL`, and `INVALID`; the UI reveals no additional Space data.
- Concurrent acceptances are resolved atomically server-side.

## 14. Feature configuration and entitlement

Technical enablement and commercial entitlement remain separate:

```ts
interface FeatureAccess {
  enabled: boolean;
  entitled: boolean;
  reason?: "NOT_CONFIGURED" | "NOT_ENTITLED" | "NOT_AVAILABLE";
}
```

The client does not show a pricing-related explanation when a feature is
technically unconfigured, or a technical configuration explanation when the
problem is entitlement.

## 15. Analytics contract

Every UI event has this form:

```ts
interface AnalyticsEvent {
  name: string;
  schemaVersion: number;
  platform: "web" | "android";
  appVersion: string;
  result?: "success" | "failure" | "cancelled";
  errorCode?: string;
}
```

Not included: free text, search text, email, partner name, resource ID, token,
exact private dates, filename, media content, preference values, or precise
location.

## 16. Contract delivery

- Backend publishes OpenAPI from the actual API code.
- Web and Android generate or wrap models from the same OpenAPI version.
- Contract tests verify example responses, error codes, privacy classes, and
  tolerance of unknown fields.
- Every domain receives cross-tenant and owner-only tests before client release.
- Mock data uses synthetic content only.
- Breaking changes require a new API version or a documented migration.

## 17. Definition of Done

An API feature is UI-ready only when:

- OpenAPI describes request, response, and error codes,
- UUID, date, timestamp, privacy class, and `version` are modeled correctly,
- 401, privacy-safe 404, 409, 429, and network failures are handled in the
  client,
- cursor/cache behavior is defined,
- Web and Android expose the same domain validation,
- analytics and logs receive no sensitive content,
- tenant, owner-only, and upload tests exist,
- offline writes are not falsely implied in the MVP.

## Related documents

- [Architecture](./ARCHITECTURE.md)
- [Security](./SECURITY.md)
- [User Flows](./USER-FLOWS.md)
- [Component Contracts](./COMPONENT-CONTRACTS.md)
- [Content and Privacy Guidelines](./CONTENT-PRIVACY-GUIDELINES.md)

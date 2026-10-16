# M2 API Design

**Status:** binding pre-runtime contract after M2-S0 #70  
**Version:** 2.0

This document freezes routes, DTO names, Concurrency, and Pagination semantics for M2. The machine-readable planning source is `API-CONTRACT.json`. `backend/openapi.json` remains exclusively the contract generated from actually implemented FastAPI code and is updated only with the respective runtime slice. This prevents pretending that Runtime endpoints already exist.

## 1. Global rules

- Base: `/api/v1/spaces/{spaceId}/...`.
- external JSON fields: `camelCase`.
- persistent IDs: UUIDv7 strings.
- Authentication and active Membership are checked before every Space resource.
- foreign or Privacy-protected resources return neutral `404`.
- `visibility` is the public Domain value; `privacyClass` is internal and is neither writable nor a normally exposed client field.
- all mutable resources have `version` and return `ETag`.
- `PATCH`/`DELETE` and explicit relation/Privacy mutations require `If-Match`.
- stale `If-Match` returns `409 RESOURCE_VERSION_CONFLICT`.
- Problem Details and stable `code` values follow the existing API style.
- domain calendar days use `YYYY-MM-DD`; technical timestamps are UTC instants.
- Collection and Story pages use opaque Keyset Cursors.

## 2. Binding route catalog

### Memory

| Method | Route | operationId | Request | Response |
|---|---|---|---|---|
| POST | `/spaces/{spaceId}/memories` | `createMemory` | `MemoryCreate` | `201 MemoryDetail` |
| GET | `/spaces/{spaceId}/memories` | `listMemories` | `cursor?`, `limit?`, `year?` | `MemoryPage` |
| GET | `/spaces/{spaceId}/memories/{memoryId}` | `getMemory` | – | `MemoryDetail` |
| PATCH | `/spaces/{spaceId}/memories/{memoryId}` | `updateMemory` | `If-Match`, `MemoryUpdate` | `MemoryDetail` |
| DELETE | `/spaces/{spaceId}/memories/{memoryId}` | `deleteMemory` | `If-Match` | `204` |
| PUT | `/spaces/{spaceId}/memories/{memoryId}/attachments` | `replaceMemoryAttachments` | `If-Match`, `MemoryAttachmentSet` | `MemoryDetail` |

`MemoryCreate` contains **no** Attachments in S2; the relation endpoint is implemented only with the Media integration slice. The contract is nevertheless fixed now.

### HeartMoment

| Method | Route | operationId | Request | Response |
|---|---|---|---|---|
| POST | `/spaces/{spaceId}/heart-moments` | `createHeartMoment` | `HeartMomentCreate` | `201 HeartMomentDetail` |
| GET | `/spaces/{spaceId}/heart-moments` | `listHeartMoments` | `cursor?`, `limit?`, `visibility?` | `HeartMomentPage` |
| GET | `/spaces/{spaceId}/heart-moments/{heartMomentId}` | `getHeartMoment` | – | `HeartMomentDetail` |
| PATCH | `/spaces/{spaceId}/heart-moments/{heartMomentId}` | `updateHeartMoment` | `If-Match`, `HeartMomentUpdate` | `HeartMomentDetail` |
| PATCH | `/spaces/{spaceId}/heart-moments/{heartMomentId}/visibility` | `changeHeartMomentVisibility` | `If-Match`, `HeartMomentVisibilityChange` | `HeartMomentDetail` |
| DELETE | `/spaces/{spaceId}/heart-moments/{heartMomentId}` | `deleteHeartMoment` | `If-Match` | `204` |

`SHARED -> PRIVATE` is the atomic Privacy operation defined in #68. Private HeartMoments are visible only to the owner. #1021 superseded M2-D22: a private HeartMoment now remains a Story item in its owner's own Timeline (never the partner's) — see section 4.

### Milestone

| Method | Route | operationId | Request | Response |
|---|---|---|---|---|
| POST | `/spaces/{spaceId}/milestones` | `createMilestone` | `MilestoneCreate` | `201 MilestoneDetail` |
| GET | `/spaces/{spaceId}/milestones` | `listMilestones` | `cursor?`, `limit?`, `year?` | `MilestonePage` |
| GET | `/spaces/{spaceId}/milestones/{milestoneId}` | `getMilestone` | – | `MilestoneDetail` |
| PATCH | `/spaces/{spaceId}/milestones/{milestoneId}` | `updateMilestone` | `If-Match`, `MilestoneUpdate` | `MilestoneDetail` |
| DELETE | `/spaces/{spaceId}/milestones/{milestoneId}` | `deleteMilestone` | `If-Match` | `204` |

### Attachment

| Method | Route | operationId | Request | Response |
|---|---|---|---|---|
| POST | `/spaces/{spaceId}/attachments` | `createAttachmentUpload` | `AttachmentUploadCreate` | `201 UploadDescriptor` |
| PUT | `/spaces/{spaceId}/attachments/{attachmentId}/content` | `uploadAttachmentContent` | LocalMediaStore Stream | `204` |
| POST | `/spaces/{spaceId}/attachments/{attachmentId}/finalize` | `finalizeAttachmentUpload` | `AttachmentFinalize` | `202 AttachmentDetail` |
| GET | `/spaces/{spaceId}/attachments/{attachmentId}` | `getAttachment` | – | `AttachmentDetail` |
| POST | `/spaces/{spaceId}/attachments/{attachmentId}/read-access` | `createAttachmentReadAccess` | `AttachmentReadRequest` | `ReadDescriptor` |
| DELETE | `/spaces/{spaceId}/attachments/{attachmentId}` | `deleteAttachment` | `If-Match` | `204` |

`uploadAttachmentContent` is allowed only for a `STREAM` descriptor. With S3, `createAttachmentUpload` returns a `SIGNED_UPLOAD` descriptor. `finalize` means only acceptance for asynchronous validation, not `READY`.

### Comment

Create/List are deliberately nested under the parent; Update/Delete are Space-scoped by Comment ID.

| Method | Route | operationId |
|---|---|---|
| POST | `/spaces/{spaceId}/memories/{memoryId}/comments` | `createMemoryComment` |
| GET | `/spaces/{spaceId}/memories/{memoryId}/comments` | `listMemoryComments` |
| POST | `/spaces/{spaceId}/heart-moments/{heartMomentId}/comments` | `createHeartMomentComment` |
| GET | `/spaces/{spaceId}/heart-moments/{heartMomentId}/comments` | `listHeartMomentComments` |
| POST | `/spaces/{spaceId}/milestones/{milestoneId}/comments` | `createMilestoneComment` |
| GET | `/spaces/{spaceId}/milestones/{milestoneId}/comments` | `listMilestoneComments` |
| PATCH | `/spaces/{spaceId}/comments/{commentId}` | `updateComment` |
| DELETE | `/spaces/{spaceId}/comments/{commentId}` | `deleteComment` |

Create uses `CommentCreate { body }`; Lists use `cursor?`, `limit?`; Update uses `If-Match` + `CommentUpdate`; Delete uses `If-Match`. A client sends neither `targetType` nor `targetId` in the Body; the parent is determined exclusively by the route.

### Story

| Method | Route | operationId |
|---|---|---|
| GET | `/spaces/{spaceId}/timeline` | `getStoryTimeline` |

G2 filters:

- `type`: repeatable Query parameter from `MEMORY | HEART_MOMENT | MILESTONE`.
- `year`: `1900..2100`.
- `order`: `DESC` by default, alternatively `ASC`.
- `cursor`: opaque.
- `limit`: default `50`, maximum `100`.

`q` is **not** part of the M2/G2 contract and remains M4 Search.

## 3. DTOs

### Shared

```ts
interface AuthorSummary {
  id: UUID;
  displayName: string;
  profileAttachmentId?: UUID;
}

interface ResourceCapabilities {
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
}
```

Capabilities are UX assistance, not an Authorization source.

### Memory

```ts
interface MemoryCreate {
  title: string;
  body: string;
  happenedOn?: LocalDate;
}

interface MemoryUpdate {
  title?: string;
  body?: string;
  happenedOn?: LocalDate | null;
}

interface MemoryDetail {
  id: UUID;
  spaceId: UUID;
  authorId: UUID;
  title: string;
  body: string;
  happenedOn?: LocalDate;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  author: AuthorSummary;
  attachments: AttachmentSummary[];
  capabilities: ResourceCapabilities;
}

interface MemoryAttachmentSet {
  attachments: Array<{ attachmentId: UUID; position: number }>;
}
```

`authorId`, `spaceId`, `version`, and Capabilities are not writable. Partners read shared Memories; Update/Delete remain author-only.

### HeartMoment

```ts
type HeartEmotion = "LOVED" | "SEEN" | "APPRECIATED" | "SUPPORTED" | "GRATEFUL" | "HAPPY";
type HeartVisibility = "SHARED" | "PRIVATE";

interface HeartMomentCreate {
  text: string;
  emotion: HeartEmotion;
  visibility: HeartVisibility;
  happenedOn: LocalDate;
  attachmentId?: UUID;
}

interface HeartMomentUpdate {
  text?: string;
  emotion?: HeartEmotion;
  happenedOn?: LocalDate;
  attachmentId?: UUID | null;
}

interface HeartMomentVisibilityChange { visibility: HeartVisibility; }
```

`privacyClass` is neither written nor published as a regular DTO field. `visibility` is the single Domain-level client truth.

### Milestone

```ts
interface MilestoneCreate { title: string; body?: string; happenedOn: LocalDate; }
interface MilestoneUpdate { title?: string; body?: string | null; happenedOn?: LocalDate; }
```

### Comment

```ts
interface CommentCreate { body: string; }
interface CommentUpdate { body: string; }
interface CommentDetail {
  id: UUID;
  spaceId: UUID;
  authorId: UUID;
  body: string;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
  author: AuthorSummary;
}
```

### Attachment

Public status is limited to states meaningful to clients:

```ts
type AttachmentStatus = "PENDING" | "PROCESSING" | "READY" | "FAILED";

interface AttachmentSummary {
  id: UUID;
  status: AttachmentStatus;
  mediaType: "IMAGE" | "VIDEO";
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  version: number;
  createdAt: Instant;
}

interface UploadDescriptor {
  attachment: AttachmentSummary;
  method: "STREAM" | "SIGNED_UPLOAD";
  uploadUrl: string;
  expiresAt?: Instant;
  requiredHeaders: Record<string, string>;
}

interface ReadDescriptor {
  method: "STREAM" | "SIGNED_URL";
  url: string;
  expiresAt?: Instant;
}
```

Internal states such as `VALIDATING`, `DELETING`, `DELETE_FAILED`, Storage Keys, Bucket names, Providers, filesystem paths, and credentials are not client fields.

`AttachmentReadRequest` contains the authorized parent reference as a closed object:

```ts
type AttachmentReadRequest =
  | { parentType: "MEMORY"; parentId: UUID }
  | { parentType: "HEART_MOMENT"; parentId: UUID }
  | { parentType: "NONE" };
```

The server revalidates parent, Space, and Privacy; a parent reference is not a Capability Token.

`parentType: "NONE"` represents the owner's own, still-unbound upload within the binding window from M2-D20 (M2-D24). It is not an Authorization shortcut: the server requires owner identity, `READY`, and an unexpired window. For a bound Attachment this variant is invalid — only parent reachability applies there.

## 4. Story union

```ts
type StoryItem =
  | { kind: "MEMORY"; effectiveDate: LocalDate; memory: MemorySummary }
  | { kind: "HEART_MOMENT"; effectiveDate: LocalDate; heartMoment: SharedHeartMomentSummary }
  | { kind: "MILESTONE"; effectiveDate: LocalDate; milestone: MilestoneSummary };
```

`SharedHeartMomentSummary` keeps its established name (renaming would only
churn every generated client for no behavioral gain), but it is no longer
shared-only: #1021 superseded M2-D22 and added `visibility: "SHARED" |
"PRIVATE"` reporting the item's real domain visibility. A caller's own
`PRIVATE` HeartMoment is projected here at its ordinary Timeline position;
the server never projects a `PRIVATE` HeartMoment belonging to the partner.

## 5. Story ordering and Cursor — M2-D08

`effectiveDate` is determined per resource as:

1. domain `happenedOn`, when present,
2. otherwise the UTC calendar date of `createdAt`.

Canonical sort key:

```text
(effectiveDate, createdAt, kindRank, id)
```

with `kindRank`: `MEMORY=1`, `HEART_MOMENT=2`, `MILESTONE=3`.

- `DESC`: all four keys descending.
- `ASC`: all four keys ascending.
- Keyset Pagination uses strict `>` or `<` on the complete tuple, never Offset.
- Tenant and Privacy filters are applied **before** sorting and Cursor comparison.
- identical date/time values produce neither tie duplicates nor tie gaps because of `kindRank + id`.

Cursor format is opaque to clients. Server-side, version 1 encodes at least:

```json
{
  "v": 1,
  "order": "DESC",
  "filterHash": "...",
  "effectiveDate": "2026-08-25",
  "createdAt": "2026-08-25T07:00:00Z",
  "kind": "MEMORY",
  "id": "..."
}
```

The Cursor is integrity-protected/signed and bound to Space, requesting Account, `type`, `year`, `order`, and the filter context independent of `limit`. The Account binding was added by #1021: since the Timeline became viewer-authorized, two Accounts in the same Space can have different authorized result sets, so a Cursor minted for one Account must not be redeemable by the other even though Space and filters match. A Cursor from another Space or Account, or with changed filters, is neutrally rejected as `400 INVALID_CURSOR`. `limit` may be reduced/increased between pages without changing the logical continuation point.

With concurrent domain changes to sort fields, no historical snapshot is promised; clients may reload after Refresh. The invariant "no tie duplicates/gaps" applies to an unchanged sorted dataset between two pages.

## 6. Collection Pagination

Memories, Milestones, HeartMoments, and Comments use the same base Cursor contract. The concrete sort key is documented per Collection but is at minimum made unique by `createdAt, id`. Default `limit=50`, maximum `100`.

## 7. Error codes

Binding M2 codes:

| Code | HTTP | Meaning |
|---|---:|---|
| `RESOURCE_NOT_FOUND` | 404 | neutrally not visible/not present |
| `RESOURCE_VERSION_CONFLICT` | 409 | stale If-Match |
| `INVALID_CURSOR` | 400 | manipulated, foreign context, or incompatible version |
| `ATTACHMENT_TYPE_NOT_ALLOWED` | 415 | not in allowlist |
| `ATTACHMENT_TOO_LARGE` | 413 | server-side limit exceeded |
| `ATTACHMENT_VALIDATION_FAILED` | 422 | Media validation failed |
| `ATTACHMENT_NOT_READY` | 409 | Bind/Read before READY |
| `ATTACHMENT_ALREADY_LINKED` | 409 | exclusive binding violated |
| `ATTACHMENT_LIMIT_EXCEEDED` | 409 | parent cardinality/total size violated |
| `COMMENT_TARGET_NOT_AVAILABLE` | 404 | parent not visible/not commentable |
| `RATE_LIMITED` | 429 | existing Rate Limit convention |

Pydantic form validation remains `422` with the existing Problem Details transport. Privacy-relevant errors must not contain existence/count/metadata leaks.

## 8. OpenAPI handoff

`API-CONTRACT.json` is a pre-runtime manifest, not a second production OpenAPI document. The CI test checks:

- unique operationIds and methods/routes,
- Space-scoped paths,
- mandatory If-Match for mutable resources,
- Story filters and Cursor contract,
- exclusion of `q` from G2,
- exclusion of `privacyClass` from client write fields,
- exclusion of internal Storage fields from Attachment descriptors,
- no PRIVATE Story variant.

For each runtime slice, the implemented FastAPI contract in `backend/openapi.json` must be aligned exactly with the manifest operations belonging to that slice. `backend/openapi.json` continues to be generated exclusively with `uv run python scripts/openapi_contract.py write`.

## Related documents

- [API Contract Manifest](./API-CONTRACT.json)
- [Domain Model](./DOMAIN-MODEL.md)
- [Media Pipeline](./MEDIA-PIPELINE.md)
- [Security Test Matrix](./SECURITY-TEST-MATRIX.md)
- [Decision Log](./DECISION-LOG.md)

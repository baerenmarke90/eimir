# M2 Security & Privacy Test Matrix

**Status:** binding acceptance matrix for the implemented M2/G2 runtime  
**As of:** August 29, 2026

This matrix supplements the general Security and HTTP tests with the domain risks of Memories, HeartMoments, Milestones, Comments, Story, and Attachments. Tests are generally executed through the public API; Repository-only tests are insufficient for Authorization.

The implemented M2/G2 media boundary is **image-only**. MP4 and QuickTime are intentionally rejected fail-closed with `ATTACHMENT_TYPE_NOT_ALLOWED` and cannot reach `READY`. The video parameters recorded in M2-D04/M2-D15 are retained only as earlier target-design input; they are not current M2/G2 acceptance criteria. Issue #88 is the authoritative tracker for any future video implementation and requires a fresh Architecture/Security slice before those target parameters can become runtime acceptance criteria.

## Test identities

| Code | Role |
|---|---|
| `A` | author and active member of Space Alpha |
| `B` | partner and active member of Space Alpha |
| `C` | active member of another Space Beta |
| `R` | former/revoked member of Space Alpha |
| `X` | authenticated but without Membership |
| `ANON` | unauthenticated |

All IDs are additionally tested with random existing foreign values and formally invalid values. Knowing a UUID never replaces Authorization.

## Expected disclosure behavior

- `401` only for missing or invalid Authentication.
- `404` for invisible or foreign resources when `403` would reveal their existence.
- `403` only where the resource's existence is already legitimately known to the caller.
- Error text, timing, headers, and Response size must not reveal private or foreign content.
- Authorization is applied server-side before projection, counting, Pagination, and URL generation.

## Media abuse — binding M2/G2 runtime values

| ID | Case | Expectation |
|---|---|---|
| MED-01 | allowed file extension, Magic Bytes/MIME not in allowlist | `FAILED`, no normally readable Blob |
| MED-02 | declared MIME differs from server-recognized type | `FAILED`, safe error code, client MIME is not truth |
| MED-03A | image >25 MiB | `FAILED` before `READY` |
| MED-03B | image >40 MP or >12,000 px edge | `FAILED` before `READY` |
| MED-03C | MP4/QuickTime supplied to the current image-only runtime, including files above the earlier 250 MiB / 180 s / 3840×2160 target parameters | reject fail-closed with `ATTACHMENT_TYPE_NOT_ALLOWED`; current runtime does not evaluate video target limits as an acceptance path and never reaches `READY` |
| MED-03D | Memory >20 Attachments or >500 MiB validated total size | reject binding atomically, existing relations unchanged |
| MED-04 | decompression bomb/extreme dimensions | resource limit applies, Worker remains stable, `FAILED` |
| MED-05 | manipulated/broken container | parser failure isolated, `FAILED` |
| MED-06 | original name with path/Unicode control characters | never Storage Key/Authorization; not in standard Logs |
| MED-07 | duplicate/concurrent Finalize | exactly one effective validation job; idempotent result |
| MED-08 | S3 Upload URL older than 10 min/manipulated | Provider access denied; no freely selectable Key |
| MED-09 | S3 Read URL older than 5 min/manipulated | access denied |
| MED-10 | Read URL after Membership/Privacy revocation | no new URL; existing URL at most until 5-minute TTL |
| MED-11 | foreign `storageKey` in Request | field not client-settable or rejected |
| MED-12 | PENDING/UPLOADING/FAILED >24 h | hourly Cleanup marks/deletes idempotently |
| MED-13 | READY unbound >60 min | `DELETING`; owner can no longer bind afterward |
| MED-14 | bind Attachment Alpha → Parent Beta | atomically 404/reject, no leak/relation |
| MED-15 | second parent for already bound Attachment | reject; exclusive binding remains unchanged |
| MED-16 | Bind vs orphan Cleanup concurrently | exactly one operation wins; never a bound deleted Blob |
| MED-17 | Parent Delete vs Finalize/Bind concurrently | no relation to deleted parent; no visible orphan |
| MED-18 | Provider delete timeout | Domain content stays invisible; `DELETE_FAILED`, Retry/metric |
| MED-19 | Local/S3 adapter | identical lifecycle/Authorization contract |
| MED-20 | EXIF/GPS present | stored location-free after `READY`; no unstripped original readable |
| MED-20a | vendor-specific/unknown metadata segment | does not survive ingest; allowlist is fail-closed |
| MED-20b | Media cannot be safely sanitized | `FAILED`; never stored unstripped |
| MED-20c | extracted capture timestamp | ProtectedPayload; absent from Outbox rows, Logs, and metrics |
| MED-20d | variant without parent read permission | not readable; Privacy transition also blocks variant |
| MED-20e | variant generation fails | Attachment remains usable; no `FAILED`, no orphaned variant object |
| MED-21 | unknown type/GIF/RAW/WebM/MKV/document | fail-closed `FAILED` |
| MED-22 | HEIC/HEIF/JPEG/PNG/WebP within limits | validation can reach `READY` |
| MED-23 | MP4/QuickTime within the earlier M2-D04 target parameters | **future/target-only design input:** current runtime rejects with `ATTACHMENT_TYPE_NOT_ALLOWED` and cannot reach `READY`; #88 owns any future implementation |
| MED-24 | S3 Bucket/Public ACL | Deployment/contract test confirms not public |

`MED-03C` and `MED-23` deliberately verify the **current fail-closed boundary**, not video support. The earlier target parameters remain useful only as design history and must be revalidated if #88 is resumed; they do not constitute evidence that G2 includes video.

## Attachment Authorization

At minimum, each Attachment is tested through the following paths:

1. Owner may manage own unbound upload only in PENDING/UPLOADING/VALIDATING/FAILED or READY within 60 minutes.
2. Partner can never read, count, or distinguish an unbound Attachment through errors.
3. After binding, Read follows only the parent.
4. Owner ID alone does not bypass a later parent Privacy restriction.
5. Owner-only HeartMoment leaks neither metadata nor Stream/Read URL to partner.
6. Cross-Space Attachment/parent combination is rejected before relation/URL generation.
7. After final reference/Parent Delete, no new Read URL is issued.
8. Storage Key, Bucket, and Provider details do not appear in user-facing Responses.

## IDOR and Tenant Isolation

| ID | Attack | Expectation |
|---|---|---|
| TEN-01 | `C` reads/changes/deletes Alpha entity by UUID | `404`, no mutation |
| TEN-02 | `A` sets `spaceId=Beta` in Body, Query, or route | reject Request, no implicit rewrite |
| TEN-03 | Comment from Alpha references Target in Beta | atomically reject, no Event |
| TEN-04 | bind Attachment from Alpha to Parent in Beta | atomically reject |
| TEN-05 | use Cursor from Alpha for Beta | neutral error or empty result according to contract, no data |
| TEN-06 | reuse signed URL/Read Token between Spaces | deny or allow only the exactly bound Key within TTL |
| TEN-07 | revoked member requests new Media Read | deny; no new signed URL |
| TEN-08 | case, encoding, and duplicate parameters | canonical and fail-closed |

## Concurrency and transactions

- Two Updates with the same Version: exactly one wins; the other receives `409`.
- Update concurrent with Delete: no reappearance, consistent error behavior.
- Parent Delete concurrent with Attachment Finalize/Bind: no visible orphan and no relation to deleted parent.
- Comment Create concurrent with target privatization or Delete: transaction prevents an invalid Comment.
- Duplicate Create with Idempotency Key: one Domain entity and at most one Outbox Event.
- Domain change plus Outbox: either both commit or both roll back.
- Two Finalize requests: exactly one validation job/terminal consistent state.
- Bind concurrent with READY orphan Cleanup: state/Row Lock prevents binding to deleted Blob.
- Final-reference removal concurrent with Read descriptor: no new Authorization after Domain Delete.

## Owner-only: mandatory paths

For a `PRIVATE` HeartMoment by `A`, `B` must receive exactly no indication in every path below:

1. Direct Read and Update/Delete attempt.
2. Lists, later Search/Filter, and Autocomplete.
3. Story, month groups, Counts, and Cursor.
4. Dashboard, Activity Feed, Recap, and recently changed.
5. Comment target resolution and Comment Lists.
6. Attachment metadata, file Read, Preview, and signed URL.
7. Domain Events, Notifications, Push Preview, and Badge Count.
8. Partner Export, shared Backup, and diagnostic output.
9. Cache Keys, ETags, Logs, Traces, metrics, and Analytics properties.
10. Error behavior with known ID and indirect relation IDs.

A test record contains clearly recognizable Canary values in text, emotion, filename, and Attachment metadata. No Canary may appear outside the owner context.

## Logging, telemetry, and Events

- No Titles, Bodies, Comments, original files, original filenames, Read/Upload URLs, or private emotions in standard Logs.
- IDs are logged only as operationally necessary; no Tokens, signatures, or Storage credentials.
- Error tracking receives sanitized payloads and no complete Request Bodies/Provider responses.
- Domain Events contain minimal references instead of protected content.
- Metrics have bounded cardinality and no user text/filenames as labels.
- Media metrics include at least state age/count for PENDING, FAILED, unbound READY, DELETE_FAILED, plus Cleanup success/failure.

## Adapter contract tests

Every `MediaStore` implementation must pass the same domain test catalog:

- `createUpload` generates non-guessable, Space-bound server-side Keys.
- Local Upload streams through an authorized server route; S3 Upload descriptor expires within ≤10 min.
- `finalizeUpload` is idempotent and does not move directly to READY without validation.
- `open`/`createReadUrl` is unreachable without immediately preceding Domain Authorization.
- S3 Read URL expires within ≤5 min; Bucket remains private.
- `delete` is idempotent and deletes only the exactly addressed Blob.
- Partial failures do not misrepresent Domain state.
- A future encrypted Blob can be stored/transferred; M2 does not claim that server-side validation with real E2EE is already solved.

## Retention/Job tests

- Cleanup clock is tested with server-side timestamps, not client time.
- PENDING/FAILED aged 23:59 h remain; >24 h become due.
- READY unbound aged 59 min remains bindable; >60 min becomes due.
- repeated Cleanup is idempotent.
- Provider failure creates no Domain Rollback and no reappearance.
- `DELETE_FAILED` remains visible to Ops/metrics and is retried.
- Cleanup Logs contain Attachment ID/state/adapter/attempt but no URLs/filenames/content.

## Story/Pagination

Global full-text Search `q` is not required for G2 according to M2-S0 project control and generally remains M4. Story Privacy is nevertheless enforced before sorting, Count, and Cursor creation. Ordering/Cursor semantics are binding through #70/D08.

## Client and cache checks

| Area | Web | Android |
|---|---|---|
| Logout / Space switch | fully clear Query and Media cache | clear local projections and image cache |
| PRIVATE data | never in shared Browser/Service Worker cache | owner-bound, not in Backup/Share Sheet |
| Offline | last authorized view according to later cache contract | last authorized view according to later cache contract |
| Offline Write | disabled or clearly blocked | disabled or clearly blocked |
| Read URL | not persistently stored | not persistently stored |

## Acceptance criterion

M2 is not Security-complete while a mandatory path for the implemented G2 scope is missing, a Cross-Tenant test exists only at Repository level, or a private HeartMoment can be indirectly observed. Media Runtime acceptance for G2 is limited to the delivered image-only scope: the applicable #69 values must be reproducibly implemented in API, adapter contract tests, and PostgreSQL Integration Tests. Video target parameters are excluded from current G2 acceptance and remain future work under #88.
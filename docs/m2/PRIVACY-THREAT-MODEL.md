# M2 Privacy Threat Model

**Scope:** Memory, HeartMoment, Milestone, Comment, Story, and Attachment  
**Method:** data-flow- and abuse-case-oriented threat analysis  
**As of:** August 24, 2026

This model supplements the [Security Test Matrix](./SECURITY-TEST-MATRIX.md) with attackers, trust boundaries, data flows, and concrete controls. It does not claim that M2 provides real end-to-end encryption. Encryption at rest under operator-held keys (#797) adds a separate layer for stolen dumps, replicas and buckets; its threat model is [ENCRYPTION-AT-REST.md](../ENCRYPTION-AT-REST.md).

![M2 Privacy Flow](./m2-privacy-flow.svg)

## 1. Security objectives

1. **Confidentiality:** Private HeartMoments are visible only to the owner.
2. **Tenant Isolation:** No Space can discover entities or Media belonging to another Space.
3. **Integrity:** Author, Space, visibility, version, and Attachment relation cannot be reassigned by the client.
4. **Minimization:** Logs, Events, Analytics, and Notifications contain no protected content.
5. **Traceability:** Domain changes and minimal Domain Events commit atomically.
6. **Delete effect:** Deleted or privatized content is removed immediately from all authorized projections.
7. **E2EE readiness:** ProtectedPayload and MediaStore do not establish a mandatory plaintext assumption.

## 2. Protected assets

| Asset | Sensitivity | Examples | Particular risk |
|---|---|---|---|
| ProtectedPayload | high | Title, Body, Comment text | Logs, Search, Push, diagnostics |
| PRIVATE HeartMoment | very high | text, emotion, date, Attachment | partner leak through indirect path |
| Media content | high | photo, video, audio | public URL, cache, EXIF/GPS |
| relationship/Space metadata | high | Membership, author, visibility | social inference and IDOR |
| Search/Story metadata | medium to high | hits, Counts, Cursor, months | existence leak without content |
| credentials and Read URLs | critical | Session, signature, Storage Key | direct API bypass |
| local caches/drafts | high | Offline Read, unsaved text | wrong Account/Space, backup |
| Domain Events | medium to high | type, Actor, Target | content leak through payload expansion |

## 3. Actors and capabilities

| Actor | Legitimate access | Assumed capability |
|---|---|---|
| Owner `A` | own and shared content in Space Alpha | manipulates Requests and knows own IDs |
| Partner `B` | shared content in Space Alpha | guesses/obtains private IDs and probes side channels |
| Foreign member `C` | content in Space Beta | attempts Cross-Tenant IDOR and Cursor reuse |
| Revoked member `R` | no current access | holds old Tokens, URLs, or cache |
| Anonymous attacker | no access | scans routes, IDs, Media endpoints |
| Faulty integration | minimal Event/Push access only | logs or projects too much |
| Internal operator | operational diagnostics | sees Logs/Traces/Backups with excessive privilege |

Client and network are not trusted anchors. Every Domain operation enforces Auth, current Membership, Tenant, and resource visibility server-side.

## 4. Trust boundaries

```text
Device/Browser
  → public API boundary
    → Auth + Membership + Visibility Guard
      → Domain transaction + projection
        → Postgres / MediaStore
        → Outbox → Worker → Notification Provider
```

- **TB-1 Device:** cache, Clipboard, Screenshots, Backups, and other apps.
- **TB-2 Transport/API:** manipulated IDs, Bodies, Cursors, MIME, and Concurrency.
- **TB-3 Domain/Storage:** domain visibility versus physical Blob/record.
- **TB-4 Async:** Event, Retry, Push Preview, and external Provider.
- **TB-5 Operations:** Logs, error tracking, metrics, Support, and Backups.

## 5. Data flows

| Flow | Source → destination | Data | Required control |
|---|---|---|---|
| DF-01 | Client → API | Create/Update DTO | Schema, Auth, Membership, Version |
| DF-02 | API → Domain | Actor + Space + operation | server-derived Actor/Space |
| DF-03 | Domain → Postgres | metadata + ProtectedPayload | Tenant, transaction, minimal Logs |
| DF-04 | Client → MediaStore | Blob through upload path | non-guessable Key, limits, Finalize |
| DF-05 | Domain → Read Projection | Story/Detail/Search | visibility before Count/Sort/Cursor |
| DF-06 | API → Client | DTO + Read URL/Stream | Authorization immediately beforehand, short TTL |
| DF-07 | Domain → Outbox | minimal Event | atomic, no content |
| DF-08 | Worker → Notification | generic Preview | target Authorization and data minimization |
| DF-09 | Client ↔ local cache | authorized Read data/draft | owner/Space binding, deletion/locking |

## 6. Threats and controls

| ID | Threat | Attack path | Impact | Mandatory controls | Evidence |
|---|---|---|---|---|---|
| TM-01 | Cross-Tenant IDOR | foreign UUID in Read/Write/Delete | data leak/mutation | Tenant from Membership, Parent/Child same Space, Privacy-safe 404 | HTTP isolation tests |
| TM-02 | partner reads PRIVATE directly | known HeartMoment ID | severe Privacy violation | central owner-only Policy before Repository projection | A/B Canary by ID |
| TM-03 | PRIVATE leak through Story/Search | filter only after Count/Pagination | existence/date/timing leak | exclude before Query/Count/Sort/Cursor | Count/Cursor/timing tests |
| TM-04 | PRIVATE leak through relation | Comment/Attachment/Notification resolves parent indirectly | content or existence visible | parent visibility determines every relation | indirect Canary suite |
| TM-05 | public/long-lived Media URL | Bucket ACL or long-lived signature | uncontrolled read | private Storage defaults, short TTL, authorized Stream/URL | URL expiry and ACL test |
| TM-06 | Upload spoofing | manipulated extension/MIME/container | malicious content, parser/resource attack | positive allowlist, actual MIME, size/pixel/duration limit, isolated processing | Media abuse suite |
| TM-07 | Storage-Key injection | filename/path as Key | overwrite/foreign access | server-generated UUID Keys; name metadata only | Key contract test |
| TM-08 | cache after logout/Space switch | Browser/Android cache remains | later access | partition by owner/Space and delete/lock | Logout/Switch E2E |
| TM-09 | Notification Preview | Comment/Title text in Push | lockscreen/Provider leak | generic Preview, minimal Event, Preferences | Push payload snapshot |
| TM-10 | Logging/Analytics leak | Request Body, URL, or Search text logged | internal/third-party leak | allowlist Logging, Redaction, no content properties | Canary in log scan |
| TM-11 | visibility race | Share/Private concurrent with Comment/Read | invalid relation/brief leak | Version, transaction, Guard at final Read/Event | race test |
| TM-12 | revoked Membership | old Token/Read URL/cache | access after revocation | Membership on API Read, short URL TTL, cache lock | revocation E2E |
| TM-13 | Cursor/error oracle | Cursor from another Space, different 403/404 | resource discovery | opaque Space-bound Cursor, neutral error shape | manipulation matrix |
| TM-14 | Export/Backup leak | PRIVATE in partner Export or system Backup | durable disclosure | separate owner and partner Export; cache/Backup rule | Export Canary |
| TM-15 | Screenshot/Recents | private view in App Switcher | shoulder surfing/OS artifact | explicit platform decision, optional screen protection | Android UX/Security test |
| TM-16 | Outbox replay | Worker delivers repeatedly | duplicate Push/side effects | idempotency/dedupe, minimal Event version | Retry test |
| TM-17 | Delete orphan | parent deleted, Blob/index/cache remains | later rediscovery | immediately invisible, idempotent Cleanup, Search-index SLA | Delete/Cleanup test |
| TM-18 | diagnostic/Support overreach | operator sees content | internal Privacy violation | roles, break-glass, Audit, Redaction, Retention | Ops review |

## 7. Owner-only control point

For `PRIVATE`, one domain statement applies:

```text
visible(resource, actor) = resource.ownerId == actor.id
```

Membership in the same Space is not sufficient. This rule must apply before all of the following operations:

- Detail, Update, Delete,
- List, Search, Count, Filter, Cursor,
- Story, Dashboard, Recap, recently opened,
- Comment target and Comment Count,
- Attachment metadata, Thumbnail, download, Read URL,
- Event, Notification, Badge Count,
- Analytics, diagnostics, Export, and cache projection.

## 8. Privacy Canaries

Test data contains synthetic markers:

- `CANARY-PRIVATE-LEA-7421` in private text,
- `private-lea-7421.jpg` as original name,
- a unique domain date,
- Attachment with unique test hash.

Partner, foreign-member, and default operator paths are automatically scanned for these markers. No marker may appear in Response, DOM, cache, Log, Trace, Event, Notification, Export, or Screenshot test fixture.

## 9. Client controls

### Web

- Partition Query/Service Worker/image caches by owner and Space.
- Logout/Space switch deletes/locks data before navigation.
- Do not write Read URLs to Local Storage, Analytics, History, or persistent cache.
- Never include private Deep Links in public metadata tags or server-rendered cache.

### Android

- Store sensitive local data encrypted and bound to Account/Space.
- No private content in general Backup, Clipboard, or Share Sheet.
- Notifications default to no content Preview.
- Explicitly decide and test Recents/Screenshot behavior.
- No autonomous Offline Write Worker in the MVP.

## 10. Async and Observability contract

An M2 Event contains at most:

```text
eventId · eventType · occurredAt · actorId · spaceId · targetType · targetId · version
```

No Titles, Bodies, Comments, emotions, filenames, Storage Keys, or Read URLs. Every additional value requires Privacy review and a documented consumer.

## 11. Residual risks and open decisions

| Topic | Residual risk | Required decision |
|---|---|---|
| signed URL after Membership revocation | may remain usable until TTL expiry | TTL/Stream per adapter `M2-D13` |
| EXIF/GPS | closed through ingest stripping | decided in `M2-D14` |
| Shared → Private | content/Comments already read | Comment rule `M2-D07` |
| emotion | metadata versus ProtectedPayload | classification `M2-D06` |
| Android Recents | screenshot of private screen | platform rule |
| Export/Backup | different recipients and Retention | `M2-D17`/`M2-D18` |

## 12. Release Gate

M2 is not released if:

- owner-only is implemented only in the Controller or only through a UI filter,
- a partner Canary is indirectly visible,
- Media is readable without parent Authorization,
- Push, Logs, or Analytics carry protected content,
- Logout/Space switch leaves private caches behind,
- Cross-Tenant and race tests do not run through the public API,
- the product claims E2EE while only E2EE readiness exists.

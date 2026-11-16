# Web client

The React web client is an authoritative M5 client surface. It uses the generated OpenAPI client, React Router, TanStack Query, i18next, and browser platform capabilities. It does not duplicate backend authorization, privacy, or validation rules.

## M5 Web S2 story products

M5 Web S2 completes the product surfaces for Memories, HeartMoments, and Milestones:

- Memory create, detail, edit, delete, media gallery, comments, attachment add/remove management, and deep links.
- HeartMoment create, detail, edit, delete, visibility changes, optional image attachment, comments for shared HeartMoments, and deep links.
- Milestone create, detail, edit, delete, comments, and deep links.
- Story cards link directly to the corresponding detail route.
- Story filtering uses the generated API contract for content kind, year, and ordering; cursor pagination appends API pages without reordering them locally.
- Shared galleries provide a fullscreen viewer, keyboard navigation, native touch swipe and an item counter. The bounded #88 slice adds MP4/MOV H.264/AAC videos to Memories and HeartMoments: posters use the existing authorized image cache, while only the active fullscreen item owns a native, deliberate-play video element and transient parent/session-bound range URL. Video intake requires the backend availability flag and Space Pro capability; retained playback remains available without either. Plans and avatars keep image-only intake. See [the interaction contract](../product/design/references/88-video/README.md) and [operations/security](../operations/video-uploads.md).
- Memory and HeartMoment attachment drafts upload immediately after selection, show a local preview and upload progress, and can be cancelled before binding the attachment to domain content.

Routes:

- `/memory/new`
- `/memory/:memoryId`
- `/memory/:memoryId/edit`
- `/heart-moment/new`
- `/heart-moment/:heartMomentId`
- `/heart-moment/:heartMomentId/edit`
- `/milestone/new`
- `/milestone/:milestoneId`
- `/milestone/:milestoneId/edit`

Story filters are encoded as query parameters on `/story` (`type`, `year`, and non-default `order`) so filtered views remain reloadable without creating a second client-side filtering contract.

## Read cache and privacy

Product detail reads and the last-seen Story snapshot use IndexedDB as a last-known-good read cache. Cache entries are scoped by account, space, domain kind, and resource id. Story cache resource ids additionally include the active filter combination, so one filtered view cannot fall back to another filtered view.

A successful authorized network read refreshes the relevant cache. When additional Story cursor pages are loaded, the aggregated pages actually seen by the user replace the initial first-page snapshot.

Cache fallback is deliberately limited to transport/offline failures and temporary server failures. Authentication, permission, and not-found responses never fall back to cached protected content. This preserves fail-closed authorization semantics, including privacy-sensitive resources that deliberately use `404` instead of `403` to avoid existence disclosure.

Cached detail views are read-only. Cached Story snapshots do not expose network pagination while offline. The client does not queue or synchronize offline writes. Comments are not loaded from the product cache. The cache is cleared on logout.

Authorized image bytes use the existing Account/API/Space and parent-bound media
cache: 48 MiB in memory and a disposable IndexedDB store bounded by 2000 media
items (thumbnail and original of one item share a slot), without a byte cap
beyond the browser quota, and without a maximum age (Product Owner exception
to M2-D18 in `docs/m5/S6-CACHE-PORTABILITY-DECISIONS.md`).
Product Owner decision (2026-11-16): attachment bytes are immutable, and the
parent data a view renders decides whether they are shown. Bytes already stored
for the exact login, Account, API origin, Space, parent, attachment and variant
are therefore shown without a new read grant, and an image this runtime already
decoded renders in a returning view's first frame without a skeleton or a second
fade. A read grant is requested only for bytes not stored yet. The parent lists
revalidate in the background: a denied list evicts the Space's stored media, a
denied read evicts all variants of its parent, and Media overview removes items
the refreshed list no longer contains with motion and deletes their stored bytes.
Until that list response arrives, an item deleted or withdrawn while the app was
closed can stay visible (online usually under a second, offline until the next
successful response). Credentials, signed URLs, playback grants, video originals
and non-image payloads do not enter the durable image store. Logout and
Account/Space changes invalidate it.
Images of `OWNER_ONLY` parents never enter the durable store either
(M2-D18 #3): the private Media overview filter, the viewer's private Heart
Moments (detail, editor and Timeline) and private People pass
`persist: false`, and uploads not yet bound to a parent are never persisted.
Such bytes stay in the session-memory caches only. Once a parent is known to
be private, it stays session-only for the rest of the login even for a view
that does not know its visibility, and any copy stored while it was still
shared is removed.
The Android app is the exception (M2-D18 #4, Product Owner decision of
2026-11-16): `deviceMediaSeal.ts` seals every durable image row, shared and
private, with AES-GCM under a per-login key from `NativeSessionStorage`, so
`persist: false` has no effect there. The app keeps no plaintext rows (the v3
store upgrade drops earlier ones), writes nothing without the key, and drops a
row it cannot open. Logout deletes the key natively; before that, a
confirmation sheet on the More page names what signing out deletes from the
phone. Browsers and iOS keep the behavior above.

The same key seals the text the Android app caches (requested by the Product
Owner on 2026-11-16): every read-cache row, including the list outbox, stores
its payload as AES-GCM ciphertext bound to the row key (`sealJson` in
`deviceMediaSeal.ts`). Routing fields (account, Space, kind, resource, refresh
time) stay readable so rows can be found, expired and purged. The app writes
no cache row without the key, discards a plaintext row or a row sealed under an
earlier login, and the store upgrade to version 4 drops earlier plaintext rows
once on every platform. Memory diary drafts are sealed the same way
(`memoryDiaryDraft.ts`): text and structure as one sealed value, in which
dates and photo names are tagged, and the bytes of each attached photo as
their own sealed blob. A draft written before sealing is kept and sealed in
place on its next load; a draft sealed under an earlier login is discarded.
Browsers and iOS keep plaintext rows, because they have no device-bound key
store.

The size/LRU index is stored separately from Blob payloads in one IndexedDB
transaction, so eviction and access-time updates never scan or rewrite all
cached images. Upgrading the disposable v1 store discards its old cache once;
server content is unaffected. Ordinary storage failure remains best effort.
Only two idle original-image Object URLs are retained, independently of their
compressed byte size; downloaded bytes remain cached after a decoded URL is
released. Thumbnail URLs retain the existing bounded preview lifecycle.

The saved-memory map uses server-declared thumbnail availability, mounts one
MapLibre map at a time, and fits its authorized locations after measurable layout
and subsequent resizes until the user pans/zooms. Its initial overview is capped
at zoom 12; deliberate zoom remains available. Short returns reuse its scoped
query for one minute, with thirty-minute garbage collection and existing
mutation/authorization invalidation. No durable map or Pro entitlement snapshot
is introduced. See #1605 and parallel video work #1598.

The same thumbnail-availability projection also drives Wir's Keepsake,
retrospective, contextual media and monthly strip through MemoryPreview. These
previews avoid decoding the full originals during startup; a source without a
thumbnail retains the existing authorized-original fallback.

## Concurrency and mutations

All updates, deletes, visibility changes, comment deletes, and attachment binding operations continue to use the version returned by the API through `If-Match`. Client-side optimistic presentation is rolled back when the mutation fails; the server remains authoritative.

Memory attachment management preserves the server-provided order for retained attachments, removes only explicitly marked attachment ids, and appends newly READY uploads. If the multi-step Memory update is only partially accepted by the server, the detail query is invalidated immediately so the UI reconciles with the authoritative version before another write.

HeartMoment visibility is not part of the content update payload. The UI uses the dedicated visibility operation and only the API-defined `SHARED` and `PRIVATE` values. Private HeartMoments do not request or render shared comments.

## Reuse review

M5 Web S2 reuses existing capabilities instead of introducing parallel infrastructure:

- generated OpenAPI clients for all domain, Story, and comment operations;
- the existing attachment upload/finalize/READY lifecycle and Memory attachment-set operation;
- IndexedDB for durable local reads;
- `AbortController` plus `XMLHttpRequest.upload` for cancellable upload progress;
- native image elements, keyboard events, and touch events for the gallery;
- React Router for deep links/filter query parameters and TanStack Query for remote state, cursor pagination, and optimistic rollback.

No new runtime dependency or provider service is introduced.

## Business and freemium classification

This slice does not change product classification. Memory CRUD, normal image attachments, HeartMoments, Milestones, comments, Story, and web access remain Free/Core. Privacy and accessibility behavior are non-paywallable. Cloud and self-hosted deployments use the same client behavior and API contract.

## Accessibility

Interactive gallery thumbnails are buttons with accessible names. The fullscreen viewer is an `aria-modal` dialog, exposes a live counter, supports Escape and arrow keys, and keeps 44+ pixel navigation controls. Story filters and forms use explicit labels, status/error regions use existing shared UI-state components, and upload progress uses the native `progress` element. The S2 regression suite includes semantic route/render smoke coverage, generated Story request/filter coverage, privacy-negative cache coverage, and the `eimir-M5-Web-S2-SCOPE` acceptance marker.

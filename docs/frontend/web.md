# Web client

The React web client is an authoritative M5 client surface. It uses the generated OpenAPI client, React Router, TanStack Query, i18next, and browser platform capabilities. It does not duplicate backend authorization, privacy, or validation rules.

## M5 Web S2 story products

M5 Web S2 completes the product surfaces for Memories, HeartMoments, and Milestones:

- Memory create, detail, edit, delete, media gallery, comments, attachment add/remove management, and deep links.
- HeartMoment create, detail, edit, delete, visibility changes, optional image attachment, comments for shared HeartMoments, and deep links.
- Milestone create, detail, edit, delete, comments, and deep links.
- Story cards link directly to the corresponding detail route.
- Story filtering uses the generated API contract for content kind, year, and ordering; cursor pagination appends API pages without reordering them locally.
- Image galleries provide a fullscreen viewer, keyboard navigation, touch swipe navigation, and an item counter. Video playback remains out of scope because the current backend intentionally rejects video fail-closed; a future video slice must provide the media and accessibility contract before the web client enables playback.
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

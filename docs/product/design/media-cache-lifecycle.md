# Authorized media lifecycle

Owning issue: #1384. Baseline: `ac74b40a346f52d745bc4563658061a500edc327`.

## Product behavior

Returning to a photo or opening its detail reuses already downloaded bytes.
Today, Story, Years, Photos and details share the attachment loader. Profile
and related-person avatars use the same bounded byte owner. Visible views
continue to own and dispose their Object URLs; removing a view no longer
destroys the reusable bytes. Concurrent consumers share a download, while
cancelling one consumer does not cancel another consumer's download.

Original and thumbnail are separate variants. An attachment without a thumbnail
uses its original identity for both preview and full viewing. The existing
near-viewport loading and active-photo/neighbour original limits remain in place.

## Security and resource ownership

- `Configuration` and the media API adapters bind reuse to the API base path
  and one login's `SessionOwner`. Token rotation preserves this identity;
  another login, including a new login to the same account, does not.
- Keys include Space, parent type/ID, attachment ID and variant. Profile avatars
  additionally include the target Account and authoritative profile attachment
  ID; related-person avatars use their authorized attachment ID.
- Attachment read-access is checked before **every** cached delivery. A cache
  hit avoids binary transfer, never the parent authorization check. Explicit
  401/403/404 responses evict all variants for that parent and invalidate reads
  whose earlier authorization has not completed. An unavailable authorization
  check fails honestly; this is not a new offline-media fallback.
- The existing product read-cache clear and session persistence lifecycles
  invalidate media synchronously. Login replacement, logout, Account and Space
  transitions cannot be undone by late descriptor or binary completions.
- Retained bytes use LRU eviction, at most **48 MiB / 192 entries**, with a
  **30-minute** maximum age measured by a monotonic clock. A cache hit does not
  extend that age. Oversized originals can be viewed but are not retained.
- Bytes, tokens, signed URLs and upload state are never persisted by this cache.
  View URLs are not cache entries or credentials. Private Web media remains
  memory-only under M2-D18. A browser reload/process restart is a cold cache;
  this change does not claim process-death persistence or native disk caching.

## Design and reuse review

Product Reference v1 R2/R4/R5 and return continuity apply. Existing MemoryPreview,
MediaGallery, PersonIdentity and profile components retain their hierarchy,
controls, tokens, focus, reduced-motion behavior and initial/error/offline
states. There is no new screen, visual composition or user configuration.

HTTP/Cache API persistence was rejected for this repair because it would create
a new private-byte retention/deletion contract. The existing TanStack Query
continues owning domain projections; its time-based collection alone does not
bound media byte usage. Standard Blob, Map and AbortController capabilities plus
the existing generated-client and Object URL owners provide the required small
session-memory cache without a new dependency/provider.

Business/freemium impact reviewed: essential media reading and cache isolation
remain non-paywallable. Cloud and Self-Hosted receive identical behavior; no
entitlement, quota, storage or downgrade semantics change. Reusing bytes reduces
transfer and server work.

## Evidence

The production-component browser journey opens a photo, closes/reopens its
viewer, opens its source detail, returns to Photos and reopens the viewer.
For the selected photo, the entire journey makes exactly **one thumbnail and
one original binary request**, while authorizing each original read again.

The existing Photos suite also covers revocation dismissal, failed pagination,
empty/error/offline states, Light/Dark, Compact/Expanded, 320px reflow, 200% text,
reduced motion, keyboard return and axe checks. Screenshots in
`evidence/media-cache/` show the unchanged composition and successful return.
These mocked-API browser journeys prove client behavior; they do not certify
production network latency, Android process death or device memory limits.

Unit/component regressions cover shared transport cancellation, failed-load
retry, login rotation/isolation, origin/Space/parent/variant isolation, avatar
replacement, stale-context rendering, LRU byte/count limits, age expiry and
late completions after invalidation.

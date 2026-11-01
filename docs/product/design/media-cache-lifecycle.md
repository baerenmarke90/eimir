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

## Durable app storage — #1517 (2026-10-30)

The Product Owner explicitly requested app-owned persistent storage. This
supersedes the memory-only delivery boundary above; it does not change the
per-read parent authorization contract. Browser and Capacitor now share an
IndexedDB byte store behind the existing authorized loader. RWN Messenger's
bounded preview-cache ownership and targeted invalidation informed the design;
no native Kotlin implementation was copied.

The existing RAM cache remains bounded at 48 MiB / 192 entries / 30 minutes.
The disposable disk tier retains at most 128 MiB / 512 entries / seven days,
evicting least recently used entries when writing. It stores binary Blobs and
local age/ownership metadata, never bearer tokens, signed URLs or Object URLs.
Origin, Account, Space, parent, attachment and variant are separate identities.
Only session-bound configured clients receive a disk namespace; custom clients
stay memory-only. An opaque local epoch is rotated synchronously before queued
cleanup on logout, login replacement, Space change and product-cache reset.
Lease and epoch checks fence late reads/writes. Parent denial removes all variants.

Disk hits still require fresh authorized read-access; this is not offline media
viewing. Authenticated private bytes now reside in app/browser storage, subject
to device/browser access controls; this feature does not claim local encryption.
Storage denial, quota exhaustion or browser eviction falls back to the network
and bounded RAM tier. Browser data clearing/uninstall can discard the cache.
Approved existing domain read snapshots and draft policies remain unchanged;
we deliberately do not serialize the complete QueryClient or credentials.

Ordinary query projections now remain in RAM for 30 minutes of inactivity,
while retaining the existing one-minute freshness and explicit mutation/live
invalidation contracts. Returning to a screen keeps its current data visible
while necessary background updates run. This does not promise zero requests or
complete domain persistence after process death.

# Authorized media lifecycle

Owning issue: #1384. Baseline: `ac74b40a346f52d745bc4563658061a500edc327`.

## Product behavior

Returning to a photo or opening its detail reuses already downloaded bytes.
Today, Story, Years, Photos and details share the attachment loader. Profile
and related-person avatars use the same bounded byte owner. Visible views
own disposable handles to shared display URLs; removing a view releases its
handle while bounded URL and byte reuse continue (see #1603 below). Concurrent consumers share a download, while
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


## Appwide display continuity — #1603 (2026-11-02)

The byte cache alone did not prevent visible image reloads. Gallery originals,
profile/person avatars and several relation/Photos loaders created a new Object
URL when a view reopened. The preview URL pool also expired after one minute or
24 idle previews, so an ordinary detail visit could invalidate its origin's image.

All authorized display loaders now return reference-counted handles from the
same bounded pool. Thumbnail and original keys remain distinct; an original
fallback shares its identity with a gallery original. Profile keys retain the
Account and authoritative attachment identity; related-person keys retain their
client scope. Upload drafts and temporary external source-picker previews keep
single-consumer ownership.

Idle URL ownership uses the same **48 MiB / 192 entries / 30-minute** bounds as
the existing RAM byte cache. URL age measures inactivity, while byte age remains
measured from receipt. LRU/expiry removes idle entries; live handles remain valid
until released. Reentry checks authorization before acquiring a retained URL.
Denied parent read-access, authoritative membership loss and login/Space/product-cache
wipes revoke both active and idle URLs synchronously. Space revocation also
fences outstanding parent-specific authorization leases; transient membership
refresh errors preserve current images and an expired Account response cannot
revoke the next Account's scope. No Object URL is persisted to disk. The disk tier and
its authorization, epoch and eviction contracts remain unchanged.

Regressions cover Story, Heart Moment and Plan originals/thumbnails, profile and
related-person avatars, a ninety-second detail visit and a real Memory gallery
journey through Wir/Moments tabs. Reuse avoids repeat binary transfer and URL
creation without suppressing fresh parent authorization. Idle images can load
again after eviction/expiry or privacy revocation; this is deliberate bounded
ownership rather than an unlimited retention promise.

## Stored photos appear before their access check — 2026-11-11

Product Owner follow-up to #1517/#1603: the app still appeared to reload every
image on each start. Baseline: `main@bc9f2dc494f3d989de357c8c7acf8da19889a424`.

Measured cause: the bytes were already on the device, but the loader awaited a
fresh read-access response before every cached delivery. Each image therefore
waited for at least one network round trip on a cold start and on every return
to a retained screen, which is indistinguishable from a download on a mobile
network. A browser journey with the access check held open showed no image at
all until that check completed.

**Decision.** Bytes this login already holds, in the RAM or disk tier, are
displayed immediately. Parent read-access is still requested for every such
delivery, now concurrently instead of beforehand. This supersedes “checked
before every cached delivery” and “disk hits still require fresh authorized
read-access” above for stored bytes only.

- Unchanged: Origin/Account/Space/parent/attachment/variant identities, epoch
  and lease fencing, limits and ages, synchronous wipes on logout, login
  replacement, Space change and membership loss. Nothing new is persisted.
- An attachment with no stored bytes still waits for authorization; a denial
  never downloads or reveals anything.
- An explicit 401/403/404 from the concurrent check evicts all variants of that
  parent from RAM and disk, revokes their display URLs and invalidates the
  loaded queries, so the refreshed parent projection removes the item.
  Concurrent views of one photo share a single check. A late denial for a
  replaced login or revoked lease changes nothing.
- An unavailable check (offline, server error) leaves the stored photo visible.
  Shared text snapshots already behave this way through the approved read
  cache; photos now match it. Sensitive-media reveal and the fresh-projection
  preview proofs are untouched.

**Privacy consequence.** After a partner deletes or hides content, a device that
stored its photo earlier can show it until its access check answers, and while
that device stays offline, bounded by the seven-day disk age. Previously the
photo stayed hidden in both cases. The exposure is limited to the same signed-in
Account, Space and device that was authorized when the bytes were stored.

### Startup and Diary follow-up

Product Owner follow-up the same day: not only photos, the whole start must
build up at once. With every response delayed by 400 ms, a native cold start
showed the shell after about 600 ms, the first Diary card after about 1,030 ms
and its photo after about 1,090 ms; each stage scaled with network latency.

- **Remembered Space.** A restored session whose stored Space was resolved from
  an earlier authorized membership response opens that Space immediately while
  `/auth/me` and the membership read run. An authoritative membership answer
  always replaces the assumption: a lost membership leaves the Space, evicts its
  media and returns to the existing gate. A transient failure (offline, server,
  rate limit) keeps the remembered Space with its stored content; 401/403 ends
  the session as before. A fresh sign-in is unaffected.
- **Diary and Discover.** Their already persisted first-view snapshots paint
  while the network read is in flight and are replaced by its result. They are
  marked `warm`, never `network`: they do not paginate, are not written back and
  do not show the offline notice. A denied read removes the painted snapshot.

The same measurement now shows shell, card and photo within about 260 ms,
before any response arrives. Other screens keep their existing behavior; Today,
Planning lists, Places, Chapters and Photos already paint stored overviews.

**Privacy consequence.** For the duration of the membership round trip, an
Account removed from a Space can see that Space's stored shared snapshots and
photos on a device that held them. Previously the startup screen covered them.

Business/freemium impact reviewed: none. Essential media reading stays
non-paywallable and identical in Cloud and Self-Hosted; server requests per
delivery are unchanged. Reuse review: the existing loader, byte tiers, URL pool
and query invalidation are reused; no dependency, provider or new store.

Evidence: `app-continuity-polish.spec.ts` holds every API response during a
native cold start, sees the Diary card and its photo, then answers with an empty
membership list and observes the Space closed. It also returns to a retained Diary card while
its access check is held open, sees the photo with no second download, then
answers the check with 404 and observes the stored bytes removed. The journey
fails on the baseline. Unit regressions cover immediate delivery, the shared
check, 401/403/404 eviction, unavailable checks, absent bytes and isolation
between logins. Physical-device and production-network acceptance remain open.

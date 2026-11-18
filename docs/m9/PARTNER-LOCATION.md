# Partner location and distance — M9 contract

**Status:** normative readiness contract for #1792 (first slice) on the #1524 foundation.
**Product Owner decisions:** #1524 (2026-10-30: bounded and indefinite sharing),
#1792 (2026-11-13: distance levels, map destination, start prompt, bands,
energy efficiency, Dawarich optional, complete feature Premium),
#1792 (2026-11-17: each person may choose **precise** instead of approximate
sharing, see §2 and §4).

This document reconciles [Master Specification](../../specification/CLEAN-ROOM-MASTER-SPEC.md)
§42 (Location & Context Framework), §43 (Partner distance) and §49 (Dawarich)
with those decisions. It is the authority for runtime behavior; the issues hold
the product rationale.

## 1. Concept boundary

The feature is **Presence** in the §42 sense: a current, short-lived position.
It is not `Place` (stored shared place), not `LocationHistory` (external
history, for example Dawarich) and not `Context` (derived situation). A
presence grant never authorizes Places, Memories, Context suggestions,
recaps, online Presence/"last seen" or any other feature.

eimir. stores **no movement history**: at most one current snapshot per person
and Space, replaced on every publication and deleted on expiry.

## 2. Purposes and consent

Each Account controls its own sharing in its current Space. Nothing is shared
by default.

| Level | The partner receives | The partner never receives |
| --- | --- | --- |
| `OFF` (default) | Nothing; a neutral unavailable state. | Any reason (choice, permission, device, entitlement). |
| `DISTANCE` | A coarse, server-computed distance band. | Coordinates, direction, place names, accuracy, map position. |
| `DISTANCE_AND_MAP` | The distance band and an approximate map area. | A trail, history, "last seen" or precision finer than §4. |

- **Precision (PO 2026-11-17):** every person chooses for their own position
  between **approximate** (the default, as before) and **precise**. The choice
  is part of the Premium capability (§3), is asked once in the start prompt and
  can be changed any time in Settings, and is stored on the person's consent
  (it survives `OFF`, so it can be chosen before sharing). Changing it starts a
  new consent generation. Lowering to approximate never needs entitlement.
  The device rounds the position before it is sent (§4); a precise choice is
  honoured only while the device really holds a precise position (Android 12+
  lets people keep "approximate"; the position is then stored and read as
  approximate and only the owner is told, in Settings). The partner never
  learns a person's choice or why a value is coarse.
- **Recipient binding:** consent names the exact recipient Account (the active
  partner at consent time). If the active partner changes, membership ends or
  the Space is deleted, the consent no longer matches and nothing is readable.
- **Duration:** a bounded grant stores a server-authoritative `expires_at`
  instant at most 24 hours ahead ("one hour", "until this evening"). An
  indefinite grant ("until I stop") has no `expires_at` and must be requested
  explicitly. Clients preselect a bounded option (PO 2026-11-13). Timezone or
  clock changes never extend a stored grant.
- **Generation:** every change of level, duration, recipient or suspension
  increments the consent generation. A publication must carry the current
  generation; older generations are rejected, so delayed retries or old devices
  cannot recreate a stopped or narrowed share.
- **Viewing without sharing:** a viewer sees the partner's distance when the
  partner shares at least `DISTANCE`. The viewer's own position is a transient
  computation input of that single request: never stored, never logged, never
  published and never visible to the partner.
- **Stop** (`OFF`) is always accepted, without entitlement, and deletes the
  owner's snapshot in the same transaction.

## 3. Entitlement (Premium)

The complete feature is Premium under the Space capability **`presence.location`**
([feature matrix](../FREEMIUM-FEATURE-MATRIX.md)). One grant serves both partners.

- Without the capability: no publication, no distance, no map read. Reading
  one's own consent and setting `OFF` remain available (non-paywallable).
- On entitlement loss, active consents are **suspended**: their snapshots are
  deleted and the generation increments. Suspension is applied inline on the
  next access and by the periodic presence job.
- Restoring the entitlement never reactivates sharing. A suspended consent is
  reported to its owner and becomes active only after an explicit new
  confirmation (a settings write).
- Self-Hosted uses the existing signed offline license token; behavior is
  identical.

## 4. Precision

- Approximate positions are snapped to a 0.01° latitude/longitude grid
  (≈ 1.1 km north–south). A **precise** position (precise choice and a fix that
  reports an accuracy of at most 500 m) is snapped to a 0.001° grid (≈ 111 m).
  The device rounds before sending and the server snaps again, so the raw fix
  is neither sent nor stored.
- The stored accuracy is the reported accuracy rounded up to 100 m, never below
  1,000 m (approximate) or 200 m (precise: the grid cell's half diagonal plus a
  typical satellite error). A stored accuracy below 1,000 m is what marks a
  position as precise.
- The snapped position and its accuracy are stored as a `ProtectedPayload`
  (`PresencePositionPayload`), not in plain columns. With encryption at rest
  (#797) the database holds them as ciphertext: a dump or replica shows who
  shares with whom and until when, not where. The running application decrypts
  the position to compute the distance band and the map area; this is
  encryption at rest, not end-to-end encryption.
- The map projection exposes the snapped position and an approximate-area
  radius of at least 1,500 m (approximate) or the stored accuracy, at least
  200 m (precise). Clients must render an area, not a precise pin.
- Distance bands (PO 2026-11-13), computed with the haversine formula from the
  partner's snapped position and the viewer's transient position:

| Great-circle distance | Band |
| --- | --- |
| < 2 km | `NEARBY` (never finer), unless **both** positions are precise: `CLOSE` with the tiers 0–300 m, 300 m–1 km and 1–2 km |
| 2–5, 5–10, 10–25, 25–50 km | `RANGE` with lower/upper kilometres |
| 50–500 km | `APPROXIMATE`, rounded to 50 km |
| ≥ 500 km | `APPROXIMATE`, rounded to 100 km |

The coarser side governs: fine `CLOSE` bands need the partner's snapshot and the
viewer's own position (their own precise choice and a fix of at most 500 m
accuracy) to be precise; otherwise the band is the approximate one. The server
decides this from stored consents and accuracies only, so a client cannot claim
a finer band and the response never says which side was coarse.

Units are a presentation concern: clients format kilometres, or miles for
English US/UK locales, from the kilometre values.

## 5. Retention and freshness

- A snapshot expires 24 hours after its device capture time and is never
  readable afterwards; the periodic presence job deletes expired snapshots,
  snapshots of inactive or suspended consents and snapshots whose consent
  generation is stale.
- Capture times must lie between 24 hours in the past and 2 minutes in the
  future relative to server time.
- Responses carry the capture time. A distance carries the **older** of the
  two capture times. Clients present values older than 2 hours as an earlier
  state ("earlier today", "yesterday") and never as live.
- Snapshots are excluded from content exports, backups-as-content and
  restores. Consent metadata (level, duration, timestamps) follows the normal
  account data-rights policy. Account deletion, Space deletion and membership
  removal cascade.

## 6. Energy efficiency (binding, PO 2026-11-13)

Indefinite sharing must stay energy-efficient for unlimited duration.

- Approximate (the default): Android `ACCESS_COARSE_LOCATION` with network or
  fused providers; Web `enableHighAccuracy: false`. No GPS.
- **Precise (opt-in, PO 2026-11-17):** Android also holds `ACCESS_FINE_LOCATION`,
  requested together with the coarse permission so Android 12+ shows its
  Precise/Approximate switch, and only after the person chose "precise". On
  open/resume exactly one measurement is taken (fused, then GPS, then network,
  at most 20 s in total); a cached fix is reused only if it is younger than
  3 minutes and itself reports at most 500 m. Web uses `enableHighAccuracy: true`
  for that single measurement. This is the only place where the feature asks for
  a high-accuracy fix; it never runs in the background and never continuously.
- On open/resume, reuse a last known location younger than 10 minutes (3 minutes
  for a precise choice) before requesting one new fix. No continuous updates
  while a screen is open.
- The optional background update (opt-in toggle, Android only) uses the
  passive facility (`PRIORITY_PASSIVE`) with a minimum displacement of 1 km, a
  minimum interval of 15 minutes and batched delivery. No foreground service,
  wake locks, exact alarms or jobs that trigger new fixes; no silent fallback
  to active location. `ACCESS_BACKGROUND_LOCATION` is requested only when the
  toggle is switched on. With a precise choice the same passive facility is
  used with a minimum displacement of 200 m: eimir. still never starts a
  measurement in the background, so the fixes are as precise as what Android or
  other apps already computed, and the device rounds each one to the precise
  grid before it is stored or uploaded.
- Publish only after a displacement of at least 1 km (200 m for a precise
  choice) since the last publication, or when the last publication is older
  than 6 hours. The server
  enforces at most 60 publications per Account and hour.
- No push messages for distance changes; partners read on open/resume.
- Background uploads use a **presence device credential** issued by the Web client for the active share. It authorizes only `PUT /partner-location/device-snapshot` for its owner and is stored only as a hash. It is bound to the issuing device session, so sign-out, revocation and session expiry end it. It is also bound to the consent generation, so any settings change ends it. It expires after at most 30 days and is limited to three devices per owner. The app rotates it on every open. When a share is inactive the server answers `active: false`, and the device then deletes the credential and unregisters. The device never refreshes the Web session.
- Acceptance: on a real Android device over 24 hours with indefinite sharing
  and the background toggle on, the feature's attributed battery use stays at
  or below 1 % per day and Doze/App Standby are respected. With an approximate
  choice Android's location access history shows no high-accuracy requests; with
  a precise choice it shows at most one per open/resume and none in the
  background.

## 7. Abuse resistance

- Distance reads are limited to 60 per Account and hour and map reads to 120,
  bounding trilateration by a moving viewer in addition to the bands. Fine bands
  and the small map area exist only for a person who chose precise sharing, and
  a precise choice never reveals more than its grid (§4).
- All unavailable cases return the same neutral response shape.
- Coordinates are accepted only in request bodies, never in URLs or query
  strings, and are excluded from logs, traces, analytics, notifications and
  admin views.

## 8. Operations

- `EIMIR_PARTNER_LOCATION_ENABLED` (default `true`) lets an operator disable the
  feature; clients then hide the start prompt and settings entry. `OFF` writes
  stay accepted so existing shares can always be stopped.
- No external provider is needed; distance is computed in the API process.
- Map tiles reuse the existing MapLibre/OpenStreetMap configuration.

## 9. Sources and destinations

This slice ships **this device** as the only source. Dawarich is **optional**
(§49: the product must function completely without Dawarich); where offered it
is an opt-in Premium source under the External Integrations row and is never a
prerequisite or default. External archiving remains a separate #1524 purpose
with its own consent.

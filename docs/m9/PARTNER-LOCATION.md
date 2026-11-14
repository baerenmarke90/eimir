# Partner location and distance — M9 contract

**Status:** normative readiness contract for #1792 (first slice) on the #1524 foundation.
**Product Owner decisions:** #1524 (2026-10-30: bounded and indefinite sharing),
#1792 (2026-11-13: distance levels, map destination, start prompt, bands,
energy efficiency, Dawarich optional, complete feature Premium).

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

- Published positions are snapped to a 0.01° latitude/longitude grid
  (≈ 1.1 km north–south) before storage. The raw device fix is not stored.
- The stored accuracy is the reported accuracy rounded up to 100 m, never below
  1,000 m.
- The map projection exposes the snapped position and an approximate-area
  radius of at least 1,500 m. Clients must render an area, not a precise pin.
- Distance bands (PO 2026-11-13), computed with the haversine formula from the
  partner's snapped position and the viewer's transient position:

| Great-circle distance | Band |
| --- | --- |
| < 2 km | `NEARBY` (never finer) |
| 2–5, 5–10, 10–25, 25–50 km | `RANGE` with lower/upper kilometres |
| 50–500 km | `APPROXIMATE`, rounded to 50 km |
| ≥ 500 km | `APPROXIMATE`, rounded to 100 km |

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

- Approximate location only: Android `ACCESS_COARSE_LOCATION` with
  `PRIORITY_BALANCED_POWER_ACCURACY` or `PRIORITY_LOW_POWER`; Web
  `enableHighAccuracy: false`. This feature never requests high-accuracy/GPS
  fixes.
- On open/resume, reuse a last known location younger than 10 minutes before
  requesting one new fix. No continuous updates while a screen is open.
- The optional background update (opt-in toggle, Android only) uses the
  passive facility (`PRIORITY_PASSIVE`) with a minimum displacement of 1 km, a
  minimum interval of 15 minutes and batched delivery. No foreground service,
  wake locks, exact alarms or jobs that trigger new fixes; no silent fallback
  to active location. `ACCESS_BACKGROUND_LOCATION` is requested only when the
  toggle is switched on.
- Publish only after a displacement of at least 1 km since the last
  publication, or when the last publication is older than 6 hours. The server
  enforces at most 60 publications per Account and hour.
- No push messages for distance changes; partners read on open/resume.
- Background uploads use a **presence device credential** issued by the Web client for the active share. It authorizes only `PUT /partner-location/device-snapshot` for its owner and is stored only as a hash. It is bound to the issuing device session, so sign-out, revocation and session expiry end it. It is also bound to the consent generation, so any settings change ends it. It expires after at most 30 days and is limited to three devices per owner. The app rotates it on every open. When a share is inactive the server answers `active: false`, and the device then deletes the credential and unregisters. The device never refreshes the Web session.
- Acceptance: on a real Android device over 24 hours with indefinite sharing
  and the background toggle on, the feature's attributed battery use stays at
  or below 1 % per day, Android's location access history shows no
  high-accuracy requests and Doze/App Standby are respected.

## 7. Abuse resistance

- Distance reads are limited to 60 per Account and hour and map reads to 120,
  bounding trilateration by a moving viewer in addition to the coarse bands.
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

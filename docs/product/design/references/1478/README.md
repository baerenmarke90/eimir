# Readable photo places and direct maps — #1478

## Baseline and scope

Inspected main `4c11ed43ccb3ffb917fe9ed408f6bd251d8f4099`: MemoryProductPage,
HeartMomentProductPage, MomentPlaces, canonical Place CRUD/typed relations,
photo-location creation, PostgreSQL jobs, current photo-place browser journeys,
Product Reference v1 R2/R5, and the #1459 rendered Compact screen.
The owner requested automatic readable names/addresses and direct map activation,
including existing untouched photo Places. This extends the former no-geocoder
scope of #1459. #1477 remains independent: no attachment, gallery, capture,
classification, reveal, or content-binding changes.

## Mobile Interaction Contract

The photograph and authored words remain the focus. After them, render quiet,
unboxed location context: name, underlined address and a secondary overflow.
The address is the map destination, pinned to original canonical coordinates;
it never opens the technical Place form. The existing contextual sheet retains
correction and confirmed unlink. With no address, show an explicit localized map
action. No invented address or venue. Name-only/manual Places remain readable.

Reuse the existing semantic typography/spacing/color/target tokens, Icon,
ShortTaskSheet, authorized query identity, canonical edit/return and safe map URL.
Compact is primary at 320/360/390/430 px; Expanded preserves reading width and
content hierarchy. Preserve photo, prose, tags, comments, provenance and floating
navigation. No automatic keyboard. Semantic links and buttons, named overflow,
44 px targets, visible focus, long-address reflow, Light/Dark and reduced motion.
No new motion: the existing sheet explains its own entry/exit; enrichment updates
text without moving focus or changing the media geometry. One person completes
the flow alone; no partner confirmation or equal-contribution requirement.

Loading/error/offline retain saved content. An unresolved address has a usable
coordinate map link. Provider failure never rolls back a successful Memory save.
No map SDK, tile, preload or geocoder call originates in the browser on reading.

## Visual reference

![Generated whole-screen Compact reference](compact-photo-place.webp)

Generated with ImageGen before UI implementation, from the actual #1459 Compact
screen. The example name/address is illustrative fixture content, not the owner's
location or a verified real venue. Keep the accessible section heading in runtime;
the generated image omits it. This is composition guidance, not runtime evidence.
The exact prompt is recorded in `image-prompt.txt`.

## Reuse review (2026-10-28)

Reviewed official sources:

- Photon: https://github.com/komoot/photon and
  https://github.com/komoot/photon/blob/master/docs/api-v1.md
- Nominatim public-service policy:
  https://operations.osmfoundation.org/policies/nominatim/
- Geoapify reverse API and commercial/cache/attribution terms:
  https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/ and
  https://www.geoapify.com/terms-and-conditions/
- Existing explicit Maps URLs:
  https://developers.google.com/maps/documentation/urls/get-started

Select a replaceable Photon reverse adapter using existing HTTPX and normalized
GeoPoint/PlaceCandidate vocabulary. Photon is Apache-2.0; underlying OSM data
requires attribution. Public Photon permits reasonable project use without keys,
but throttles heavy usage, supplies no availability guarantee and may change.
Use bounded serialized requests and durable retries; operators may replace the
base URL with their own Photon service or disable enrichment. This small pilot
does not certify the public demo as a commercial SLA. A managed launch needs an
operator-owned availability/privacy review or dedicated service.

Reject public Nominatim: its policy excludes personal/confidential material.
Geoapify is a viable managed candidate with an operator API key, plan/attribution
and service terms; do not create an account or accept a paid agreement here.
OS geocoders alone do not cover Web and require a separate native path. Do not
write a geospatial index, map SDK, parser, or second Place store.

Only saved coordinate pairs and a bounded language reach the configured service,
from the backend; never photo bytes, EXIF blobs, titles, account/Space IDs or
credentials. Public service receives the server IP and request coordinates.
Update existing feature copy/privacy documentation to disclose this. No public
coordinate cache across couples. Resolved canonical text uses existing protected
payload encryption, export/deletion and versioning. Maps receives coordinates only
after deliberate link activation. Its URL never changes saved coordinates.

## Business and quality

Business/freemium impact reviewed: basic photo-place context and map navigation
remain Free/Core, identical Cloud/Self-Hosted, with no entity quota, entitlement,
storage copy, Pro source-selection change, or destructive downgrade. Amend the
matrix's former no-geocoder statement; provider operation is a backend concern.

Reuse the PostgreSQL queue for asynchronous enrichment and bounded old-data
repair. Job payloads contain only canonical IDs, not coordinates/content. Recheck
active owner/Membership, consent, shared automatic relations, canonical version
and untouched placeholder before any egress or mutation. Manual edits and unlink
win. Keep retries, maximum response bytes and timeouts bounded; no exception URL,
address or coordinates in logs. Reject malformed, missing and distant candidates;
retain original coordinates. No new client endpoint or attachment schema is needed.

Required evidence: transport/parser negatives, PostgreSQL old/new/manual/privacy/
consent/deletion checks, direct-address-link client regression, canonical correction
and unlink journeys, Compact/Expanded Light/Dark screenshots, reflow and axe.

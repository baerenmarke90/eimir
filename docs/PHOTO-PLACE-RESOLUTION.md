# Readable photo Places (#1478)

New automatic Places enqueue one ID-only job in the existing PostgreSQL worker.
The saved Memory is available immediately. MomentPlaces refreshes unresolved
results while visible, with at most 20 successful/failed reads per query lifetime;
resolved names stop the interval. Reading never calls the geocoder synchronously.
Worker startup and each existing five-minute maintenance check enqueue up to 25
untouched old automatic Places. Completed/failed jobs prevent repeated scanning
of the same Place. No photo re-upload or database migration is required.

The worker rechecks active owner/Membership, current preference, shared target,
automatic relation, initial Place version, generic initial name and the captured
preference version. Turning OFF and back ON cannot replay an old pending lookup. A correction
or removed association wins. A successful lookup updates the same protected
Place payload, increments its canonical version and records the normal content-free
Place event. It never changes the original saved coordinates or makes an automatic
relation manual. A lookup with no trustworthy nearby result leaves the map action
available; it does not invent a venue or house number. Provider data is approximate
and can be corrected through the existing contextual action.

## Operator configuration

`EIMIR_PHOTO_PLACE_GEOCODING_URL` is a Photon HTTP(S) origin, defaulting to
`https://photon.komoot.io`. An empty value disables enrichment while retaining
GPS association and direct map navigation. API and worker must use the same value.
The shared Compose environment forwards the setting, including an explicitly
empty value. Operators may use their own Photon origin; do not expose its update
or administrative endpoints or put credentials/query parameters in this setting.
No ordinary person enters an API key, provider URL or infrastructure setting.

Public Photon permits reasonable project use but provides no availability SLA;
do not equate this pilot default with approval for a commercial managed launch.
The adapter makes no paid account or service agreement. Review an operator-owned
service or managed geocoder, privacy terms, capacity and attribution before such
a launch. See the [recorded review](product/design/references/1478/README.md).

Requests contain coordinates and language only. OSM attribution is retained in
the protected payload, authorized Place projection and rendered location context.
There is no third-party tile/SDK dependency, cross-Space cache or coordinate log.
Normal HTTP libraries are already suppressed by the application logging boundary;
controlled errors expose only `PHOTO_GEOCODING_UNAVAILABLE`.

One deployment-wide reservation allows one lookup per two seconds, including
failures; the existing queue defers excess work without spending a retry attempt.
Transport failures receive at most five normal exponential-backoff attempts.
The HTTP adapter rejects redirects and compressed/oversized responses, bounds
read/connect time, validates finite original coordinates, and accepts only a
nearby point within 200 m. Candidate coordinates never replace the original pin.
Place fields use bounded provided strings; no reverse-geocoding result can
reconstruct previously stripped photo metadata.

## Parallel integration

#1477 owns Attachment classification, binding flags, capture/recovery and media
reveal. This change adds no field to those contracts and changes no gallery.
The only attachment-path addition schedules a job after an automatic Place link
has been committed to the current transaction. Both changes share the authoritative
OpenAPI snapshot and feature matrix; regenerate the complete schema after combining
them rather than choosing either snapshot. The optional `geocodingSource` addition
is limited to PlaceDetail; old clients ignore it and old payloads default to null.
Transfer uses the existing protected-payload serializer and preserves source data.

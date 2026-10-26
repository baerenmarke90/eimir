# #1444 — Internal Immich selected-photo reader

Review: 2026-10-26, `main@fe59df8c41848d156c4dd8367ae5b2f1c6d423b2`.
Owner: [#1444](https://github.com/baerenmarke90/eimir/issues/1444).

## Delivery boundary

`backend/src/eimir/providers/immich_photos.py` is an **internal, unregistered**
reader of one already deliberately selected still-image UUID. No API route,
feature configuration, registration, background job, search, library listing,
sync, credential store or consumer UI is added. No live Immich account or photo
was used. This is not a completed user-facing import.

It returns bounded memory bytes, an advisory MIME and a generic filename. It
does not create or bind an Attachment. A future integration must use the
existing authorized upload/validation/READY/save flow and scoped handoff in
[PR #1460](https://github.com/baerenmarke90/eimir/pull/1460), without a second
gallery, MediaStore or universal provider framework.

## Official contract and reuse

Based on official [Immich v3.3.5 OpenAPI](https://github.com/immich-app/immich/blob/v3.3.5/open-api/immich-openapi-specs.json):

| Request | API-key permission | Purpose |
| --- | --- | --- |
| `GET /api/assets/{id}` | `asset.read` | Verify the selected ID and available image metadata |
| `GET /api/assets/{id}/original` | `asset.download` | Read that image's original bytes |

Use `x-api-key` headers only. API-key scopes restrict operations, not individual
assets; a UUID is not consent. [Immich OAuth](https://docs.immich.app/administration/oauth/)
describes sign-in to Immich through an external IdP, not a delegated external
photo picker. No password, eimir. login token, automatically created public
share or household-wide operator credential is a shortcut.

Alternatives reviewed: browser/system selection (retained fallback), Immich
SDK/server embedding, existing discovery-oriented ExternalMediaProvider, httpx
default networking and a small independent fixed-path reader. Reuse Python
HTTP/TLS/IP/JSON and Pydantic SecretStr. Custom connection logic is necessary to
pin validated DNS to the actual socket while verifying the original hostname.
Existing UnifiedPush pinning informed the security pattern without coupling
push/provider semantics. Immich is [AGPLv3](https://github.com/immich-app/immich/blob/v3.3.5/LICENSE);
no server/SDK code is copied or bundled and no dependency is added. Cloud does
not operate Immich or promise free hosting/bandwidth; instance operation, rights,
maintenance and terms remain the operator's responsibility.

## Security and resource behavior

- Exact administrator-owned lowercase HTTPS origin only; no port, base path,
  userinfo, query, fragment or destination override. Fixed paths from canonical
  UUIDs; never follow returned URLs, filenames or redirects.
- Validate **all** DNS answers before sending credentials. Reject mixed,
  private, loopback, link-local, metadata, multicast/reserved, scoped IPv6 and
  transition destinations. Each connection freshly resolves/validates and uses
  a numeric socket destination with original-host TLS verification/SNI/Host.
  No environment proxy, second resolution or TLS verification opt-out.
- Five-second DNS wait, two resolver slots, thirty-second whole-selection
  deadline and socket-shutdown watchdog for slow headers/body. An active OS
  resolver can outlive its bounded wait; occupied slots reject further work
  instead of growing a queue. JSON <=256 KiB; images use existing 25 MiB limit.
  Reject encoding expansion, bad framing/length, unsupported types and empty or
  excessive bodies. No archives.
- Verify exact returned ID, IMAGE type, supported MIME, explicit online and
  not-trashed state. Foreign filenames/paths/people/location metadata do not
  cross the normalized boundary. Existing image inspection, dimensions,
  metadata stripping and authorization remain mandatory; HTTP MIME is advisory.
- Fixed errors omit upstream exceptions, bodies, URLs and keys. Reprs hide
  reader configuration and media bytes. No logging/persistence is added.

Cloud and Self-Hosted both support only public HTTPS targets in this internal
slice. Private-LAN Immich requires a separate narrow operator endpoint/network
trust and isolation decision. Cloud has no implicit home-LAN connection. A
global private-network opt-out is not acceptable; reachability is not consent.

## Product, commercial and production gates

**Business/freemium impact reviewed:** Immich external integration remains
Premium (`integration.external_sync`) under the authoritative feature matrix,
equally Cloud/Self-Hosted. No capability, quota, user option or downgrade changes.
Local image uploads remain Free/Core; existing data remains readable/exportable.

Before a public route or source choice uses this reader, complete:

1. Per-Account credential/connection ownership, deliberate selection handoff,
   consent, disconnect/revocation/deletion; no normal-user URL/key setup or
   cross-Space/operator-library access.
2. Premium enforcement or explicit versioned owning matrix decision. The old
   feasibility recommendation cannot override the authoritative Immich row.
3. #797's remaining security/operational acceptance. Application payload/media
   encryption exists; no E2EE or Cloud certification is claimed.
4. Reviewed secret custody, authenticated-route rate/concurrency/resource
   limits, deployed egress behavior and a real synthetic Immich test.
5. Current **#1458 diary** checkpoints selected Files to owner-local IndexedDB
   for seven days. Naive provider wiring would enter that persistence path.
   Review provider-specific consent, retention/encryption/deletion and recovery
   first; do not claim a memory-only/no-persistence Google production flow.
   The scoped handoff is volatile but downstream Files use normal draft
   lifecycle. Google verification and permitted durable-copy/partner-sharing
   approval remain additional hard gates.
6. Refresh the source-choice visual/Mobile Interaction Contract against the
   current date/prose-first diary: date, narrative, photos/reordering, optional
   title/tags, recovery/local status, fixed sharing and save. The older #1444
   photo-first concept is historical. Before UI ships, verify Compact/Expanded,
   Light/Dark, Touch/keyboard/screen reader, 320 px/200% text, reduced motion,
   failure/offline/partial outcomes and actual external return-to-draft behavior.

## Validation

92 tests passed across the new suite and existing provider contracts. Real HTTP
response parsing over fake sockets verifies paths/header auth, numeric target
and TLS hostname, mixed/private/transition DNS, rebinding, redirects/revocation,
malformed/oversized media, encoding/framing, timeouts/slow headers, unavailable
assets and redacted errors. Ruff format/lint and strict mypy pass. Independent
security review found no remaining blocker within this internal scope. Mocked
tests do not prove live provider consent, production copy or device acceptance.

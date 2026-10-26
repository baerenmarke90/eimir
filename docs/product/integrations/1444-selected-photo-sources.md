# #1444 — Selected photo sources: implementation preflight

**Review date:** 2026-10-26.
**Reviewed baseline:** `main@3955f44435f880fb9424602f7a2dcfbd17726148`.
**Owner:** [#1444](https://github.com/baerenmarke90/eimir/issues/1444). Related: [#1451](https://github.com/baerenmarke90/eimir/pull/1451), [#220](https://github.com/baerenmarke90/eimir/issues/220), [#601](https://github.com/baerenmarke90/eimir/issues/601), [#797](https://github.com/baerenmarke90/eimir/issues/797).
**Delivery boundary:** preparation for selected-image import in the existing Web-first Memory composer. This document does not approve production Google or Immich access.

## Evidence and existing architecture

The operator confirmed a real HTTPS Web-client Google OAuth/Picker test on 2026-10-26: one deliberately selected synthetic image was transferred and discarded in memory (3,000,825 bytes), and the remote Picker session was deleted. This is operator-reported live evidence, not an independently repeated test. No image was stored in eimir. It proves the tested consent/selection/transfer/cleanup path; it does not prove production eligibility, attachment binding, persistent partner sharing, or mobile round-trip acceptance. Keep account identities, codes, credentials, Picker/media URLs, provider IDs and media out of GitHub. PR #1451 remains temporary operator tooling, not the product importer.

Reviewed destination: `MemoryCreatePage.tsx` and `AttachmentDraftPicker.tsx`. Current composition is task header/Close → local image action and previews → narrative → suggested/custom tags → optional title → local date summary/change → fixed shared-audience note → Cancel/Save. Preserve all these functions. Do not add a private Memory toggle, second gallery, second media store, settings dashboard or independent save path.

Reuse `useAttachmentDrafts`, `attachmentDraftState`, `memoryAttachmentDraft`, `referenceFlow`, owned object URLs, F2 task/origin ownership, `ShortTaskSheet`, existing i18n and semantic tokens. Files enter the existing bounded upload queue, validation, READY wait, retry/remove, parent save/bind, canonical result and orphan cleanup. #601 remains a read projection of saved authorized shared images. The old `ExternalMediaProvider.find_by_date/find_near` interface describes discovery references; it must not be expanded into a universal picker framework.

## Reuse, operating model and commercial decision

Keep the browser/system file picker as the universal fallback. Google Photos Picker is the official least-privilege Google selection route; broad Library API access and library synchronization remain excluded. Immich is an optional externally operated, self-hosted source. Use existing HTTP/runtime facilities for a small independent adapter; do not copy Immich server code or add its SDK without a separate dependency/license review. Immich server source is [AGPLv3](https://github.com/immich-app/immich/blob/v3.3.5/LICENSE); HTTP interoperability does not mean eimir. bundles or operates Immich.

**Business/freemium impact reviewed:** image upload/storage remains Free/Core with existing Cloud byte quotas. The authoritative `FREEMIUM-FEATURE-MATRIX.md` v1.4 explicitly classifies **External Integrations (Immich, Dawarich, CalSync) as Premium**, mapped to `integration.external_sync`. The earlier feasibility recommendation does not override this row. Preserve that boundary before exposing Immich, or obtain an explicit owning product decision and versioned matrix change. The internal unregistered slice adds no entitlement, provider option, storage allowance or paywall to existing uploads. Essential privacy, validation, accessibility, deletion and export remain non-paywallable; existing content remains readable/exportable after downgrade.

Hosters configure technical origins and credentials; normal couples never enter API keys, server URLs or tokens. Each connection must be explicitly bound to the consenting eimir. Account and authorized Space. Never turn one operator credential into shared access to an entire household library. Cloud has no automatic route to a user's private LAN; private-instance support needs a separate reviewed connectivity decision. Public HTTPS reachability alone is not consent. Requests, inbound bytes, validation, storage and thumbnails have operating costs under existing resource limits; no API-price, bandwidth or availability promise is made.

## Current Immich contract

Review pinned to official **v3.3.5**, released 2026-10-21, using the [versioned OpenAPI](https://github.com/immich-app/immich/blob/v3.3.5/open-api/immich-openapi-specs.json). API root is the configured origin plus `/api`.

| Operation | Endpoint | API-key permission |
| --- | --- | --- |
| Read one selected asset's metadata | `GET /api/assets/{id}` | `asset.read` |
| Download that asset's original | `GET /api/assets/{id}/original` | `asset.download` |
| Optional preview, outside the first transport slice | `GET /api/assets/{id}/thumbnail` | `asset.view` |
| Optional credential-owner verification | `GET /api/users/me` | `user.read` |

Use `x-api-key` only in an HTTPS request header. API-key scopes restrict operations, **not individual assets**. Immich's [OAuth configuration](https://docs.immich.app/administration/oauth/) makes it an OIDC client for sign-in; it does not establish a delegated, per-photo authorization service for eimir. No official external hosted picker was established by this review. Do not collect an Immich password, reuse an eimir. login token, or label an API key as per-asset OAuth consent. Immich [shared links](https://docs.immich.app/features/sharing/) can scope selected content, but their bearer-secret, password, expiry and download semantics need a separate connection/selection decision; never silently create public shares.

The first adapter accepts an already deliberate, bounded selection of canonical UUIDs from a trusted integration boundary. It never discovers or enumerates a library, searches metadata, follows albums, downloads archives, reads sync/timeline APIs, or imports Live Photo video partners. Accept supported still-image types only; reject video, RAW, trashed, offline, unknown and oversized results. Ignore foreign file paths and unrelated people/location metadata. Treat MIME metadata as advisory; existing eimir. byte inspection remains authoritative. Return normalized selected bytes, not durable foreign URLs or metadata copies.

## Transport and SSRF security plan

The internal adapter has no public route, dependency registration, production configuration, persistent credential store or enabled UI. An injected test transport is not proof of safe production networking.

Before a real transport can be enabled:

1. Resolve only an operator-registered exact HTTPS origin; no caller-supplied URL, scheme, port, base path, credential or destination override. Reject userinfo, fragments, query credentials, ambiguous host syntax and non-canonical asset IDs. Construct fixed API paths locally.
2. For the first network-capable slice, allow **public destinations only**. Validate every DNS result, including IPv4-mapped IPv6; reject mixed public/private answers, loopback, link-local, metadata, reserved, multicast and non-global addresses.
3. Pin the validated destination to the actual socket connection while retaining the original hostname for TLS SNI/certificate verification and Host. Checking DNS and then letting the client resolve again is insufficient. Revalidate and repin on each new connection; do not merely cache an initial public answer. Test rebinding explicitly.
4. Disable redirects and environment-derived proxies. Never forward credentials to a returned URL or different origin; no TLS-verification bypass. Set connection/read/overall deadlines, concurrency limits and bounded JSON/image reads, including decompressed output. Reject unexpected status/content type/encoding and excessive declared or actual length.
5. Do not log request/response URLs, headers, upstream bodies, file paths, filenames, credentials or provider exception text. Return fixed internal error codes. Keep temporary state/bytes volatile; any future persisted credential/state needs the reviewed encrypted boundary.

**Explicit blocker:** private Self-Hosted Immich access is not supported by the public-only first transport. It requires a separate narrow operator endpoint/network allowlist, connection pinning, isolation and threat-model decision. Do not add a global “allow private networks” switch or claim Cloud can reach private LANs. No production transport ships until its actual connection behavior is verified.

## Security and Google production gates

#797 is open, but application encryption is not wholly missing: `ENCRYPTION-AT-REST.md` §16 records implementation in #1177, including protected payloads, encrypted MediaStore and fail-closed Cloud Production configuration. Outstanding acceptance includes recorded human architecture review, production-like ciphertext/operational verification and recovery/restore evidence, plus the documented owning key/row-binding/identity-column decisions. Neither mocked tests nor default infrastructure SSE close these gates. Do not claim E2EE or certify Cloud go-live.

Google enablement additionally requires recorded provider eligibility/verification for **selected download → durable eimir. Memory copy → partner access**, verified deployment OAuth configuration, current privacy/support/disconnect/delete guidance, compliant in-context consent and Limited Use. The [Google Photos policy](https://developers.google.com/photos/support/api-policy) allows suitable user-benefiting export/sharing but prohibits competing general-purpose gallery substitutes and requires secure data/credential storage. The live probe is not policy approval.

Request only `photospicker.mediaitems.readonly`; use official Picker endpoints and provider-returned selection, bounded to remaining attachment capacity. Bind transient authorization/session state to Account, Space and draft generation, with state/PKCE/CSRF, expiry, replay rejection and remote-session cleanup. No arbitrary fetch proxy, persisted Picker URLs, refresh-token storage or background synchronization. Browser/Capacitor OAuth must use the compliant external/system-browser boundary and retain the authored draft safely.

## Mobile Interaction Contract for the eventual UI slice

**Normative references:** Product Reference v1 R1, current R1 capture, Create/Edit template, F2 task boundaries, shared component contracts and semantic tokens. This contract is preparation, not a claim that source controls are implemented.

| Concern | Contract |
| --- | --- |
| Human/emotional outcome | Deliberately bring a few personally meaningful photos into the Memory being written, with confidence about partner sharing. |
| Primary Compact screen | Existing full focused “Neuer Moment” page, retaining photo/local picker, previews, narrative, suggested/custom tags, optional title, date, fixed shared audience and Cancel/Save. |
| Focal content/action | Authored photo/narrative leads; Save remains the single dominant completion. Source selection is secondary to keeping the Memory. |
| Visibility/disclosure | Keep the current fields/audience visible. A short source choice opens only from the existing photo entry. Required access/copy/sharing disclosure appears immediately before affirmative external authorization/import; closing or leaving never counts as consent. |
| Interaction/focus | Reuse a named `ShortTaskSheet` on Compact with visible Close, intentional initial focus, focus containment, inactive background, Escape/Back and return to the photo trigger. A provider's external selection returns to the same task. Nested sheet closes before composer exit. No gesture-only dismissal. |
| Loading | Announce source-selection/download status; allow safe cancel. Existing previews and text remain. Do not confuse selection, staging upload, validation and saved Memory. |
| Empty/cancel | No-selection return leaves existing files/text/tags/date intact and restores the trigger. Keep the device picker available when a provider is unavailable/unconfigured. |
| Error | Localized denied/expired/revoked/unreachable/unsupported/limit/partial failures retain the draft, expose explicit retry or alternative source, and never display upstream secrets/URLs. No automatic reconnect import. |
| Offline | Preserve in-session work; external selection unavailable with clear explanation. Existing local selection behavior remains; no offline outbox or cross-process draft survival promise. |
| Success | Selected Files enter existing private unbound staging, preview/progress/READY/remove/retry. Only confirmed Save/bind makes a shared Memory; then open the canonical result and preserve valid origin/return context. Preserve uncertain/partial-save recovery. |
| Privacy/relationship | Source connection remains private; the Memory audience remains fixed/shared. Explain selected-only access and that staging transfers bytes before Save. Cancellation cleans staging but cannot mean no bytes ever transferred. Invalidate all pending source completions on Account/Space/task changes. |
| Narrow/large text/touch | Verify 320/360/390/430 CSS px, 200% text, long localized labels, 44px Web/48dp Android targets, safe area/IME and keyboard/screen-reader navigation. No horizontal discovery or early keyboard activation. |
| Motion | Reuse restrained F2 sheet/progress/result feedback and semantic motion tokens; reduced motion preserves identical state/focus semantics. |
| Expanded | Same hierarchy with useful width and shared contextual overlay primitives. Explicit Close, disclosure and keyboard behavior remain; no permanent provider column or management table. |
| Pattern/reuse rationale | Bounded source choice fits the established short-task sheet. Existing OS/browser picker and external provider selector handle deliberate selection; no new gallery or master-detail surface is justified. |
| Generated reference | Planned artifact: `docs/product/design/references/1444/photo-sources-compact.png`, based on the baseline above and the complete inventoried composer. Attach it to #1444 before UI implementation. A contextual popover in the illustration is composition guidance only: the accessible Compact implementation must use the sheet/Close/disclosure contract above. |
| Visual acceptance | Exact submitted build: Compact 360/390/430 plus 320 reflow/200% text; Expanded; Light/Dark; sparse/dense selected files; reduced motion; open → select/cancel → stage → save → canonical result → return. Screenshots plus behavior/focus/Back evidence; physical Android external round-trip where relevant. |

All new product copy belongs in i18n. No normal-user technical URL/key setup, invented private audience or provider availability promise. Current navigation/task shell, tag editing and date controls must remain represented in the generated reference; regenerate if the destination materially changes before UI implementation.

## First mergeable slices and acceptance

**Slice A — no UI, asynchronous selection safety:** extend the existing attachment normalization boundary narrowly to accept selected `File` collections while retaining local `FileList` callers. Introduce an opaque, one-use selection ticket bound to mounted Account/Space/draft generation. Late results after clear, replacement, cancellation, unmount, context switch or completion are ignored before object URL allocation/upload. Apply current capacity at acceptance, not only when selection starts. Preserve queue limits, error/retry behavior and disposal ownership. No provider registry, source button, OAuth route or runtime provider feature flag is added.

The implemented handoff is `useAttachmentDrafts.beginSelection()`, returning
`signal`, `commit(readonly File[])` and `cancel()`. Acquire it **before** starting
an asynchronous source operation, pass its abort signal to that operation, and
cancel on failure/no selection. Commit exactly once after obtaining selected
Files; a false result means the launch ownership expired, even if the provider
ignored abort. A true result means delivery to the existing capacity/upload
flow, not that every file fit, passed validation or was saved. Inspect the
existing rejection/progress/error/READY state. Account, Space, draft reset,
server endpoint and unmount invalidate pending handles; an ordinary session
token refresh does not. Only committed React transport props are used, including
while another render is suspended. Old upload completions cannot release a new
generation's queue slots.

**Slice B — internal Immich selected-photo adapter:** versioned metadata/original request construction and strict response normalization for deliberately selected UUIDs, with bounded image transport behind an injected boundary. No production registration/configuration, library enumeration, direct attachment persistence, entitlement bypass or public proxy. Unit evidence proves the adapter contract; it does not claim an actual Immich live test or safe production networking.

Required acceptance before these slices merge:

- [x] Focused tests reject stale, replayed, cancelled and wrong-context selection results; clear/unmount allocate no previews or uploads; local picker behavior and current capacity/queue remain correct. Includes a true-red/green suspended-render transport regression and stale queue-slot regression.
- [ ] Adapter tests cover exact paths/header-only credentials; canonical IDs; still-image restrictions; invalid/oversized metadata/bytes; denied/revoked/offline/upstream errors; fixed sanitized failures; redirect/credential forwarding rejection.
- [ ] No production API route, credentials, config, provider control or network access is enabled. Security/SSRF limitations are explicit and tested where implemented.
- [ ] Required repository CI, independent code review, branch protection, reuse/business/cross-cutting PR sections and final-head checks pass. Do not weaken tests or required review gates.

Production/UI rollout remains blocked until: Google policy/OAuth and #797 acceptance; safe real pinned transport plus operational limits; per-Account Immich credential/consent and user-selection handoff design; Premium enforcement or explicit matrix decision; generated whole-composer reference and accepted mobile contract; privacy/deletion/disconnect guidance; real provider tests and platform/mobile/touch/A11y/visual QA. Unconfigured deployments retain the existing local picker. Small green preparation PRs do not imply these external/security gates are complete.

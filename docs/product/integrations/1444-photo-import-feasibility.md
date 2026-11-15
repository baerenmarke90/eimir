# #1444 — Google Photos and Apple/system photo import feasibility

**Review date:** 2026-10-26  
**Type:** Source/API/policy/repository feasibility review; **no live OAuth authorization, native device test, implementation, or Google policy approval** performed.  
**Repository baseline:** `main@d9a53a1cb73f5332a42ed57c72b150d5886ffaec`.  
**Owner:** [#1444](https://github.com/baerenmarke90/eimir/issues/1444).  

**Latest delivery status:** later runtime delivery adds the existing-composer
Immich source under its encrypted-state, HTTPS, ownership and Premium boundaries.
Application Google import is hard-gated by [#1467](https://github.com/baerenmarke90/eimir/issues/1467)
pending browser-bound OAuth and safe device-media recovery. The historical
feasibility/preparation review below is not a runtime enablement decision.
**Related:** [#601](https://github.com/baerenmarke90/eimir/issues/601) (existing shared gallery), [#1005](https://github.com/baerenmarke90/eimir/issues/1005) / ADR 0011 (Web + Capacitor), [#220](https://github.com/baerenmarke90/eimir/issues/220) (existing uploads), [#797](https://github.com/baerenmarke90/eimir/issues/797) (Cloud encryption at rest).

**Implementation follow-up (2026-10-26):** [selected Google/Immich sources preflight](1444-selected-photo-sources.md) updates the historical review below. The operator reported successful synthetic Google Web Picker transfer/discard (3,000,825 bytes) and remote session deletion; #1451 merged as `970a3886`. Application payload/media encryption already exists, while #797's security/operational acceptance remains open. The authoritative matrix classifies Immich external integrations as Premium; the earlier Free/Core recommendation below cannot override it. No production Google or Immich source is enabled.

## Decision

| Source / target | Feasibility | Decision |
| --- | --- | --- |
| Standard Web file selection (already implemented) | Available today | **GO — retain as universal fallback**, including mobile Safari/Android browsers. The actual photo-library choices depend on browser/OS. |
| iOS Photos through a system picker (and iCloud-backed selection) | Supported by PhotosUI; native adapter possible after an iOS Capacitor wrapper exists | **GO for the platform capability**, but **not** a claim that eimir. currently ships an iOS app or that every iCloud asset is downloadable offline. |
| Android system Photo Picker (eligible cloud media providers where installed) | Supported by Android; device/provider dependent | **GO for a thin native adapter when needed**; fall back to the browser/file picker or `ACTION_OPEN_DOCUMENT` where applicable, including devices without Google Play services. |
| Google Photos Picker API, explicitly selected media | Official REST API supports OAuth-authenticated user selection and byte download | **CONDITIONAL GO for a scoped technical spike only**. **NO production Google enablement** until policy/verification/privacy/encryption gates below pass. |
| Immich, explicitly selected individual images | Official selected-asset metadata/original APIs; no delegated external picker established | **CONDITIONAL GO for an unregistered internal reader only**. Per-account connection/selection consent, Premium enforcement, pinned egress and production/security acceptance remain gates; no library synchronization. |
| Broad Google Photos Library API access / automatic full library sync | Broad read scopes removed; Library API now app-created content only | **NO-GO** for the proposed third-party library-sync use case. |
| Direct server-side Apple iCloud Photos library API / Apple-ID scraping | No public general-purpose web/server import API established in this review | **NO-GO**. Do not solicit Apple-ID credentials, scrape iCloud, or promise a web-based Apple account connection. |
| Automated/bidirectional photo library sync | Not supported by the selected least-privilege integration paths | **OUT OF SCOPE / NO-GO**. |

The product target is **one-time, user-initiated selection into an existing Memory draft**. eimir. must not become a general-purpose photo backup/gallery competitor or change its attachment/media domain.

## External sources reviewed (official provider documentation)

### Google Photos

- [Photos API release notes](https://developers.google.com/photos/support/release-notes): broad Library API read scopes retired effective 2025-03-31 / release 2025-04-01.
- **REST endpoint correction:** use [Google Photos Picker REST reference](https://developers.google.com/photos/picker/reference/rest), whose authoritative service root is `https://photospicker.googleapis.com` (`POST/GET/DELETE /v1/sessions...`, `GET /v1/mediaItems?sessionId=...`). The [sessions prose guide](https://developers.google.com/photos/picker/guides/sessions) still shows an inconsistent `photoslibrary.googleapis.com/v1/sessions/{sessionId}` example. Do not copy that old example into an adapter; test against the REST reference.
- [Picker API overview and flow](https://developers.google.com/photos/picker/guides/get-started-picker), [session lifecycle](https://developers.google.com/photos/picker/guides/sessions), [REST resource and picking configuration](https://developers.google.com/photos/picker/reference/rest/v1/sessions): create a session; open `pickerUri` as an external page (cannot iframe); poll `sessions.get` according to returned `pollingConfig`; list the selected items; retrieve bytes; delete session. Set `pickingConfig.maxItemCount` to the remaining eimir. Memory attachment slots (20 total max); otherwise Picker defaults to up to 2,000 selections.
- [Authorization](https://developers.google.com/photos/overview/authorization): only `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` is needed for this feature. OAuth users are real Google accounts; service accounts are unsupported. Google states Photos OAuth apps need verification.
- [Media item reference](https://developers.google.com/photos/picker/reference/rest/v1/mediaItems), [selected media retrieval](https://developers.google.com/photos/picker/guides/media-items): picked items include `type`, `createTime`, `mediaFile`; `baseUrl` requires an OAuth Bearer header and valid image size/download modifiers. Links last **60 minutes maximum**, possibly less after revocation. Do not save them as eimir. attachment references.
- [API quota limits](https://developers.google.com/photos/overview/api-limits-quotas): Picker quotas documented as 100,000 requests/min/project, picked media byte access 1,000,000 requests/min/project. These are API-request counts **not** a promise of unlimited storage, bandwidth, no billing, no throttling, or operational acceptance. Respect `429`, response-provided polling intervals, project quotas and session cleanup.
- [Google Photos API policy](https://developers.google.com/photos/support/api-policy): approved categories include user-benefiting storage/export/sharing; explicitly disallows Google Photos substitutes, competing/general-purpose galleries, broad library access outside user-initiated export and prohibited secondary data use. Requires explicit, in-context disclosure/affirmative consent for data access/sharing, Limited Use, deletion support, secure transport, **encryption at rest (including OAuth tokens)** and key management. **A small selection into a couple-specific shared Memory appears plausibly within an allowed sharing/export category, but that interpretation is not approval.** Google must review the real use case, including copying selected images into eimir. storage and future access by the partner.
- [Photos UX guidelines](https://developers.google.com/photos/support/ux-guidelines): identify the Google account in use and provide an obvious disconnect path when connected; disclose what is shared and with whom. A plain text `From Google Photos` action is permitted; avoid incorrect logo treatments. For one-off selection, do not imply ongoing sync/connection.
- [Google OAuth policy](https://developers.google.com/identity/protocols/oauth2/policies), [OAuth best practices](https://developers.google.com/identity/protocols/oauth2/resources/best-practices): **do not perform Google OAuth sign-in in the embedded Capacitor WebView**. Use the system browser/approved native OAuth boundary with exact HTTPS redirect handling, state/PKCE/CSRF protection and return-to-draft checks. This is an extra platform acceptance risk, not a reason to create another native product UI.
- [Configure your Google Photos app](https://developers.google.com/photos/overview/configure-your-app): Cloud project + enabled Photos Picker API + correctly registered OAuth client/redirects; public rollout needs OAuth verification. Google Picker is **not** the unrelated Google Picker API listed in Google Cloud Console.

### Apple and Android

- [Apple PhotosPicker](https://developer.apple.com/documentation/photosui/photospicker) and [privacy-first PHPicker](https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app): return only explicitly selected items and **do not require full photo-library permission**. PhotosPicker supports multiple selection. Downloading an iCloud-only asset may fail while offline; preserve the draft and expose retry. For HEIC/HEIF and large media prefer file-based transfer, not full decoded `UIImage` arrays.
- [Apple Photos picker sample](https://developer.apple.com/documentation/photokit/bringing-photos-picker-to-your-swiftui-app): `Transferable` and file representations; large asset transfers may need visible progress and temporary-file cleanup.
- [Android Photo Picker](https://developer.android.com/training/data-storage/shared/photo-picker): select only user-chosen images; some eligible cloud media providers appear in the system picker, but **not universally**. AndroidX can fall back to `ACTION_OPEN_DOCUMENT`; avoid unnecessary broad storage permissions. Native URI grants are time-bound by default, so stream/copy the selected content promptly, then release resources.
- The Web platform does **not** expose Apple's native PhotosUI/PhotoKit to an arbitrary website. The existing `<input type="file" accept="image/..." multiple>` is the correct Web fallback, not a direct Apple account OAuth connection.

## Fit with current eimir. architecture

- **Source/UI:** `web/src/components/AttachmentDraftPicker.tsx` currently owns the hidden multi-file input and localized draft actions. It supplies `FileList` to `attachments.addFiles`. Extend **this** composer entry, do not add a global Photos tab, provider settings screen or a second gallery.
- **Draft/upload:** `web/src/client/attachmentDraftState.ts`, `web/src/client/memoryAttachmentDraft.ts`, and `web/src/client/referenceFlow.ts` already provide the preview, abort/retry, `File`-based upload, `READY` wait, binding, and failure cleanup flow. Extend the source-normalization boundary only as needed to support selected files from an external provider.
- **Server:** `backend/src/eimir/api/v1/attachments.py` and `docs/m2/MEDIA-PIPELINE.md` own upload/validation, file type, size and exclusivity. Keep the existing authenticated `PENDING → UPLOADING → VALIDATING → READY` lifecycle, attachment ownership and single parent binding.
- **Media limits:** image/jpeg, image/png, image/webp, image/heic and image/heif, **25 MiB each**, 40 MP / 12,000 px per edge, **20 attachments per Memory** and 500 MiB total. Image-only in current product runtime; Picker may let users select videos, but these must be rejected gracefully, never silently uploaded. No unsupported RAW/Live Photo/video enablement.
- **Sharing/visibility:** a selected file may upload to **unbound private staging** before final Moment save, consistent with current preview/upload contract. Only confirmed parent save/bind makes it part of the existing authorized shared Memory and, if applicable, #601's shared-photo projection. On cancellation, cleanup/unbound orphan handling must remain effective; do not claim that cancellation means bytes were never transferred.
- **Auth boundaries:** eimir. already has an OIDC authorization-code/PKCE mechanism for **sign-in**, but **Google Photos authorization must be a separate media permission, never implicitly sign into/link/replace the eimir. Account**. Reuse proven security patterns (state/nonce, exact-origin callback, cleanup) without reusing sign-in semantics.
- **Platform status:** `web/capacitor.config.ts` and `web/package.json` establish current Android Capacitor delivery. iOS is architectural target (#1005), not proven currently shipped; native iOS Photos picker is a **later platform slice**.
- **Privacy and product:** `docs/PRIVACY-MODEL.md`, ADR 0011, Product Reference v1 R1 and `docs/FREEMIUM-FEATURE-MATRIX.md` remain authoritative. Core image attachment upload is Free/Core with Cloud byte quotas. The original recommendation of Free/Core for equivalent source selection is advisory only: **Immich external integrations are explicitly Premium in the authoritative matrix**. Preserve that boundary or obtain a versioned owning product decision before runtime exposure. No premium privacy gates, duplicate media fees or background export behavior.

### Candidate Google data flow (implementation spike, not committed transport)

1. In existing Memory composer, user selects `Add from Google Photos`; show the required in-context purpose/privacy/sharing notice before OAuth.
2. Start a short-lived OAuth authorization flow using `photospicker.mediaitems.readonly`, in a **compliant system browser** on Capacitor; bind state to the initiating eimir. Account, Space and draft generation, with a strict expiration.
3. Create a Picker session, open its `pickerUri` externally, poll only per `pollingConfig` and handle cross-app return, cancellation, expiration, Account/Space switch and duplicate callbacks.
4. List only selected items, paginate and validate expected type/count before downloading; never let caller supply an arbitrary media URL or OAuth token to a generic fetch proxy.
5. **Resolve transport via a bounded spike:** (A) client-side authenticated fetch to Blob/`File` (verify CORS, token exposure, 25-MiB memory and browser/Capacitor constraints) or (B) server-side allowlisted streaming of **picker-returned** media into the existing attachment upload/validation boundary. Prefer the **safer/simpler** approach proven compatible with real Google OAuth, CORS and current MediaStore; neither may bypass validation or create a new independent MediaStore.
6. Use eimir. server-side content inspection, quotas, upload status and parent binding. Do not use Google URLs as durable assets or expose OAuth credentials to Web media caches/logs.
7. Delete the Picker session after retrieval, revoke/expire ephemeral grants where appropriate, remove any temporary byte material and honor provider disconnect and deletion requirements.
8. Preserve authored Memory text/other files, progress, origin navigation, focus and disabled/offline state when external selection fails. Do not silently start new uploads on reconnect.

**Data/metadata caveat:** Google Picker `createTime` is available for selected items, but eimir.'s current sanitized media pipeline does not automatically commit that as the Moment date. A user-editable date suggestion is optional future product scope, not a mandatory inference, especially for multi-photo memories and mixed time zones.

## Privacy, security, operations and release gates

**Hard gates for Google production enablement:**

1. **Provider eligibility / allowed long-term copy:** document, and if necessary obtain provider clarification/verification for, the precise user-selected **download → persistent eimir. Memory copy → private partner access** use case. The official policy supports user-benefiting export/sharing but explicitly rejects a generic Google Photos substitute; **do not self-certify this as unconditionally approved**.
2. **Google OAuth verification:** verified app/domain, correctly scoped client IDs per deployment, configured HTTPS redirects, support/privacy policy, user consent and disconnect/delete help. No serverless service-account workaround.
3. **At-rest encryption:** Google's policy requires encrypted user data and tokens at rest. eimir. **#797 is still open**, but application payload encryption, encrypted MediaStore and fail-closed Cloud Production configuration are already implemented. Review the current acceptance ledger in `docs/ENCRYPTION-AT-REST.md` section 16, including human/security review and live verification/recovery work. Existing Cloud go-live and Google-backed production handling must respect that gate; do not claim #797 passed or treat infrastructure-default SSE as sufficient. Prefer no persisted Google refresh tokens; any persisted provider state still needs a reviewed encrypted boundary.
4. **Transient authorization and SSRF prevention:** provider session and OAuth state bound to the initiating Account/Space; strict official endpoints/redirect allowlist, no open redirect/generic media proxy; token/URL no-store, no credentials in logs/analytics, cancel-on-switch; no background whole-library ingestion.
5. **Explicit user and partner sharing:** clear selected-item-only access, cloud copy and who can read the saved shared Memory; keep existing authorization, deletion/offboarding and export semantics.
6. **Cloud / Self-Hosted:** Cloud operator owns verified OAuth configuration and fees; Self-Hosted may offer admin-configured OAuth client credentials/redirects **only if policy and verification allow**. Normal users never enter provider keys. On an unconfigured host the Google option is absent; the existing device picker remains usable.
7. **Operational costs:** per-session/provider requests, external byte ingress, eimir. stored originals+thumbnails, processing and repeat retries add bandwidth/storage/support cost. API quota figures are not a price promise; verify current commercial terms and run a small bounded load/bandwidth check before rollout.
8. **Platform evidence:** Web mobile/desktop plus Android physical device OAuth round-trip (warm/cold app, Back, draft survival), and iOS device test only after native iOS implementation exists; verify 320 px, 200% text, keyboard/TalkBack/VoiceOver and reduced motion when UI ships.

**Evidence boundary:** The original assessment was desk-level. The subsequent operator-reported synthetic Web OAuth/Picker transfer and session deletion are recorded above and in #1444. Verified publisher/persistent partner-sharing approval, production credentials, mobile round-trip, CORS/client-Blob and physical iOS acceptance are not established by that report or mocked green CI.

## Recommended implementation order and exit criteria

1. **GO now — local/system picker parity:** characterize current Web file input on Android/iOS browser targets; implement a thin native OS picker only if a real capability gap is reproduced. Keep normal image uploads and UI unaffected.
2. **Google policy/verification spike (no private photos in test fixtures):** register/provision a real owner-controlled Google Cloud project/OAuth test client through approved operator workflow, verify the genuine Picker + OAuth + callback behavior using test images only, confirm CORS/transport option and document explicit provider review disposition. No production Google option until all hard gates pass.
3. **Shared source-selection and provider adapter slice:** use the existing R1 composer, draft and upload lifecycle; implement consistent cancel/partial failure/limit/return behavior without a second photo domain.
4. **Acceptance and rollout:** privacy/security review including #797, self-host fallback, matrix classification, operator docs, in-product notice/account disconnect flow, browser contract tests and physical-device evidence.

**Next ready-to-code boundary:** the universal system/file picker path is feasible without any Google credentials or new storage API. **Next Google-specific action:** get OAuth/test verification and provider-policy clarity for this *particular* durable partner-sharing use case **before** feature code is treated as production-eligible.

## Scope of this review

Documentation only; no app UX, API, schema, media store, native code, dependency, or entitlement changes. A generated whole-screen Product Reference and Mobile Interaction Contract remain required under `AGENTS.md` **before** actual new UI/native feature implementation, and are not replaced by this technical review.

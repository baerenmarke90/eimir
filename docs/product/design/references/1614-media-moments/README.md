# Media selection and a living Moments album

Owner: #1614. Preflight: 2026-11-03. Current main: `d594d8a0`;
requested dependency: #1612 at `a7e71d78`. Runtime implementation has not
started when this reference is recorded.

![Integrated Compact reference](compact-reference.webp)

The existing diary date/prose, optional title/tags/place, ordered media,
explicit Save, recovery and return stay in place. One source entry replaces
separate device-photo, video and external-source actions. Reuse the established
system pickers and original-photo consent behind that entry. Providers retain
their actual media/capability limits: the illustration is not permission for
Immich video transfer, new galleries or unavailable Google authorization.

The current Moments tabs, toolbar, rediscovery, games and four labeled root
destinations remain. Vary image proportions and editorial note/marker rhythm
within the existing ordered tapestry; retain selection count, safe media,
semantic link order and canonical return. No random per-render reshuffling.

Product Reference v1 R1/R2, D2/D3/D4 and Create/Edit/Discovery templates apply.
Reuse ShortTaskSheet, attachment selection tickets/queue, PhotoDraftGallery,
task-owned object URLs, useDiscoverLayout and semantic product/motion tokens.
No new upload or authorization framework. Browser/native Google security gates
remain explicit; do not represent a system-picker option as OAuth integration.

The dominant task is choose source -> choose media -> adopt into unsaved draft
-> explicit Save -> actual result -> return. Back/cancel restores the composer
and focus. Loading, empty, offline, partial/error and retry preserve usable work.
Visible selected state, readable failure and bounded explicit retry replace
silent blank thumbnail cells. Large text wraps, targets remain at least 44px,
and reduced motion retains feedback. Expanded uses the same task in its modal.
Verify Compact 360/390/430, 320px/200% text, Light/Dark and Expanded with actual
behavioral journeys and screenshots; this generated reference is not runtime
acceptance. Partner shared edit must not grant private access or deletion.

External integration stays Premium (`integration.external_sync`); device photos
and places stay Core and videos retain current policy. No quota, retention,
provider credential sharing, downgrade or existing-content loss is introduced.

## Implementation and acceptance

One `AttachmentDraftPicker` entry now owns the device and optional provider
choice across the diary, Memory editing, HeartMoment create/edit and Plan
galleries. Eligible Memory/HeartMoment device input accepts images and videos
together. Plan galleries retain their existing image-only contract. The shared
video policy controls admission; Free discovery, disabled processing and
retained playback remain unchanged. Android extends the existing chooser to
mixed media and applies the existing selected-video descriptor lease per item,
while retaining photo metadata consent and its older-platform fallback. The
combined gallery applies its explicit original-metadata grant to a selected
video too; its byte oracle must therefore remain distinct from the redacted
video-only gallery oracle. Both paths retain exact byte equality.

Immich thumbnail responses with `application/octet-stream` were rejected before
reaching the image element. Accept only bounded JPEG/WebP signatures under that
generic header, normalize the MIME type, and reject unknown/mislabeled bytes.
Keep public pinned HTTPS, owner validation, two concurrent client reads, four
server transfer slots and the 2 MiB preview limit. No original-file fallback,
redirect trust, token exposure, durable provider cache or extra SDK is added.
Thumbnail visibility is now latched for the temporary selection rather than
disposing/reloading on each scroll. Failed transport/decode has explicit retry;
late cancelled bytes cannot publish an object URL.

Shared Memory reading previously passed `canManage=false` to its place surface,
and the add-place action disappeared after the first linked place. Respect the
existing `canEdit` capability in the detail and keep adding places available.
The backend already permits shared editing and collaborative Places; do not
broaden its private-content or destructive authority. A regression uses a
different viewing account with `canEdit=true` and `canDelete=false`.

Moments retains selection count and backend/DOM order. Stable landscape and
portrait frames give taller photographs the vertical weight of neighboring
short pieces. Notes retain their authored words; compact milestone markers
break the repeated card wall. Reuse measured masonry, canonical return and
reduced-motion feedback, with no extra requests or randomized render layout.

The redundant diary sharing block is removed by the explicit PO request.
Authoritative visibility, actual Save and recovery-state copy are unchanged.

### Google Photos remains open

The source chooser names Google Photos and explains its unavailable direct
connection and the existing system-gallery fallback. **This is not direct
Google integration enablement.** #1467's literal server gate remains intact.
The implemented same-origin Web proof/recovery seam is not an Android browser
broker: the app and external browser do not share the required HttpOnly cookie.
Use the already documented authenticated browser-hosted task design in
`../../../integrations/1467-google-enablement-design.md` for that follow-up;
it still needs independent security review and real deployment/provider/device
acceptance. Do not substitute a transferable launch link, bearer URL or flag.
Keep #1614 open for that outstanding part of the PO request.

### Verification

- All 2,573 Web unit/component tests passed (two pre-existing skips). The final
  focused 25-case pass additionally includes partner place enrichment and the
  three thumbnail lifetime/error/cancellation regressions.
- 106 Immich/transport tests passed, including generic binary previews,
  MIME/non-image rejection, owner rejection and the existing SSRF boundaries.
- The 74-case diary/Moments/video browser set passed across the main run and
  two corrected source-entry expectations; no assertions or timeouts were
  relaxed. The first development-server run was invalidated by source edits;
  the fixed-source run supersedes it. Source-choice UX changed two selectors:
  partial binding now checks the disabled source trigger, and Pro discovery
  explicitly opens that source task before its existing explanation.
- Seven final video browser journeys and an additional delayed/failed-policy
  fallback/retry case passed after guarding pending eligibility.
  Device selection waits for its media allowlist; a policy error retains photos
  and offers explicit retry rather than silently opening the wrong picker.
- All 24 Places/product-consistency browser cases passed across the main run
  and one corrected expectation. Existing no-add/no-management expectations for
  an editable Memory are replaced with positive capability-driven affordance
  checks; map safety, dirty exits, failed assignment, duplicate prevention and
  exact persistence assertions remain intact. Read-only component checks remain.
- Typecheck, production Web build, semantic-token/PWA checks, Capacitor
  foundation, focused Biome lint, provider Ruff and `git diff --check` passed.
- Native API 28 and API 37.1 passed on `a1d06594`, including the mixed intake
  and exact consent-specific byte oracle. API 36 lost the entire emulator
  during video rendering: emulator.log ends with `bad color buffer handle 649`,
  ADB reports no emulators and no app assertion/crash is recorded. This is not
  claimed as API 36 acceptance. Fresh final-head CI remains an independent gate.
- Hosted exact-head native build/emulator and CI remain independent gates.
  Local browser fixtures are synthetic; no real Immich/Google account or
  physical Pixel acceptance is claimed. Google remains unavailable.

Runtime images are in [evidence](evidence/README.md). The generated preflight
above does not stand in for those implementation captures.

Provider references checked on 2026-11-03:

- https://developers.google.com/photos/picker/guides/get-started-picker
- https://developers.google.com/photos/picker/guides/media-items
- https://api.immich.app/endpoints/assets/viewAsset
- https://docs.immich.app/administration/system-settings/

The existing optional API adapters and their provider terms apply unchanged.
No provider source/SDK, new account, commercial service, storage allowance,
background synchronization or operator configuration is introduced.

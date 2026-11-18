# Wish link, photo and share handoff

Status: DRAFT for Product Owner review. Nothing here is merged or committed.

## Product decision and baseline

Use case: a couple talks in WhatsApp about a weekend in a mountain hut. One of
them wants to keep the hut link and, if there is one, the photo as a shared Wish,
and later send the eimir. link of that Wish back into the same chat.

Requested scope (first version of bidirectional sharing between WhatsApp and
Wishes):

1. A Wish gets one optional web link and one optional photo, each editable on
   its own, also directly inside eimir. When a Wish becomes a Plan, link and photo
   stay reachable from the Plan through the originating Wish.
2. Android "Share -> eimir. -> Save as Wish": shared text, link and photo become
   an editable draft; only Save makes it visible to the partner. "Add to Wish"
   covers link and photo arriving in different messages, with Keep/Replace for an
   occupied field. Manual entry: paste text and link, pick a photo from the device.
3. "Share Wish": the system share sheet hands a protected Wish link to WhatsApp.
   The link targets the right eimir. instance and opens the Wish after sign-in for
   authorized people. The chat preview stays neutral. The browser gets "Copy link"
   as the fallback, hidden in the native WebView by runtime platform.

Owning record: #476 "Share-to-Inbox / Sammelkorb" (status Todo) lives as a
private draft item in the owner's GitHub Project "eimir. Ideas", not as a
public issue in `baerenmarke90/eimir` (there is no public issue or pull request
with that number). It was read on 2026-11-18 after the project read scope was
granted. This work is the Wish-first slice of #476, not the whole Sammelkorb:

- Implemented here: Android share intake into a Wish draft, minimal interaction
  (one sheet, no mandatory form), explicit Save, Free/Core capture, Android first
  and iOS later, platform `ACTION_SEND` instead of any custom share app.
- Not implemented here and still open under #476: the server-side unsorted inbox
  domain (`SharedInboxItem`), archive/delete of inbox items, conversion to other
  domains, URL metadata fetching (V1 may stay without server-side scraping, and
  this slice does not scrape), AI sorting (Premium candidate under #262), web
  share target, inbox search, portability of inbox items.
- Constraints from #476 honored: no clipboard watching, no URL or text content in
  logs or analytics, shared state cleared on account or Space change (the
  intake scope includes both), no false "saved" state because only the explicit
  Save writes and an offline Save is refused, no notification to the partner
  before an explicit Save, link stored as inert text with no server fetch.
- Expectation to confirm with the Product Owner: #476 plans an unsorted inbox as
  the first landing place; this slice lands content directly in an editable
  Wish draft as requested. A later inbox can reuse the same intake plugin.

Acceptance criteria for this slice derive from the request text and the
applicable #476 criteria above and must be copied into the owning record.

Inspected main before implementation: `70dc15952` (`ci: shorten pull request
validation (#2049)`). Reviewed destination surfaces: `WishComposer`,
`PlanningCreatePage` (kind wish), `WishProductPage` (read, edit, actions menu,
continue sheet), `PlanProductPage` (origin Wish block), `SharedPlanningOverviewPage`
(Wishes segment), `PlanPhotosEditor`/`PhotoDraftGallery`/`MediaGallery`
(photo draft and viewer), `VoiceShareIngress` and `VoiceSharePlugin` (Android
share intake), `SelectedMediaProvider`, the attachment binding and read
authorization, and the app-link manifest filter.

## Visual reference (open)

The generated visual product reference required by `AGENTS.md` and section 9A of
the partner-app standard is NOT yet attached. It must be generated against
`70dc15952` and show, in one Compact composition: the Wish detail with the link
row and photo, the Wish editor with link and photo tools beside the existing tag
tool, and the shared-content sheet with "Save as Wish" and "Add to Wish". It is
not replaced by this text. Implementation in the draft diff follows the existing
shared product language so the reference can still steer composition.

## Mobile Interaction Contract

Authority: Product Reference v1 R1 capture/R2 reading, the Create/Edit and Detail
screen templates, `ShortTaskSheet`, `ComposerTool`, `AddActionButton`, semantic
tokens. Compact first; Expanded keeps the same task in a bounded reading width.

1. Goal: keep what was found in a chat as a shared wish, and bring the wish back
   to the chat, without retyping.
2. Relationship value: the hut stops being lost in the chat scroll; the partner
   sees one calm entry with the thing itself, the link and the picture.
3. Primary Compact screen: Wish detail (title, picture, link row) and the Wish
   editor with link and photo tools in the existing tool row.
4. Dominant action: Save in the editor; "Save as Wish" in the shared-content sheet;
   "Open link" on the detail page.
5. Hierarchy: the Wish title and the picture first, then the link row with host
   name, then description and tags.
6. Disclosed progressively: the link field opens from the Link tool; the add-to-
   existing list only after "Add to Wish".
7. Pattern: editor stays the existing page composer; the shared-content sheet and
   Keep/Replace use `ShortTaskSheet`; no new navigation level.
8. Loading: photo draft shows preparing/uploading/validating; Wish photo on the
   detail page loads in the existing media frame.
9. Empty: no link and no photo adds nothing visible; tools stay discoverable.
10. Error: invalid link text is explained inline; failed upload keeps the draft,
    shows Retry and blocks Save until it succeeds or is removed.
11. Offline: Save is refused with the existing offline write message; the draft
    stays; shared content staged in memory survives until the sheet closes.
12. Success: Wish appears for both partners with link and photo; the existing
    completion feedback is unchanged.
13. Privacy: a shared draft is private to the device until Save; the Wish link
    contains only the instance origin, the Wish route and the Wish id, never a
    title, text or picture; the server never fetches the link.
14. Large text and narrow viewport: link row wraps the host, never truncates the
    action; tool row keeps the existing overflow behavior.
15. Motion: reuse existing sheet and draft-gallery motion; reduced motion shows
    no added animation.
16. Expanded: same flow in the bounded reading column; Copy link is available
    where the browser has no share sheet.
17. Conventional list: only the "Add to Wish" chooser is a list; it shows the
    most recently updated open Wishes first, because the person is looking for one
    wish they just talked about.
18. Platform patterns reused: Android share sheet intake and system chooser out;
    no custom chat integration.
19. Typing avoided: sharing and photo picking need no typing; the title field is
    prefilled from the text and the keyboard opens only when the title is empty.
20. Generated visual reference: open, see above.
21. Visual acceptance: Compact ~360/~390/~430, Light/Dark, sparse/dense, large
    text, reduced motion for detail, editor and both sheets; screenshots plus the
    open -> share -> review -> save -> return behavior walk on a device.

## Reuse review

| Need | Alternatives considered | Decision |
|---|---|---|
| Receive shared text and image | Android `ACTION_SEND` / `ACTION_SEND_MULTIPLE` intents (platform), Capacitor community share-target plugins | Platform intents through a thin plugin that reuses `SelectedMediaProvider`; same pattern and safety rules as `VoiceSharePlugin`; no new dependency |
| Share a link out | `@capacitor/share`, Web Share API, custom WhatsApp URL scheme | System chooser through one `ACTION_SEND` call in the same plugin on Android; Web Share API in browsers with `navigator.share`; plain copy as fallback. No WhatsApp-specific scheme, so any messenger works and no new dependency or Gradle metadata |
| Photo storage | New media pipeline, existing attachment pipeline | Existing attachment upload, validation, encrypted storage, retention and cleanup; one new parent type |
| Link safety | Server link preview, client-only | Stored as text, validated http/https; no server fetch; existing opt-in preview behavior elsewhere is untouched |
| Opening the Wish from the chat | Universal link on the instance origin, custom scheme | Verified https app link on claimed hosts plus the normal web route elsewhere; self-hosted instances open in the browser |

## Business and freemium model

Business/freemium impact reviewed: Free/Core for Cloud and Self-Hosted. Matrix
version 1.37 adds the row "Wish link, photo and share handoff". Managed cost is
one ordinary image attachment under the existing storage quota. No degradation of
Self-Hosted, no downgrade or trial behavior, no new entitlement.

## Cross-cutting notes

- Security: link scheme allow-list, no userinfo, no server fetch, no SSRF
  surface; native adoption is read-only, bounded and process-local; share intake
  never handles audio; outsiders get no photo and no Wish content.
- Privacy: link and photo stay inside the protected Wish payload and the
  attachment rules; the shared Wish link leaks no content; shared drafts are
  volatile and discarded on dismiss, expiry or scope change.
- Concurrency: link and photo are separate partial updates with the existing
  If-Match version; a conflict reloads the Wish and keeps the draft.
- Resilience: a failed or cancelled upload never leaves a bound photo; retry
  creates a fresh attachment that binds on the next Save.
- i18n and accessibility: all text localized; link row and tools are labelled;
  focus returns to the invoking control after sheets.
- Operations: new Alembic revision for the photo column; retention, export and
  import include the new fields.

## Not decided here

- Final wording of the share-sheet entry labels and the visual reference.
- Whether the "Add to Wish" chooser should later search.
- Where the preview text for the shared link lives for instances without a
  claimed app-link host (browser opens the Wish route, no native deep link).

## Follow-up steps (not part of this draft)

1. Add to an existing Plan (for example a booking PDF) with a Plan link back into
   the chat.
2. Keep as a Moment, list entries, places and meeting points, invitations to a
   Wish selection and private gift ideas as further targets in the same
   shared-content sheet.
3. iOS share extension (separate native target, app group, review).
4. Optional sending of the hut link and photo along with the shared Wish link.
5. Optional AI sorting of shared content (separate business decision).

## Device validation status

Verified so far (not on a device): the Android sources compile with strict
dependency verification (`compileDebugJavaWithJavac`,
`compileDebugAndroidTestJavaWithJavac`) and the pure JVM rules test
`WishShareRulesTest` passes (9 tests). No instrumented test and no WhatsApp flow
has been run on a device or emulator; none exists on this machine.

Open device checklist (Pixel, a build that contains the Web slice; the
`.debug` package id is not verified for the app host, so item 7 needs the
release or test build):

1. Text or link share from WhatsApp opens a Wish draft with that text and no
   photo; reopening the app does not bring the draft back from the same share.
2. Photo-only share gives a draft with the photo. A photo over 25 MiB or a GIF
   gives a clear "photo could not be taken" result, no crash, and the text of a
   combined share stays usable.
3. Photo with caption gives both.
4. Two separate shares, link first and photo second, into the same Wish via
   "Add to Wish"; with an occupied field the Keep/Replace choice appears and both
   answers behave; no stale first share reappears.
5. Several photos in one share use the first photo and say so.
6. "Share Wish" opens the system chooser, eimir. itself is not offered, WhatsApp
   receives the https Wish link; the chat preview shows no Wish content.
7. Tapping the Wish link in WhatsApp opens eimir. on that Wish (check
   `adb shell pm get-app-links de.eimir.app`), with access, without access (a
   neutral unavailable state, nothing leaked) and signed out (sign in, then land
   on the Wish).
8. Upload failure (airplane mode during a photo upload), Retry, then Save binds
   exactly one photo; cancelling leaves no photo on the Wish.
9. `VoiceNotesContractTest` still passes with the new audio-only gate in
   `VoiceSharePlugin`; a WhatsApp voice message still opens the voice flow.

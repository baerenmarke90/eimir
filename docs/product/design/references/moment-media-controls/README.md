# Direct photo controls

## Preflight

Product Owner request and clarifications, 2026-11-06. Baseline main
`1610a6a93` (includes voice notes #1671); integrate #1673 through main before
final validation. Reviewed MemoryProductPage edit, PhotoDraftGallery,
PhotoDraftSorting, AttachmentDraftPicker, PlanPhotosEditor and HeartMoment
consumers; retain title/body/date/Places/tags, source picker, bounded gallery,
linking, explicit Save, failure/retry and return/draft safeguards.

![Generated Compact composition](reference.png)

Generated using the built-in imagegen tool before runtime implementation.
Neutral synthetic landscape photographs replace private input photographs.
The image is a composition reference, not runtime evidence. Current route is
`/story/memories/:id/edit`; existing fields and shell remain authoritative.

Prompt: render the existing blue eimir. Memory editor on a 390 px phone, keeping
its fields, media/source actions, seven landscape thumbnails, disclosure,
planning link and Save. Each photo has one position number at top left, removal
X at top right, sensitivity padlock at bottom left (closed sensitive/open
normal), and independent cover check at bottom right. Outline selects a photo;
cover and selection can identify different photos. Omit ready status, text
remove/cover/automatic/earlier/later controls and drag grips. Do not reproduce
private photographs, add helper paragraphs or invent modules.

## Acceptance and Mobile Interaction Contract

- Reuse Product Reference v1 R1 capture, Create/Edit and Detail templates.
  Personal media is the focal point and Save is the dominant completion.
- A tap on the image selects it through the outline. Cover uses its own check;
  a normal tap never changes cover. Removing the cover falls back to the first
  remaining item. A chosen cover retains identity when order changes.
- Entire image accepts mouse drag or touch hold/drag; remove the separate grip
  and earlier/later actions. Native page scrolling before hold stays usable.
  No additional keyboard sorting workflow requested by the Product Owner.
- Direct X removes only that item's draft. Saved removal retains the existing
  reversible keep-photo action and the existing removal permission.
- Both active partners may mark and unmark images already bound to a shared
  Memory, regardless of uploader/Memory authorship (explicit PO decision).
  This supersedes the prior author-only classification rule for shared Memory
  photos only. HeartMoment/private/experience-answer authority remains intact.
- Use named, independently operable 44 px icon buttons, existing lock/open-lock,
  check and close glyphs, semantic surfaces/type/spacing and motion tokens.
  Compact has three columns where space allows; Expanded retains the same flow.
- No redundant ready or inspector instructions. Pending/processing/failure,
  progress and retry remain with the affected file. Empty media collapses;
  failed/offline writes preserve the draft; no success before persistence.
- Retain bounded six-photo overview/show-all, selection ownership, upload
  identity, dirty exits and authorized previews. Reduced motion removes sorting
  animation without changing results.

## Reuse, business and cross-cutting decisions

Reuse existing dnd-kit 0.5.3 PointerSensor and sortable identity handling after
reviewing native HTML drag/drop, Pointer Events and dnd-kit documentation.
HTML drag/drop does not provide the existing touch/sorting behavior. No new
library/provider, license, external data flow, charge or hoster/user setup.
Existing MIT dnd-kit works in Cloud and Self-Hosted; existing pointer delay and
scroll cancellation avoid a custom gesture recognizer.

No business/freemium impact: Memory photo authoring/privacy stays Free/Core;
video and external-source Pro boundaries, quotas, byte limits, export and
non-destructive downgrade are unchanged in both hosting modes.

Security/privacy: change only classification authority for authorized shared
Memory editing; retain tenant/membership, ownership of private HeartMoments,
experience answers, original upload/binding/removal rules and If-Match atomicity.
No new logs, analytics, caches, storage, schema or migration. i18n and accessible
names remain localized; avoid nested buttons and drag activation from controls.
Verify state/identity behavior, partner classification, negative authorization,
mouse/touch, cancellation, save/reopen and representative Compact/Expanded,
Light/Dark, reflow and reduced motion. Runtime evidence follows below.

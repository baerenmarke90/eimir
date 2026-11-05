# Mobile continuity follow-up to #1655

## Scope and baseline

PO additions on 2026-11-05 extend the same issue and draft PR #1656:
Diary places and a floating month-only chip; neutral grouped More labels;
native system selection plus touch-first saved/draft photo viewing; asynchronous
video completion and owner failure notification; visible saved Plan places;
shared authored tags; and ongoing Chapter period context across months/years.

Verified main remains `88004f8147fa2cf6d65364d06443805859011fc3`.
Current branch head before implementation is
`f3f706f471b6845688f7982bacaa501221829424`. Main and PR comments were refreshed.
The Android release and the older dirty source checkout remain separate.
The PO explicitly clarified that the photo request covers both selection and
saved-photo viewing.

Reviewed current StoryProductPage/StoryYearsPage/StoryList/DiaryList, chapter
pagination/available years, More destinations, DeviceMediaPicker and the adopted
Android PhotoFileChooser, PhotoSourcePicker, PhotoDraftGallery/PhotoArrangeTask,
MediaGallery, PlanningCreatePage/PlaceChoicePicker, authored tag payloads and
suggestion authorization, attachment binding/upload/video worker, notification
policy/outbox/recipient projection and transfer outcomes.

## Generated composition before implementation

- [Diary, More and saved photos](follow-up-diary-more-photos.png).
- [Media capture, saved processing and Plan tags/places](follow-up-editor-video-tags.png).
- [Exact built-in Imagegen prompts](follow-up-prompts.txt).

These use synthetic scenery, not the PO's personal screenshots. Actual tokens,
persistent accessible labels, privacy concealment, supported actions and canonical
navigation govern implementation. The generated borders, duplicate photo Back/
Done chrome and illustrated retry do not create new contracts. Only offer retry
when the source/operation can actually be retried; otherwise use replacement.
Unvalidated video bytes are never playable; sensitive pixels remain concealed
until deliberate reveal. The native system picker is not an in-app imitation.
Expanded retains the same reading/editing tasks; keyboard controls remain usable.

## Product Design / UX and Mobile Interaction Contract

Apply Product Reference v1 R1/R2/R3/R5, Capture, Story Timeline, Detail, Plan Hub,
Settings/Privacy, shared media and task-boundary contracts. Reuse existing
semantic theme/type/spacing/motion roles, MomentDate/Place context, ShortTaskSheet,
native file input/AndroidX chooser, authorized media loader/gallery, shared
PlaceChoicePicker, ContextTagEditor, attachment worker, Outbox and Notification
Center. No new provider or UI framework.

1. Diary keeps its current photo/text chronology, filters, modes, media counts,
   pagination and source navigation. A small month chip sticks below the real
   system inset. Only the chip has a filled surface; no full-width opaque band.
   A selected Place appears beside the date with wrapping and accessible meaning.
2. A dated Chapter retains its single actual start marker. A quiet linked period
   hint appears in later intersecting months/years, including a year without
   another event. Preserve the authored full range, open-ended meaning and
   calendar dates. Undated/end-only Chapters acquire no fabricated start.
   Never multiply Story event counts or copy their constituent Memories.
3. More keeps every existing destination and capability. Group Photos, Chapters,
   Years, Recaps and Insights as Moments; Lists, Places, People and Games as
   shared everyday destinations. Destination labels contain no possessive
   prefix. Personal/account functions retain predictable groups and unread state.
4. Local media addition opens the adopted system file/photo picker directly.
   Supported external sources remain secondary and retain their consent and
   entitlements. Cancellation and late picker results obey existing task ownership.
   Preserve original-photo/GPS consent and the existing platform fallback.
5. Touching a thumbnail opens the large view. Touch browsing uses swipe and a
   simple Done/Back dismissal; no permanent previous/next arrow or X landscape.
   Retain an accessible keyboard/screen-reader path, focus restoration, native
   video controls, sensitivity reveal and canonical Memory destination.
6. Draft media remain a compact selection with direct ordering where supported.
   Cover, classification, removal and recovery live in contextual controls.
   Preserve keyboard alternatives, actual selected cover, count and explicit Save;
   remove redundant helper paragraphs and the permanent inspector.
7. Files transfer before parent Save can complete. Video normalization/validation
   no longer blocks parent Save after the upload is finalized. The saved Memory
   (and the shared HeartMoment intake) can contain a processing placeholder and
   later display the server-validated video. Existing images stay READY-only.
   Retained failures are explicit and replaceable, never silently reported as
   successful playable media. A failure after parent save produces one
   uploader-only neutral notification leading to the currently authorized parent.
   No routine-success notification or per-progress alert.
8. Video ownership, exclusive binding, deletion/cancellation, content-generation
   fencing, gallery aggregate/byte limits, quotas, sanitized playback and cleanup
   remain binding. Binding a submitted video cannot reset the worker or expose
   originals. Annotation changes during processing preserve the latest privacy
   metadata. An already failed finalized video can remain a truthful failed
   placeholder; raw failed media retains bounded cleanup.
9. New Plans expose the same searchable saved/map Place choice as Memories;
   choosing an existing Place performs no creation. Keep explicit optional
   schedule and the selected Place. Omit the redundant undated helper.
10. Memories, Plans and Wishes share authored label validation, presets and
    currently authorized vocabulary, while private HeartMoment labels remain
    confined to their permitted personal context. New Plan/Wish tags stay in
    protected payloads, default empty for old records, participate in edit,
    create idempotency, search and export/restore. Wish-to-Plan conversion carries
    its tags; any source-to-Memory continuation preserves the supported context.
    Optional local-model proposals never mutate authored tags automatically.

Human content remains focal; the primary action reads the selected item or
explicitly saves the current task. No early keyboard autofocus or recall-only
required gesture. Compact 360/390/430 and 320px/200% text wrap. Expanded preserves
the same hierarchy and provides keyboard precision without a management layout.
State changes use existing non-blocking feedback; reduced motion preserves meaning.
Keep empty/no-match, loading/processing, error/retry/replacement, offline retained
reads, unavailable access and confirmed saved results distinct. Global offline
state remains truthful; no new offline-write queue or durable-video promise.

## Reuse-before-build

Native selection review: use the adopted native file input and AndroidX
PickVisualMedia/PickMultipleVisualMedia. Reviewed official
[Photo Picker contracts](https://developer.android.com/training/data-storage/shared/photo-picker)
and [location metadata consent](https://developer.android.com/reference/android/provider/MediaStore#EXTRA_REQUEST_LOCATION_METADATA_ACCESS).
Keep existing original-metadata consent/fallback; do not add a picker SDK,
broad library permission or imitation native picker.

Video alternatives: existing PostgreSQL video-validation worker versus another
queue/service, client WebCodecs preparation versus immediate original transfer,
canonical submitted-video binding versus a parallel pending-content store.
Reuse the existing bounded server processor and canonical association, with a
narrow explicit finalized-video exception to historical READY-only binding.
Only fully validated output can become playable. Use the current upload identity
and deletion barriers, retaining latest protected annotations under row locks.
Reuse reference-only Outbox outcomes/recipient authorization for failure delivery.

Tags reuse ContextTags validation, protected payloads, authorized shared learned
vocabulary and existing editor; no second tag registry, package or plaintext index.
Chapter context reuses authorized Chapter metadata and merged calendar intervals,
without generated fake events or a second content history.

No new third-party dependency/provider, external data transfer, license/ToS,
credential or normal-user infrastructure setting. Existing external photo-source
capabilities and media licensing remain unchanged.

## Business / Freemium Model Consistency

Business/freemium impact reviewed. Authored labels, search, basic Chapter
organization, manual Places and native local photo selection remain Free/Core;
privacy, cleanup and accessibility remain non-paywallable. Extend the matrix's
authored-label scope to Plans/Wishes. Video creation keeps `media.video_upload`
and existing operator availability; retained reading, failures and recovery remain
Core. Preserve the 180-second/250-MiB input, output and gallery/storage limits,
shared Space ownership, Cloud/Self-Hosted parity, export and non-destructive
downgrade. Removing local conversion shifts work to the already bounded optional
server role; no new paid service, quota or tier. Update video/notification contracts
for asynchronous parent publication and failure-only self outcomes.

## Cross-cutting quality and validation plan

Use authorization-first Place/Chapter/tag reads and source rechecks for every
notification. No private label, failed filename, unvalidated media URL, source
path or sensitive state enters shared projections, logs or push metadata.
Keep event deduplication, versioned parent writes, upload generation, cancellation,
attachment exclusivity, aggregate limits and cleanup, including worker/bind races.
Update OpenAPI and generated clients together, protected transfer round trips
and additive notification constraints. Existing data and older clients remain
readable; the worker and API must deploy from the same revision.

Run PostgreSQL integration tests against an isolated task database for tags,
conversion/idempotency/export, processing/failed binding, annotation/deletion races,
failure notification recipients and Chapter year intersections. Verify API
generation, unit/component checks, build/type/language/design guards, shared
browser planner/inventories and complete affected browser journeys. Capture
synthetic Compact/Expanded Light/Dark, large-text, reduced-motion, pointer/keyboard,
picker cancellation, upload→save→processing→ready/failure and return evidence.
Native chooser tests apply if its wrapper code changes; do not claim a real-device
run without one.

## Existing CI diagnosis to include in the final correction batch

The prior head's CI failed in the engineering-language audit because the new
English documentation contained unquoted localized private-area wording. The
integration aggregate then failed because change detection had not completed;
this was not an observed PostgreSQL regression. Correct those new documentation
phrases, rerun the actual language guard and consolidate with this follow-up.
Preserve still-useful browser diagnostics; do not rerun or weaken unrelated gates.


## Implementation and acceptance evidence

The complete follow-up is implemented in PR #1656. The original personal photos
were inspected locally and are not published. All committed evidence uses the
existing synthetic/demo assets. [Current runtime captures](follow-up-evidence/README.md)
cover Compact 360/390/430, Expanded 1280, Light/Dark and 320px with 200% text.

Shared authored tags remain protected payload data and reuse the same vocabulary,
validation and editor. Wish-to-Plan and Plan-to-Memory preserve supported tags;
private HeartMoment labels are excluded from shared contexts. Chapter periods are
separate authorized metadata, never duplicate timeline events. Dated periods
extend available years; undated Chapters create no inferred chronology.

The system picker opens directly. Draft actions open on the selected photo;
direct pointer/keyboard ordering preserves cover and upload identity. Saved photos
open by touch, swipe and dismiss with Done/Back. Precision controls remain
accessible to keyboard and assistive technology. Localized overlay actions wrap
without overlap at large text. Media tasks reset on account/Space/editor changes.

Finalized video can bind before server processing completes. Saved processing
and failure remain truthful across reload, without original media grants or
playback. The worker retains ownership, deletion and upload-generation fences,
latest sensitivity, complete-gallery reservations and ordered parent locks.
Failure projection rechecks the uploader and exact current Memory/HeartMoment,
including owner-only HeartMoments; removal hides the stale recovery notice.
Migration 0111 and the updated API/worker must be deployed together.

A browser failure exposed an existing session-initialization race: a derived
Space could mount draft owners before its persisted selection rotated their
leases, and late account metadata could restore an obsolete Space value. App now
publishes the selected Space before mounting its owners and preserves the latest
selection during metadata refresh. A deterministic delayed-account/reload case
proves the draft survives. No persistence, ownership or Save safety gate was removed.

Local validation:

- 102 PostgreSQL integration cases pass in a task-isolated database, including
  real transaction/worker races, protected tag transfer, notification isolation,
  period intersections and migration upgrade/downgrade.
- 35 schema/tag-policy/notification unit cases pass; Ruff and mypy (357 source
  files), OpenAPI contract and pinned generated-client drift checks pass.
- The complete Web suite passes 2,688 cases; two explicit native acceptance cases
  remain skipped without their device inputs. Fifty session/context cases also
  pass after the initialization correction. Production TypeScript/build and
  token/PWA checks pass.
- The full 1,074-case browser scan exposed obsolete source-picker/action selectors
  and the initialization race. Complete affected specs were corrected and rerun,
  retaining every behavioral assertion, timeout, retry and accessibility gate.
  Final session/mobile/video acceptance passes 24 cases across three complete
  specs. The final gallery/mobile/video batch passes 57 cases across three complete
  specs; direct ordering, place creation/retry, context reset and media ownership
  are covered by the other complete affected runs. The video evidence run also
  checks visible processing without playback and preserves selection through READY.
- Current collection is 1,076 cases in 94 files. The shared planner retains the
  conservative full-regression choice (70 critical plus 24 additional specs);
  38 planner and 72 design/status/language guard regressions pass. The additional
  mobile journey stays feature-owned; core spec membership is unchanged. The
  existing video core spec gains one failure/reload privacy case because backend
  outcome tests cannot establish that the browser grants no unvalidated playback.

Earlier CI failures were diagnosed before the consolidated correction push:
localized prose in new English documentation failed language detection; dependent
integration work then skipped. Older browser expectations used the former context
placement and media controls. A Node/jsdom fixture used a browser Blob with Node's
Response; its plain body is now portable while keeping all avatar assertions.
History-based gallery dismissal now waits for the actual close before testing
late-byte revocation. No speculative rerun-all or gate weakening was used.

No physical Android-device acceptance, merge or release publication is claimed.
Hosted CI and Product Owner acceptance remain separate from local implementation.

The first consolidated hosted head passed engineering language, design and reuse
checks, then exposed an identity-classifier false positive in the exact recorded
image prompts. Ordinary adjacent-screen layout wording is now classified only
for those two paths and three reviewed phrases. Negative regressions continue to
reject actual legacy branding, changed wording, duplicate matches and other paths.
Original generation prompts remain unchanged as provenance evidence.

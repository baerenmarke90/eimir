# Sensitive media implementation (#1477)

## Contract

`AttachmentPayload.is_sensitive` is authoritative protected metadata. Existing
payloads default to false without a database migration. Authorized attachment,
Memory, HeartMoment, Story/shared-photo and Today projections expose the flag.
Unknown client/cache flags are concealed; compatibility never assumes that a
missing projection flag means an ordinary photo. Originals and authorization do
not change. Currently accepted media remains still images; video is unavailable.

A Memory gallery PUT accepts `isSensitive` per entry. A HeartMoment create or
versioned content PATCH accepts `attachmentIsSensitive`. Both apply classification
in the existing parent/attachment transaction before publication. Omitted flags
preserve existing classification for older editing clients. Strict booleans reject
string/number coercion. Parent If-Match and ownership remain authoritative;
classification-only HeartMoment edits advance that version. Existing bound Memory
photos remain editable after the unbound-upload binding window expires; this does
not revive expired unbound uploads. Attachment locks use stable identity order.

Capture checkboxes are draft choices, independent of uploads and retained through
upload retry, ordering, lost-response reconciliation and durable draft recovery.
Memory create reconciliation compares the submitted flags as well as IDs/order;
a differing classification cannot masquerade as confirmed success. Save failures
keep the draft and normal explicit retry. The helper explanation appears once in
each photo group. Pending saves disable classification editing.

## Viewing and caches

The canonical gallery conceals before media can render clearly, including ambient
backdrops, adjacent slides and loop clones. A strong filtered still with neutral
cover is used in the gallery. Card/grid/Today previews use an opaque neutral
fallback and do not load sensitive images. Preview links retain their normal
canonical destination. No additional format, store, provider or dependency.

Reveal/hide uses a semantic 44-CSS-pixel button, visible focus and pressed state.
Hidden images have no accessible description. Deliberate reveal restores normal
image semantics without a live announcement. The same attachment shares its
volatile reveal state between inline gallery and full screen; neighbors do not.
Focus changes and in-flow modal dismissal retain the state. Document hiding,
pagehide, leaving/remounting, classification changes and Account/Space scope
changes clear it synchronously without moving the gallery or scroll position.
Automatic photo matching games select only unmarked images: a game flip is not
consent to reveal sensitive content. A mixed gallery may provide an ordinary
photo; otherwise that Memory stays available in its canonical home. Search and
notification surfaces contain no photo previews. Account/person avatars have
exclusive separate bindings and cannot reuse a classified Moment attachment.
Reveal data is never persisted or transmitted. Reduced motion retains all actions.

Confirmed writes cancel stale in-flight reads and update affected in-memory media
and Today projections before return navigation. Persisted read-cache generations
are revoked so stale disk snapshots and pending disk writes cannot undo the mark.
The next authorized read repopulates the cache. The existing bounded byte cache is
not a classification authority. No media/classification telemetry is introduced.

Transfer v1 adds optional `isSensitive` to media index entries, validates it strictly
and restores it into the protected payload; old archives default false. Authorized
exports/downloads retain originals. Existing database/media backup paths preserve
the protected payload without a separate metadata store.

## Product and validation

The pre-implementation baseline, generated whole-screen Compact reference, Mobile
Interaction Contract, primary-source reuse review and cross-cutting decisions are
in [README](README.md). R1 capture and R2 Moments retain their established content,
shell, edit, ordering/removal, Save/Cancel and return behavior. The only added
visual primitive is contextual concealment; no table/dashboard composition or
playful privacy interaction. Semantic tokens deliver the reusable blur role.

Business/freemium impact reviewed: non-paywallable media privacy in matrix v1.5,
identical Free/Pro and Cloud/Self-Hosted. No new paid API, storage copy, quota,
commercial gate or destructive downgrade behavior.

Runtime evidence uses synthetic images and authorized API fixtures:

- [Compact Light](runtime-light-390.png), [Compact Dark](runtime-dark-390.png)
- [Expanded Light](runtime-light-1280.png), [Expanded Dark](runtime-dark-1280.png)
- [Editing](runtime-edit-390.png)
- 320/360/390/430 and 1280 CSS px screenshots accompany the reference.

Component tests cover initial concealment, mixed media, neutral assistive labels,
keyboard/focus, inline/fullscreen continuity, background/pagehide/scope and
classification resets, unknown thumbnail flags and checkbox save semantics.
Binding tests cover exact classification submission, failed publication and
lost-response classification mismatch. Browser journeys exercise reveal/hide,
full-screen neighbors, reload/background, Light/Dark, responsive touch targets,
large text/reflow, and save failure/draft retention/deliberate retry. PostgreSQL
regressions cover partner projections, versions/unauthorized edits, old bound
photos, rollback and transfer preservation. Exact run results are recorded in the
pull request; fixture-based browser evidence does not replace PostgreSQL tests.

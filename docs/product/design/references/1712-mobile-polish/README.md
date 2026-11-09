# PR 1712 mobile polish extension

Pre-implementation baseline: main `719cbd267e02e1c135fa2cdd63f8702eeb417cac`;
existing PR head `39df9236ea98998a817297feb7f1c98fe8b73037`.

![Generated whole-screen mobile composition reference](reference.png)

The PO supplied five screenshots and adds these requirements to the same draft.
The generated reference uses synthetic content and the inspected existing Plan
reader, Planning tabs, HeartMoment composer and Plan creator. It guides hierarchy,
not exact data or pixels. Keep required Plan titles, image-only Plan galleries,
optional schedule fields, canonical navigation and each content type's privacy.

## Acceptance and Mobile Interaction Contract

- Map markers and selected-Place cards reuse the existing durable authorized
  thumbnail cache across reload/app restart. A fresh authorized map response may
  prove only its exact thumbnail identities. Never treat a persisted projection
  as fresh authorization, bypass revocation or cache signed URLs/credentials.
- Plan reading gets a smaller balanced headline, compact schedule/place context,
  quiet completion status and localized calendar dates. Existing Wish/list/source
  links, comments, edit and optional Story capture remain discoverable. Historical
  completion should not repeat a large success surface beside the same status.
- Rename the Planning tab to German "Anlässe". Include the signed-in account's
  birthday, partner birthday and shared relationship-start anniversary from their
  existing authoritative profile sources. Keep authored dates and privacy, avoid
  matching duplicate annual records, handle missing/error/loading separately and
  preserve leap-day/date-only behavior. Never infer private dates from chat.
- Extract the diary's media-source frame into a shared action-group primitive.
  Device/external-source actions use it everywhere; include HeartMoment voice
  entry within that same group. Keep real picker/consent/upload lifecycles,
  canonical blue Add buttons, touch targets, pending/error states and draft safety.
- Plan creation offers the same List action as editing, with existing selection
  and explicit in-context creation. Keep the Plan draft while choosing/creating.
  Link only after the parent is confirmed; a partial failure must retain the
  saved Plan identity and retry links without creating a second Plan. An explicitly
  created independent shared list survives Plan cancellation, like a new Place.

Product Reference v1 R1/R2/R3, Detail/Create templates and the existing shared
media, picker, sheet, task-origin and document-leave contracts apply. Compact is
the Android/iOS interaction reference; Expanded adapts the same product. No new
navigation surface, settings toggle, table, infrastructure setup or novel gesture.
Light/Dark, ~320/360/390/430/1280, keyboard/Back, 200% reflow and reduced motion
must preserve the same information and actions. The reference image is not native
runtime evidence. No identifiable PO photos/screenshots are committed.

## Reuse, business and cross-cutting review

Reuse IndexedDB media ownership/eviction, fresh-projection authorization and the
existing generated Places API adapter boundary rather than a second map cache.
Reuse existing Profile/Space query keys and date formatting. Share the media
frame and collection-choice responsibility rather than cloning per-form controls.
Use existing Collection creation and idempotent Plan relation endpoints; preserve
confirmed-parent identity through partial failure. No provider or runtime
package is introduced. Tokens remain canonical.

No business/freemium impact: saved Memory map stays Pro; basic Places, shared
lists, ordinary Memories/HeartMoments, profile dates and retained-media viewing
retain existing classifications. Shared cache budgets/expiry, Space ownership,
privacy, quotas, Cloud/Self-Hosted and downgrade/export behavior remain. No API or
schema migration is planned. Check concurrency, teardown, stale authorization,
private/authored dates, cache clearing and late mutation results explicitly.

## Validation plan

Use focused cache/projection, date-source/occurrence, common-media and Plan/list
partial-failure tests. Review complete affected browser specs and ownership,
Compact/Expanded visual evidence, themes, reflow, native pickers, navigation and
real save/return. Collect useful existing CI failures before one correction batch;
prepare the PR for review once all additions and applicable checks pass. The PO's
2026-11-09 continuation authorizes leaving draft status; it does not authorize a
merge, publication or restarting unrelated successful work.

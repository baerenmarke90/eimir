# Selected-photo metadata retention follow-up

Baseline: current main `198c5421c1552bb73a1f1aad288b847e08497059`, including the
canonical automatic-place implementation merged in #1465. The prior parallel
draft #1466 was closed to avoid replacing that implementation. This follow-up
implements the owner's instruction that image metadata may remain.

## Preflight and interaction contract

The metadata follow-up preflight was recorded on #1459 before the UI copy change.
It reuses Product Reference v1 R5 utility Settings → Memories, the existing
PreferenceSwitch, localized muted help text and semantic tokens. The switch and
current screen hierarchy remain the primary utility action. No additional
control, typing, confirmation, external request, motion or native permission is
introduced; existing loading/error/offline/saving behavior remains authoritative.
The explanatory sentence remains visible with either switch state and describes
file retention separately from future Place association. Compact is the
normative layout; Expanded adapts the same paragraph without adding a panel.

Generated Compact reference and exact original prompt, published before the
copy change and retained on the earlier branch:

- [Generated reference](https://github.com/baerenmarke90/eimir/blob/0e95882d2393aa0673eadc0f17affe615b2c96a9/docs/product/design/references/photo-locations/compact-current-main.png)
- [Original prompt](https://github.com/baerenmarke90/eimir/blob/0e95882d2393aa0673eadc0f17affe615b2c96a9/docs/product/design/references/photo-locations/image-prompt-current-main.txt)

The current #1465 runtime composition takes precedence over illustrative details
in that reference. These follow-up screenshots are actual React/Vite renders:

| Surface | Light | Dark |
| --- | --- | --- |
| Compact 390 px | [Settings](settings-390-light.png) | [Settings](settings-390-dark.png) |
| Expanded 1280 px | [Settings](settings-1280-light.png) | [Settings](settings-1280-dark.png) |

## Validation

The ten existing `photo-places.spec.ts` journeys passed across 360/390/430/1280 px,
Light/Dark, reduced motion, plus 320 px reflow at 200% body text. They open the
settings from its index, assert the new sentence, switch OFF, observe confirmed
save, return to a saved moment, open/correct or remove its Place and observe the
result. Existing axe, no-overflow, no-unexpected-write and no-Google-request checks
remain. The first run completed nine journeys; the last Expanded/Dark axe check
was interrupted by a development-server reload while source was being edited.
That exact journey passed after edits stopped, without product/test workaround.

Backend tests exercise real JPEG/PNG/WebP/HEIF EXIF round trips, ICC, oriented
clean previews, unencodable optional EXIF fallback, independent extraction and
retention, strict transport input, required media encryption, parent/private
reads, default stripping and the existing #1465 location lifecycle. Client tests
verify selected-moment opt-in and shared-uploader default-off behavior used by
avatars and related-person photos. No physical-device or live deployment claim.

## Provenance

Screenshots contain synthetic application fixtures and are eimir. project assets
with no separate public license grant. Existing photo-fixture provenance remains
in the adjacent [canonical evidence](../evidence/README.md). Generated reference
provenance and the original prompt remain linked separately above.

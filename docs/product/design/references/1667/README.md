# Polish acceptance evidence (#1667)

Baseline: main `a9c5fb46b8c46781c77b27487f07b876b531ec8e` (including #1665).
The [generated whole-task reference](generated-reference.webp) was committed and
linked in [the issue before UI implementation](https://github.com/baerenmarke90/eimir/issues/1667#issuecomment-6671126866).
It guides composition; real privacy wording and provider eligibility remain authoritative.

## Result and reuse

- The selected-media strip now exposes its contextual actions inline. The redundant
  large-preview task and Done action are removed. Cover selection, sensitivity,
  keyboard ordering, drag ordering, removal and upload recovery remain available.
- Wish association uses the same active-locale/natural label order as Wishes.
  Association candidates assemble their cursor pages before presenting the alphabet.
  Map locations use that order while preserving coordinate grouping and selected identity.
- Person images use the existing source task and bounded attachment lifecycle.
  One selected image is an unsaved avatar until explicit person save. Cancellation
  preserves the editor; context/unmount disposes source tickets/uploads/object URLs.
  Avatar uploads explicitly exclude location metadata. No new provider implementation.
- The shared vertical gesture accepts content links/buttons after downward direction
  lock, suppresses its trailing click and leaves taps, horizontal tab swipes, forms,
  native dialogs, maps, nested scrollers and drag owners alone. Momente retains its
  pagination refresh contract; Planen refetches its active surface. Map chrome also
  uses the safe surface policy while the map itself retains its gestures.

## Rendered evidence

| Surface | Compact Light | Compact Dark | Expanded |
| --- | --- | --- | --- |
| Person image/source | [360 px](polish-avatar-immich-360-light.webp) | [390 px](polish-avatar-google-390-dark.webp) | [1440 px Light](polish-avatar-google-1440-light.webp) |
| Inline media actions | [360 px](followup-media-inline-360-light.webp) | [390 px](followup-media-inline-390-dark.webp) | [1280 px Dark](followup-media-inline-1280-dark.webp) |

[320 px Dark / enlarged text](followup-media-inline-320-dark.webp) retains the
same controls without horizontal overflow. Screenshots use synthetic fixtures.
The person avatar is deliberately a tiny solid-color fixture, not a real account image.

## Behavioral and technical validation

Local runtime: Node 24.22.1 repository toolchain, installed frozen dependency
versions, bundled Chromium at `/tmp/eimir-browser-runtime/chromium`, one browser
worker and no retries. Source fingerprints are recorded in [source-files.sha256](source-files.sha256).

- Full Web unit/component suite: **2703 passed, 2 skipped**, 301 files.
- Initial focused regression: **110 passed**. Final gesture/policy checks after the
  text-selection guard: **78 passed**.
- Initial real-browser selection: **25 passed**, including six new avatar journeys
  for Immich and synthetic Google at 360 Light, 390 Dark and 1440 Light.
- F2 task boundaries plus native browser touch gestures: **37 passed**.
- Final inline-evidence/touch run after the text-selection guard: **13 passed**.
  This reruns the affected journeys; counts above are not distinct-case totals.
- Existing F2 journeys exercise save/result/return, draft retention, upload failure
  and retry, lost-response reconciliation, dirty Back/Close, keyboard and reflow.
- Person journeys exercise source cancellation/Tab/Escape, retained name, one-image
  capacity, metadata exclusion, no implicit create, explicit persistence and displayed
  saved avatar. Axe and overflow checks pass in these journeys.
- Real Chromium CDP touch events begin on actual Momente/Planen content links;
  one authoritative refetch occurs and the current route remains unchanged.
- Typecheck, production build, token/PWA checks, fixture typecheck, Capacitor foundation,
  Web lint/format and browser inventory/planner regressions pass. The conservative
  browser plan selects all **96 specs / 1093 collected tests** because newly tracked
  visual artifacts are unmapped dependencies; no classifier or protection is changed. Existing lint warnings
  and bundle directive warnings are not new failures.

Google journeys simulate authorization and selected bytes. They do **not** establish
actual Google account/Console, production enablement, installed-device handoff or
independent provider acceptance. #1467 and the separate #1666 preparation retain
those boundaries. This PR changes the shared Web UI; no Android wrapper or release
is produced. Required GitHub results are recorded on the PR's final revision.

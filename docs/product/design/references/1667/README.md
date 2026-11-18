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
  browser plan selects all **97 specs / 1095 collected tests** because newly tracked
  visual artifacts are unmapped dependencies; no classifier or protection is changed. Existing lint warnings
  and bundle directive warnings are not new failures.

Google journeys simulate authorization and selected bytes. They do **not** establish
actual Google account/Console, production enablement, installed-device handoff or
independent provider acceptance. #1467 and the separate #1666 preparation retain
those boundaries. This PR changes the shared Web UI; no Android wrapper or release
is produced. Required GitHub results are recorded on the PR's final revision.

## Consolidated correction and sensitivity follow-up

The Product Owner additionally reported that image sensitivity marking had stopped working.
The existing server allows a Memory/HeartMoment author **or the individual image uploader**
to classify that image; the Web editor incorrectly used the parent canDelete capability.
The additive optional `canEditSensitivity` field now projects that existing authority per
bound image in Memory detail/Timeline, HeartMoment and Plan summaries. The common editor
uses the explicit capability, with the previous parent-author rule only for older payloads.
The backend authorization itself is unchanged and remains authoritative. No database
migration, sharing change or new permission is introduced. The TypeScript models were
regenerated from OpenAPI using the adopted official generator **7.24.0**.

The [individual-uploader result](polish-sensitive-uploader-390-dark.webp) and
[parent-author result](polish-sensitive-author-390-dark.webp) show the contextual
checkbox without a second photo dialog. New real-browser journeys verify mark → save →
reload → reopen → unmark → save → reopen; a partner image without authority offers no
classification control. The existing failed-classification retry journey also passes.

- Legacy browser helpers now select media and verify inline controls, retaining cover,
  order, upload recovery, save/return, classification and protected-partner assertions.
  **71 cases passed** across complete Memory defaults, experience ordering and Plan covers.
- Sensitivity follow-up plus existing failure/retry journey: **3 browser cases passed**.
- Complete affected video browser specification, including failed-video inline recovery:
  **10 passed** after adapting its obsolete dialog assertion.
- Final Web suite after the capability change: **2703 passed, 2 skipped**. Production
  build, TypeScript, lint and format pass.
- Backend projection/classification/codec/provider/S3-factory focus on the updated lock:
  **39 passed**. The non-integration suite before the security lock update produced
  **1308 passed, 36 skipped**, plus one S3-constructor failure caused by executor-injected
  SOCKS proxy variables. That offline factory case passes when those variables are
  removed for the test process; no assertion or dependency was changed for it.
- Local PostgreSQL integration coverage: **28 explicitly skipped** (no PostgreSQL).
  The extended uploader/author/protected-partner API transaction and Timeline projection
  assertions remain mandatory in hosted Backend Integration.
- Strict mypy (357 source files), Ruff lint/format and OpenAPI comparison pass.

The first hosted browser revision exposed obsolete preview-dialog expectations in
PR-critical 3/4 and 4/4; the diagnostics are preserved on run
[42123729634](https://github.com/baerenmarke90/eimir/actions/runs/42123729634).
This batch updates the shared helper and the direct video failure assertion together.
Fresh checks on the new source are required; the earlier revision is not claimed green.

Backend expansion also exercised the actual frozen dependency and codec advisory guards:
OAuthLib 4.0.0 is affected by GHSA-3jp2-3mrg-2vxc, so the already-used transitive component
now has the same explicit `>=4.0.1,<5` floor and 4.0.1 lock as the independent #1666
preparation. The actual frozen audit reports no known vulnerabilities/adverse statuses.
The current primary Debian JSON marks CVE-2026-6385 resolved in sid (7:9.0.2-1).
Its former unresolved finding is retained as a resolved review, after checking the
unchanged MOV-only/no-DVD-subtitle build. This is not a claim that the pinned FFmpeg
commit has an upstream fix. The current feed and unchanged guard now match. These are
narrow prerequisite security corrections; the separate Google adapter work is not imported.

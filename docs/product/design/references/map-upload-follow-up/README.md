# Map motion and upload notification correction

Baseline: `719cbd267e02e1c135fa2cdd63f8702eeb417cac` (2026-11-09).
The Product Owner requests a new, extensible draft PR. Do not merge or publish.

## Acceptance and mobile interaction contract

- Slow the explicit Place camera journey and photo-stack settling, including
  resetting the Place filter. Preserve interruption, rapid reselection, fullscreen
  return, filter ownership, touch panning and immediate reduced-motion behavior.
- Remove the native upload progress notification after successful upload and
  confirmed server handoff. The existing in-app placeholder continues to describe
  server processing; no permanently detached progress notification remains.
- Tapping an active upload notification opens its confirmed Memory or HeartMoment,
  for both create and edit. Use the canonical detail destination in the current
  instance/account/Space. Preserve dirty tasks until their existing guard releases.
- Keep concurrent transfers distinct; stale/foreign sessions cannot navigate.
  No object is invented before the parent has actually been saved.

Product Reference v1 R2, the Detail template, existing map composition and native
Android progress surface govern this correction. Photography remains the focal
point. The PO approved the existing animations and asks only for a slower pace;
no new composition, chrome, form, copy or generated visual redesign is needed.
Compact and Expanded share the same motion semantics. Existing Light/Dark,
empty/error/offline, sensitive-media, focus/Back and large-text behavior remain.
No celebratory or relationship microcopy is appropriate for transfer maintenance.

## Reuse and cross-cutting review before implementation

Reuse Leaflet's existing interruptible camera, the shared token adapter and
existing photo-stack transforms. Add narrowly scoped semantic map durations
rather than slowing all sheets/navigation. This PO correction deliberately
permits longer spatial map motion than the generic short-control duration scale.

Reuse Android JobService notification removal and immutable PendingIntent
identity/update semantics, and the existing foreground-service fallback.
Reuse the encrypted transfer record to associate a confirmed parent, Capacitor's
retained cold/warm event delivery, canonical Web routes and the document-leave
guard. Avoid a new worker, backend lookup API, URL router, provider or dependency.
Reviewed platform references:
[JobService](https://developer.android.com/reference/android/app/job/JobService),
[PendingIntent](https://developer.android.com/reference/android/app/PendingIntent).

Notification content stays generic and secret on the lock screen. Only typed
parent IDs and instance/account/Space ownership are handed to the authenticated
client; the ordinary authorized detail read remains authoritative. Binding a
notification must not undo a successful parent save. Session revocation,
concurrent transfers, late I/O and listener teardown need explicit regressions.

No business/freemium impact: existing map classification, video capabilities,
ordinary Memory/HeartMoment ownership, Cloud/Self-Hosted parity, quotas, retention,
cost model and downgrade/export guarantees remain unchanged. No matrix change.

## Validation plan

Run token generation/checks, typecheck, changed-file lint/format and meaningful
map, transfer/binding and navigation component regressions. Run the complete
affected map/browser journeys with the existing selection/inventory ownership.
Extend the existing installed Android transfer tests for completion removal,
cold/warm target delivery and independent PendingIntents. Use hosted Android
checks if the executor lacks its SDK/emulator; report that limit explicitly.
Inspect applicable workflow classifiers and collect independent failures before
one coherent correction push. No speculative workflow retries.

## PO addendum before double-tap implementation

The same draft also corrects missing photo double-tap zoom. The shared
ZoomablePhoto relies on a synthesized dblclick; its zoomed Panzoom pointer
admission suppresses that path on touch devices. Reuse the existing #1709
gallery-gesture reference and whole viewer composition. Recognize two short,
nearby, unmoved single-pointer taps directly and toggle focal zoom/fit. Pinch,
pan, cancellation, long press, distant taps and zoom-control taps must not count.
Avoid duplicate toggles from compatibility dblclick. Keep existing mouse and
keyboard, reduced-motion, gallery swipe, video and protected-media behavior.

## Implemented result and local validation

- Camera journeys now use 900 ms; photo-stack settling uses 600 ms. Both have
  dedicated canonical tokens and zero-duration reduced-motion adapter values.
  Filtering remains immediate, and pointer interruption still owns the camera.
- Successful native transfers use Android's REMOVE policy through confirmed
  server handoff. Failed notices retain their error semantics. Observation also
  removes orphan progress notices left by older builds, only in this channel.
- Confirmed create/edit writes bind active video transfers to typed Memory or
  HeartMoment targets in encrypted staging. Initial and subsequent progress
  notices retain the same immutable per-transfer PendingIntent. Cold/warm entry
  validates native and Web instance/account/Space ownership, uses canonical
  detail routes and waits behind the existing dirty-task guard.
- Touch double taps use pointer events captured before Panzoom's click
  suppression. Zoom geometry still belongs to Panzoom. Both zoom directions
  work without synthesized clicks; compatibility dblclick cannot toggle twice.

Validation on the source accompanying this evidence:

- Complete Web suite: **2,819 passed, two existing skips**, 315 passing files.
- Targeted map, transfer/binding, navigation, photo gestures, gallery and token
  coverage: **80 passed**. Typecheck, production build, token/legal/i18n/PWA
  checks, changed-file lint/format and English engineering audits pass.
- Complete affected browser selection: **35/35 passed** across map stacks,
  photo places and mobile Diary/planning/media. Includes 320/360/390/430/1280,
  Light/Dark, reduced motion, 200% text/reflow, real touch pinch/pan, double-tap
  zoom and fit, carousel swipe, keyboard/Back, protected media and axe.
- The strengthened 390px touch journey **fails on the unchanged baseline** at
  reverse double tap (expected scale 1, actual 2.5), then passes after restoring
  the correction. Existing assertions and time/retry limits are retained.
- Browser inventory/ownership remains complete: 104 specs; 38 planner tests
  pass. The shared token/App changes deliberately select conservative full
  hosted regression (77 critical + 27 additional specs), without adding a
  global case or changing the selection contract.
- Eight installed Android transfer tests are committed: real background
  upload/progress and completion removal, original/independent PendingIntents,
  cold/warm retained delivery, recreation non-replay, stale/malformed scopes,
  orphan-channel cleanup and existing staging/revocation cases. The existing
  workflow's exact test-count expectation is updated from four to eight.

Local browser: Chromium 153.0.8010.0, obtained as a temporary tooling package
outside the repository. The pinned Playwright browser CDN returned an HTML
"Site Unavailable" response. The alternate tool's extraction expected chown
support absent here; its ordinary single-process mode also could not recycle
browser contexts. Standard isolated Chromium processes passed a three-context
readiness check and the entire affected selection above. No browser assertion,
product permission, Web security setting or repository workflow was relaxed.
Hosted CI remains authoritative for its pinned Chromium version.

This executor has Java 17 but no Android SDK, Java 21 or emulator. No local
native build/device pass is claimed. The existing hosted Android matrix owns
API 28/36/37.1 build, lint and installed-device evidence. The PR stays draft
for the PO's further additions; there is no merge or release authorization.

## Actual browser evidence

Only existing synthetic repository fixtures are included; the PO's notification
screenshot is not copied to the public repository. Map tile requests are mocked
by the established fixture. These static captures verify composition; the
browser journeys above verify motion and interaction.

| Surface | Representative capture |
| --- | --- |
| Compact map, Light | [360px](evidence/planning-map-stacks-360-light.png) |
| Compact fullscreen map, Dark | [390px](evidence/planning-map-stacks-fullscreen-390-dark.png) |
| Compact map, Light | [430px](evidence/planning-map-stacks-430-light.png) |
| Expanded fullscreen map, Dark | [1280px](evidence/planning-map-stacks-fullscreen-1280-dark.png) |
| Large text/protected map source | [320px](evidence/planning-map-stacks-320-dark-large-sensitive.png) |
| Touch photo viewport, Light/Dark | [360px](evidence/photo-zoom-360-light.png), [390px](evidence/photo-zoom-390-dark.png), [430px](evidence/photo-zoom-430-light.png) |
| Expanded photo and narrow reflow | [1280px](evidence/photo-zoom-1280-dark.png), [320px](evidence/photo-zoom-320-light.png) |

[SHA-256 manifest](evidence/manifest.json) binds the captures and runtime sources.

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

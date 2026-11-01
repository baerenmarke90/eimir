# Android test.38 source integration

The Product Owner requested the #1574 follow-up and explicitly authorized
continuation and merge. PR #1575 (`4e12d309892bb8e4d3544b2023415e1bbb11a4ca`)
separates daily rediscovery from the current partner-signal module, adds its
independent personal visibility/order, restores the canonical blue/white source
action even in warm color worlds, and removes standard input borders while
retaining filled fields, labels, keyboard focus and forced-colors boundaries.

Integrate that exact product source into the published test.37 orchestration
commit `fbb42796921d5e8c3cef33a57445b617962dffc8`. Preserve the existing sideload
updater/calendar/encrypted session storage, package `de.sidebyside.app`, original
test certificate, persistent `https://demo.eimir.ur-cloud.de` origin and disabled
Demo/reset behavior. The merge preserves both browser test catalogs and changes
no native runtime or signing/publication gate.

Product design/preflight and exact implementation captures are recorded in
`docs/product/design/references/1574-wir-rediscovery/README.md` and its linked
evidence. Dashboard and Wish/Plan remain Free/Core; no entitlement, quota,
retention, provider or Cloud/Self-Hosted boundary changes. An additive module
key uses the existing string-backed preference model; no schema migration or
new API field is introduced. Older complete order payloads remain accepted.

Keep the plan pointing to immutable test.37 while validating this combined
source through draft foundation PR #1443. Do not merge that foundation into
main. Only after product PR #1575 is merged and all 32 named exact-source checks
and applicable workflows pass may a separate plan-only commit select the frozen
candidate for versionName `0.2.0-test.38`, versionCode 38 above test.37.

The existing protected publisher must verify the original/predecessor signer,
actual APK identity/source and upgrade compatibility, stage/verify all four
assets, publish atomically and verify anonymous catalog/bytes. Existing releases
are immutable. Physical-device upgrade/data continuity and the running instance
remain Product Owner acceptance; automated checks do not claim those observations.

## Native permission-fixture correction

Source `e1f665bb` passed API 28 and 37.1. API 36 timed out at the existing
PhotoFileChooserTest permission transition. Its retained diagnostics in
[run 41331267197](https://github.com/baerenmarke90/eimir/actions/runs/41331267197)
show the permission content appearing before the dialog's touch input channel;
InputDispatcher rejected the test tap with `NO_INPUT_CHANNEL`. This reproduces
the previously intermittent test.37 fixture failure and warrants a test fix.

Activate the exact visible, enabled, attached “Allow all” Android consent button
through `AccessibilityNodeInfo.ACTION_CLICK`. This is an actual system UI action,
not a runtime permission grant or picker bypass. Keep the same 15-second
picker-window wait, physical Chromium input/photo/confirmation actions,
foreign-ownership proof, original-byte/EXIF assertions and full upload/worker
pipeline. No runtime app or release gate changes. The corrected source requires
fresh exact-source checks before plan selection; the failed source is not released.

# #2076 Gestures and haptics on the motion layer

Captured with Playwright Chromium on Windows from two specs, run with `VISUAL_EVIDENCE_DIR`. The API is mocked.

- `web/e2e/tests/app-icon-selection.spec.ts`, describe block `haptics switch in the native app (#2076)`.
- `web/e2e/tests/floating-bottom-nav-scroll.spec.ts`, describe block `gestures and haptics on the motion layer (#2076)`.

The native app is the synthetic Capacitor bridge (`CapacitorCustomPlatform` android). Its `Haptics` plugin records calls and never vibrates. A real device has not been tested yet; see "Open" below.

## Haptics switch (Settings › Appearance)

`2076-haptics-switch-<width>-<theme>[-200-text].png`

- The section `hapticsSettings.title` with one `PreferenceSwitch`, labelled `hapticsSettings.label` and described by `hapticsSettings.hint`. It sits after the Momente design and before the app icon, between the existing device and personal preferences, which are unchanged.
- Widths 360, 390 and 430 in Light and Dark, and 390 with 200 % text in Light and Dark. No width or text size has horizontal overflow (asserted).
- It is on by default.

Behaviour checked in the same spec:

- **Browser:** the section and the switch are absent (`is not offered in the browser`). Visibility follows the runtime platform, not the width.
- **Native app:** `role="switch"` with `aria-checked`, its accessible description is the hint, Space toggles it, the value is stored as `eimir.motion.haptics` in `localStorage` only (the component makes no request), it survives a reload, and axe reports no violation in the section.

## Pager settle under 4x CPU throttling (390 px)

`2076-pager-settle-cpu4.json`: the current page's drawn `left` offset, sampled each animation frame from the release until the route commits. The swipe from 75 % to 40 % of the width is released at an offset of −136.5 px. The next tab is at −390 px.

| Time after release (ms) | Offset (px) |
| --- | --- |
| 22–64 | −136.5 |
| 115 | −150.6 |
| 122 | −207.3 |
| 145 | −264.6 |
| 190 | −324.7 |
| 241 | −357.7 |
| 307 | −377.8 |
| 406 | −387.3 |
| 530 and later | −390 |

- The settle starts at the release offset: no jump back toward rest and no jump to the target.
- It moves toward the next tab in every frame and never reverses.
- It lands on −390 px after about 530 ms. Under 4x throttling the first frame of the settle comes about 100 ms after the release, because the main thread handles the touch end first. The spring is time-based, so it then catches up (57 px in that frame) instead of running late.
- The route commits after the settle, and the drag state is removed.
- Haptics in the native app: the threshold tick (`selectionStart`, `selectionChanged`, `selectionEnd`, in this order) while crossing the commit distance, and one `impact` `LIGHT` at the commit.

## Interruption (grab mid-settle)

`2076-pager-grab-cpu4.json`: two frames after the release, a second finger lands. The drawn offset is read in the same task, just before and just after the app's touch handler.

- Before the grab: −357.691 px. After the grab: −357.691 px. That is no jump.
- The route stays on Wir until the new gesture decides. Dragging back toward Wir and releasing returns the pages to rest on Wir.

## Other behaviour checked

- **Switch off:** with `eimir.motion.haptics` set to `off`, a committed swipe sends no plugin call.
- **Reduced motion:** the swipe still commits at once, with no `left` animation and no drag state left behind.
- **Sheet:** a slow 96 px pull settles back. A quick flick of the same length is a fling and dismisses. A pull that reverses before release stays open. A pull on a row does not activate it. See `floating-bottom-nav.spec.ts` and the unit tests in `ShortTaskSheet.test.tsx`.
- **Unit tests:**
  - spring frames, the grab and the reversal cancel of the pager (`useNavigationMotion.test.tsx`);
  - the fling and slow-pull outcomes of the sheet;
  - the reversal cancel, threshold tick and commit haptic of pull to refresh (`usePullToRefresh.test.tsx`);
  - the plugin mapping and native-only loading (`hapticsNative.test.ts`);
  - the switch (`HapticsSettings.test.tsx`);
  - the `@dnd-kit` and `@panzoom/panzoom` wrappers (`gesture/wrappers.test.ts`).

## Open

- Acceptance on a real device (Pixel 10 Pro Fold, Android test release) for gesture feel and haptics:
  - how the light impacts and the threshold tick feel (the plugin's selection waveform is 100 ms);
  - the Android "Vibration & haptics" settings and Do Not Disturb.

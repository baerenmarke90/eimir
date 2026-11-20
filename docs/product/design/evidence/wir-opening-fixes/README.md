# Wir opening fixes: Compact evidence

Follow-up to #2066 after the Product Owner's Android report of 2026-11-19:
"Wie geht's?" no longer showed, the two avatars popped or blinked on arrival,
and the ring pulse looked like about 3 FPS. The change is motion only on the
existing Verbunden stage. It adds no components, tokens or copy.

## Stills

Captured on 2026-11-19 with the Playwright harness (Chromium, 390 × 844, the
mocks from `today-daily-checkin.spec.ts`, Verbunden design, demo couple Lea
and Alex, no value for today). Each image shows two frames:

| File | Left | Right |
| --- | --- | --- |
| `prompt-and-closed-390-light.webp` | After the opening has ended, "Wie geht's?" shows on the own avatar. | After the 3600 ms hold, the prompt retires into the plus. Nobody has a mark, so the row closes and the content below rises. |
| `prompt-and-closed-390-dark.webp` | The same in Dark. The prompt is caught while it is still fading in. | The same in Dark. |

## Frame-sampled measurements

Taken by sampling the opening frame by frame in Playwright Chromium, before
and after the fix:

1. **Prompt.** Before: since #2044 the prompt was a quiet hint that retired for
   good after three app sessions. Its per-account session key was also a
   broken template literal, so on a device that had been used a few times it
   never showed. After: it shows once per app session while today has no own
   value. The hold time is now 3600 ms so that it outlasts the slower opening.
2. **Avatar blink.** Before: when the check-in action became known, the own
   avatar slot changed from `span` to `button`. That remounted the hero
   subtree, `SingleAvatar` reset its loaded state, and the photo faded in over
   the initials a second time. After: a module-level set of photo URLs that
   have already been shown lets a remounted avatar show its photo at once.
3. **Opening hand-over and tab return.** Before: the `wir-stage-intro` class
   was removed only at the next React render, so the ring breath often never
   started. Kept primary tabs are hidden with `display: none`, so every CSS
   entrance restarted when Wir was shown again (badge-in, quote fade,
   potentially the whole opening). After: `WirIntroStage` ends the opening on
   its own timer. `settleRestartedEntrances` (`PrimaryTabPanels.tsx`)
   finishes single-iteration CSS animations when a kept tab is shown again.
   In the first frame after the return, no single-iteration animation is
   running. Only the repeating breath starts again.
4. **Ring breath.** Before: the breath scaled a 2 px ring by 3.5 % over 3 s,
   which moves its edge one device pixel at a time and reads as about 3 FPS.
   After: the `wir-breathe` keyframes animate opacity only, with
   `will-change: opacity`, which has no edge to step.

These map to the motion contract (#2068): M2 (the entrance plays once), M4
(the applying class is removed when the entrance finishes, and a kept tab
replays nothing), M5 (no remount-driven re-entry) and M7 (no scale on strokes
of 3 px or less).

Automated coverage: `today-daily-checkin.spec.ts` "the Wir opening ends on its
own and returning to Wir replays no entrance". It checks that the intro class
leaves without a further render, that the breath has no `scale` keyframe, and
that no single-iteration animation runs on the first frame after returning to
Wir. The adapted test covers the row that closes. `PartnerAvatarPair.test.tsx`
covers the remounted avatar showing its photo at once.

## Outstanding

- The check on an Android device (Capacitor WebView) is still outstanding. The
  3 FPS impression and the blink were reported there and have been reproduced
  and verified only in desktop Chromium.
- Not captured here: reduced motion, where every duration resolves to 0 ms
  and the final composition shows at once (covered by the existing
  reduced-motion tests), Expanded, and large text. The layout is unchanged
  from #2066.

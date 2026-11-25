# Evidence: Mochis (#2283, stage 7)

Captures for the Mochis memory world in Momente › Erinnerungen: the two
partners as little mochis on a meadow. Each action (cuddle, kiss, hug, laugh,
dance) sends a heart balloon with a memory into the sky. Earlier stages are
listed in [`../2283-memory-worlds/`](../2283-memory-worlds/README.md) and the
sibling `2283-memory-worlds-*` folders.

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data, with reduced motion so the result
of an action is captured at rest.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-mochi-390-light.png` | The meadow with the two mochis (coloured from the person colours) |
| `memory-worlds-mochi-after-hug-390-light.png` | After the hug action by keyboard: the action row is visible while focused, and a heart balloon with the memory is up and can be opened; axe has no WCAG A/AA violations |
| `memory-worlds-mochi-390-dark.png` | Dark: a night sky with moon and stars |
| `memory-worlds-mochi-1280-dark.png` | Expanded in Dark: the meadow centred at the world reading width |

## Behaviour exercised

- The hug action by keyboard sends up a memory that can be opened (asserted in
  the spec).
- Kiss, push-to-cuddle, poke, every button action, hints, falling asleep and
  waking, and reduced motion are covered by `MochiWorld.test.tsx`.

## Not covered here

- Shake-to-dance (`devicemotion`), rhythm taps and the touch gestures (push,
  pinch, tickle, long press) on a device.
- On-device acceptance on the Pixel for this production build.

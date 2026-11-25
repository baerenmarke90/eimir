# Evidence: Glas (#2283, stage 10)

Captures for the Glas memory world in Momente › Erinnerungen: a retro
preserving jar full of folded slips that is shaken until one slip jumps out
and unfolds into a memory. Earlier stages are listed in
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md) and the sibling
`2283-memory-worlds-*` folders.

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data, with reduced motion so the drawn
slip is captured at rest.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-jar-390-light.png` | The jar with its label, the slips inside and the tag that invites a shake |
| `memory-worlds-jar-drawn-390-light.png` | After pressing the tag: the drawn slip below the jar with the memory, the back-into-the-jar tag and the read-in-the-diary tab; the jar tag says a new slip comes tomorrow; axe has no WCAG A/AA violations |
| `memory-worlds-jar-drawn-390-dark.png` | The drawn slip in Dark, with the candle next to the jar |
| `memory-worlds-jar-1280-dark.png` | Expanded in Dark: the jar centred at the world reading width |

## Behaviour exercised

- The tag draws a slip with reduced motion, the read-in-the-diary link
  appears and the tag changes to its drawn state (asserted in the spec).
- Shaking by drag and tap, the lid pop, the slip stage dialog with focus trap
  and return, folding the slip back, the per-day rule with fake timers and the
  jar physics are covered by `MemoryJarWorld.test.tsx`, `jarRules.test.ts` and
  `motion/memoryJar.test.ts`.

## Not covered here

- Shaking the phone (`devicemotion`) and the shake feel on a device.
- On-device acceptance on the Pixel for this production build.

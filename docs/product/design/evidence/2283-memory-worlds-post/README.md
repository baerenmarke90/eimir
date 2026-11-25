# Evidence: Post (#2283, stage 9)

Captures for the Post memory world in Momente › Erinnerungen: letters from
back then in an enamel mailbox, opened on the desk and filed in a shoebox.
Earlier stages are listed in
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md) and the sibling
`2283-memory-worlds-*` folders.

## Source

All captures are written by `web/e2e/tests/memory-world-selection.spec.ts`
(`VISUAL_EVIDENCE_DIR`) on mocked API data, with reduced motion so each step
is captured at rest.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-post-390-light.png` | The mailbox with its red flag up, waiting for the door to be opened |
| `memory-worlds-post-card-390-light.png` | After opening the door and the envelope by keyboard: the postcard with its season banner and the open-in-diary paper tag; axe has no WCAG A/AA violations |
| `memory-worlds-post-390-dark.png` | Dark, after filing the card: the read cards in the shoebox on the desk |
| `memory-worlds-post-1280-dark.png` | Expanded in Dark: the desk centred at the world reading width |

## Behaviour exercised

- Door, envelope, the open-in-diary link and filing in the shoebox by
  keyboard (asserted in the spec).
- Envelope designs, card sides, swipe to turn with spring-back, carrying the
  card to the shoebox, the timed sequence with motion, and reduced motion are
  covered by `PostWorld.test.tsx`.

## Not covered here

- Pulling the door, lifting the flap and carrying the card by finger on a
  device.
- On-device acceptance on the Pixel for this production build.

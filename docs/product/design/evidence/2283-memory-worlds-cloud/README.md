# Evidence: Momentwolke (#2283, stage 2)

Captures for the Momentwolke memory world in Momente › Erinnerungen. Stage 1
(the foundation, Stapel and Plattenkiste) is documented in
[`../2283-memory-worlds/`](../2283-memory-worlds/README.md).

## Sources

- `memory-worlds-cloud-*.png`: written by
  `web/e2e/tests/memory-world-selection.spec.ts` (`VISUAL_EVIDENCE_DIR`) on
  mocked API data: three rediscovered memories plus one diary entry.
- `preview-cloud-*.jpg`: the product preview (`web/preview`, recorded
  fictional demo Space) in the in-app browser at half scale, with the recorded
  world switched locally to `cloud`. The recording itself is unchanged.

## What each image shows

| File | Shows |
| --- | --- |
| `memory-worlds-cloud-390-light.png` | The Momentwolke after the calm entrance; the cloud holds the selection and the diary entry (label with 4 memories asserted) |
| `memory-worlds-cloud-card-390-light.png` | Enter on the cloud opens the centre memory as a card dialog; focus is on the close button; axe has no WCAG A/AA violations |
| `preview-cloud-390-light.jpg` | Demo data: the cloud with photo and text bubbles, the centre pill naming the centre memory |
| `preview-cloud-after-drag-390-light.jpg` | After a drag: the cloud glided on and settled on a heart moment |
| `preview-cloud-card-open-390-light.jpg` | A tap grows the centre bubble into a card with the open-in-diary action |
| `preview-cloud-390-dark.jpg` | Dark, after closing the card with Escape: focus returned to the cloud (focus ring) |
| `preview-cloud-1280-light.jpg` | Expanded: the cloud centred at the world reading width |

## Behaviour exercised

- Drag with momentum and magnetic settle; tap to open; Escape and the close
  button close; focus returns to the cloud (asserted in the spec).
- The diary part follows the loaded diary pages; duplicates with the
  selection appear once (unit tests in `MemoryWorldView.test.tsx`).

## Not covered here

- On-device acceptance on the Pixel for this production build; the prototype
  was measured on the device.
- Resizing while the cloud animates (for example unfolding a foldable) shows a
  short re-layout spring before the cloud settles again.

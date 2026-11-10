# Focused maintenance browser evidence

This is a historical runtime evidence record, not a living project-status source.
All content is synthetic. Screenshots are unedited Chromium output from the
existing owned browser journeys; they are not generated design concepts.

## Gallery keyboard/resize continuity — #1690 / #1722

- Baseline main: `6ca4049f2908ef9e5b9973549dccfc152a2226fe`.
- Source head: `0f9596c1b1aa03fc68260107b0aea10ed39ae99b`.
- Tested PR merge checkout: `d7b8c78a34b6d9f67f47258d135d892f4c5fc120`.
- Both source/checkout trees: `af0226c02845a7c62762381fccfa7974237ead99`.
- [Workflow attempt 1](https://github.com/baerenmarke90/eimir/actions/runs/42795495761).
- [Owning PR-critical shard 2](https://github.com/baerenmarke90/eimir/actions/runs/42795495761/job/129759963640): 192 passed, including both resized lightbox journeys.
- Artifact: `web-product-visual-evidence-pr-2-d7b8c78a34b6d9f67f47258d135d892f4c5fc120-attempt-1`, ID `13754596186`.

The journey opens photo 2/6, starts ArrowRight and changes the real stage size,
then verifies photo 3/6, exact original-media request identities, <=1 px native
settling, retained close-control focus, Escape and restored inline photo 2/6.
390 px Dark uses normal motion; 1280 px Light uses reduced motion. The owning
unit regression separately protects initial observer delivery without a size
change and genuine native-input interruption.

The original issue trace (run 42367384400, artifact 13572159171) records the old
2/6 counter after ArrowRight. The first implementation's retained failure (run
42793644787, artifact 13751944111) instead reached 3/6 and exposed a 4 px test
coordinate error from resizing only a centered child track. The corrected test
resizes its owning stage; counters, source reads, focus, timeouts, retries and
pixel assertions were not loosened. No unchanged-source rerun was requested.

| State | Runtime image |
| --- | --- |
| Compact, Dark, resized fullscreen photo 3/6 | [390 px lightbox](gallery/lightbox-390-dark.png) |
| Compact, Dark, Escape returns to inline photo 2/6 | [390 px return](gallery/return-390-dark.png) |
| Expanded, Light, resized fullscreen photo 3/6 | [1280 px lightbox](gallery/lightbox-1280-light.png) |
| Expanded, Light, Escape returns to inline photo 2/6 | [1280 px return](gallery/return-1280-light.png) |

## Image integrity

SHA-256 values bind the copied bytes to the retained CI artifact:

- `6f94f9d9e4fe14d38fd6fba3c51b3a771cf05e8018e1066284978e352519bbcf` — `lightbox-390-dark.png`
- `5baed08332dd7ba6f7c4777fc31aeb73e8181db524a72071b423e35ff0ef63f6` — `return-390-dark.png`
- `78d2a840b099b9ae4286a59f2b3329782bd66f331d4181bfc7537c780d5b4742` — `lightbox-1280-light.png`
- `d9ca915f2cdfabf53574470d532441c70978c65c948ebe80e029be80f41cfef4` — `return-1280-light.png`

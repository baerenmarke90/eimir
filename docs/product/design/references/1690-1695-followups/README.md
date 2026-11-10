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

## Heart Moment choice reflow — #1695 / #1723

- Baseline main: `6ca4049f2908ef9e5b9973549dccfc152a2226fe`.
- Source head: `34053d68cca41081c11bf32efe87da77dfa31f8d`.
- Tested PR merge checkout: `0c94da78b4cbc399be29c85f59ece227041d5d05`.
- Both source/checkout trees: `b71c453ae8ad8a083346f12cb1bf4efbbc825aad`.
- [Workflow attempt 1](https://github.com/baerenmarke90/eimir/actions/runs/42795820881).
- [Owning critical shard 3](https://github.com/baerenmarke90/eimir/actions/runs/42795820881/job/129761012742): 230 passed, including all four complete new large-text journeys.
- Artifact: `web-product-visual-evidence-pr-3-0c94da78b4cbc399be29c85f59ece227041d5d05-attempt-1`, ID `13755281650`.

Each variant uses 200% root text and reduced motion. The existing feature-owned
journey checks actual word fragments (two-line bound with no split words),
visible audience labels, associated-label touch selection, native ArrowRight,
checked state, private Save -> read -> reload -> edit -> Save, the real mutation
payloads and absence of shared-Place writes. Existing 360/390/430/1280 normal-text
lifecycle, axe and capture-tag cases remain. All four browser shards and the
additional full affected specs passed; the always-run core is unchanged.

The first attempt's new journeys reached the visible radios but attempted to
click their intentionally clipped native inputs. Attempt-1 diagnostics in run
42793652557 remain preserved. The correction activates the actual associated
visible label, then keeps the native checked and keyboard assertions. No force
click, timeout increase, retry workaround or product behavior change was used.

Full-page captures preserve all browser output, including the existing translated
skip link that can appear in the stitched capture. Nothing was hidden, cropped
or retouched to improve evidence. Audience captures show the complete task
composition; emotion/edit captures show native selected/focus states. Product
acceptance also uses the passing rendered-geometry and lifecycle assertions.

| Width / theme / locale | Audience | Selected feeling | Edited feeling |
| --- | --- | --- | --- |
| 320 / light / de | [Audience](heart/audience-320-light-de.png) | [Supported](heart/emotion-320-light-de.png) | [Grateful](heart/edit-320-light-de.png) |
| 320 / dark / en | [Audience](heart/audience-320-dark-en.png) | [Supported](heart/emotion-320-dark-en.png) | [Grateful](heart/edit-320-dark-en.png) |
| 1280 / light / en | [Audience](heart/audience-1280-light-en.png) | [Supported](heart/emotion-1280-light-en.png) | [Grateful](heart/edit-1280-light-en.png) |
| 1280 / dark / de | [Audience](heart/audience-1280-dark-de.png) | [Supported](heart/emotion-1280-dark-de.png) | [Grateful](heart/edit-1280-dark-de.png) |

### Heart image integrity

- `e03eeb1d7ebaec5002cda08ce9a607c842f0d8570fc4774dbe85cae4d1a4c795` — `audience-320-light-de.png`
- `63f3c8f0a2a4a9b1109390e65a45b3b42775481fd4451f7793109b7268696954` — `emotion-320-light-de.png`
- `00ad386db855d2609e67611a6219f2f4150f96cc0fcd27f87aec052a3a2d9c95` — `edit-320-light-de.png`
- `23414482d7547948e39c5e43620c4c8a45573d1e9e16be23794732ed8cd61560` — `audience-320-dark-en.png`
- `6ca901b343c12417b450d3e0713ce1634253a95e6391c1a6627a0df95fa7e48d` — `emotion-320-dark-en.png`
- `e616dccbcb35f3d0915fa8079b68a41f43d5a4b17ecc729319450e6ee86200bd` — `edit-320-dark-en.png`
- `7b47d77b5ea310909191841def474de5e2f74bc1657c0e7d40e74efb00cda928` — `audience-1280-light-en.png`
- `09c7541ad59cd13bead36484efe545b31c678a63adfbab0b16bece0e2f6abecc` — `emotion-1280-light-en.png`
- `769db0a588f9cc9c6281368cd8b74cd67539e75f2065b9b8e85388d6c2b695fd` — `edit-1280-light-en.png`
- `00bfa7b53cd38c353955c6979ced1c6c62cc63e47c7041322c99b33c22ffc6cf` — `audience-1280-dark-de.png`
- `b60a1e1ca7d5f72f0ec92c2f9f086d78efbc539111279effcf36702dca30f448` — `emotion-1280-dark-de.png`
- `a8c3c10a87d7b5088646a0afe48d5cf076993a04d43096fc47313ddad2163a2c` — `edit-1280-dark-de.png`

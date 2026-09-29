# #509 Memory Smart Tags — browser evidence

Captured by `web/e2e/tests/create-surface-visual-checks.spec.ts` in the [Web Browser QA run](https://github.com/baerenmarke90/eimir/actions/runs/36566770771) for feature head `2d84d9f440e88b08f1d2ac91c434126f35a1acb2` (2026-09-29). The screenshots are from the running Web app with deterministic API responses, not the generated preflight illustration. The subsequent commit only adds these evidence files and PR metadata. The [full CI artifact](https://github.com/baerenmarke90/eimir/actions/runs/36566770771) also contains the 360/430 px, small-height, and date/reduced-motion states.

| State | Light | Dark |
| --- | --- | --- |
| Compact 390 px, selected context | [Light](shell-memory-tags-selected-390-light.png) | [Dark](shell-memory-tags-selected-390-dark.png) |
| Compact 320 px, 200% root text | [Light](shell-memory-tags-320-200pct-light.png) | [Dark](shell-memory-tags-320-200pct-dark.png) |
| Expanded 1280 px, empty selection | [Light](shell-memory-create-expanded-light.png) | [Dark](shell-memory-create-expanded-dark.png) |
| Tagged Memory detail, 390 px | [Light](shell-memory-tags-detail-390-light.png) | [Dark](shell-memory-tags-detail-390-dark.png) |
| Tagged Memory edit, 390 px | [Light](shell-memory-tags-edit-390-light.png) | [Dark](shell-memory-tags-edit-390-dark.png) |

The test selected and cleared a native checkbox by pointer/keyboard, asserted no horizontal overflow at 320/360/390/430 px, and ran axe checks around the capture fields. The PR-critical `memory-create-defaults.spec.ts` also saves a tagged narrative, checks the POST tags, and observes the tag on the canonical Memory detail. Unit tests cover the uncertain-create snapshot and tag-only Save rejection; backend integration cases cover protected persistence, unrelated edits, idempotency conflicts, and export/import in CI.

Review against Product Reference v1 R1 and the [Mobile Interaction Contract](../../../../product/design/509-memory-smart-tags-preflight.md): the photo/narrative remains primary, tags sit below the narrative on capture, selection is secondary to Save, and the fixed shared-audience note remains intact. The chips wrap without side scrolling, show a text check as well as a border, and stay legible in both themes. Detail tags are quiet content context. The existing heading at 320 px / 200% splits the last letter of “Erinnerung” onto its own line; this is a pre-existing heading reflow limitation, visible in the evidence, not a clipped or inaccessible control. The fixed bottom navigation may cover part of a full-page edit screenshot at its viewport position; the form remains scrollable.

No native Android capture or device acceptance is claimed. The issue's other content types remain out of this Memory slice.

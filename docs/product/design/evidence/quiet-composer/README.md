# Quiet composer runtime evidence

This is real browser evidence for #1717, separate from the
[generated preflight and approved composition](../../references/quiet-composer/README.md).
Synthetic fixtures contain no private relationship data. No physical-device or
deployed-product acceptance is claimed.

## Revision and reproducibility

The production source was frozen after local commit
`6707f11a7`; its final behavior-only correction preserves dirty local dates
when refreshed defaults arrive. Subsequent changes only add evidence. The independent browser worktrees have identical
tracked runtime source. SHA256 over sorted tracked `web/src` paths, excluding
`.test.` and `.spec.`, with each UTF-8 path + NUL + file bytes + NUL:

`069dc60e7038a44ead8e4c6b96447afdf97774d1469f65767b27312bdde62ba5` (1,465 files).

Chromium ran against production builds with the repository Playwright fixtures.
The local runner supplies the managed Chromium executable and isolated server
ports; the committed specs, fixtures, assertions and production build are the
same owners used by CI. Screenshots use deterministic synthetic content, fixed
viewports and reduced motion where specified. Header controls remain native
form-associated actions, and date/tag/audience tasks are opened through their
visible user controls.

## Captures

| Capture | State and purpose |
| --- | --- |
| [Diary, 390px Dark](diary-create-390-dark.png) | Fresh navigation; compact header, date, grouped title/prose and disclosed enrichment. |
| [Diary, Expanded Dark](diary-expanded-dark.png) | Same bounded composition at Expanded width. |
| [Diary, 320px/200% Dark](diary-320-200-dark.png) | Short Compact viewport; complete header words and reachable task actions. |
| [Plan, 390px Dark](plan-create-390-dark.png) | Title/note before shared Lists, compact schedule and media. |
| [Selected tags, 360px Light](memory-tags-360-light.png) | Private place and selected context survive create, save, edit and reload. |
| [Selected tags, 430px Light](memory-tags-430-light.png) | Same preserved state at wider Compact width. |
| [Heart create Light](heart-feeling-create-390-light.png), [Dark](heart-feeling-create-390-dark.png) | Selected Dankbar colors the whole writing card. |
| [Heart edit Light](heart-feeling-edit-390-light.png), [Dark](heart-feeling-edit-390-dark.png) | Existing selection and editing retain the same full semantic surface. |
| [Heart reading Light](heart-feeling-reading-1440-light.png), [Dark](heart-feeling-reading-1440-dark.png) | Saved selection colors the complete reading card at Expanded width. |

The screenshots are representative states. The feeling contract additionally
selects all six native options in create and edit in both themes, checks the
LOVED default, text and placeholder contrast of at least 4.5:1, native save,
reading and reload persistence, and absence of horizontal overflow. Existing
photo journeys compare the served foreground bytes and assert no filter,
opacity or blend alteration; the intentional decorative blurred backdrop is
not the foreground photograph.

## Validation

- Full Web unit suite: **2,853 passed**, zero failures, two existing skips.
  Focused coverage includes native external-submit association, date/range
  backing fields, invalid-field reveal/focus, schedule/reset/end-time
  persistence, pending exit guards, tag drafts and six-feeling/reset behavior.
  Two additional regressions preserve dirty dates across refreshed defaults
  while untouched values and explicit native reset adopt the latest defaults.
- Final-source browser runs: **17 layout/disclosure cases**, **19 supplementary
  R1 capture cases**, the dedicated **all-six feeling contract** and six existing
  Heart reading/photo/privacy cases passed. The preceding source also passed
  **103 functional cases**; the only subsequent behavior change is the dirty-date
  guard protected by two additional component regressions. These are targeted
  runs, not a claim that the complete hosted browser inventory was run locally.
- TypeScript, production build, semantic-token generation, legal/static locale
  and PWA checks, Capacitor foundation, lint/format and diff checks passed.
  Existing lint warnings remain. One local full-suite attempt under simultaneous
  browser/build load hit the unchanged pagination test’s 5-second budget; its
  isolated owner suite passed 16/16 (the target took 1,068ms), then the full
  suite was checked without concurrent browser/build load. No timeout or
  assertion was changed.
- Product-design classifier/review regressions: **33**; living-status checks:
  **12**; browser-planning regressions: **38** passed. The inventory remains
  **104 owned specs**; no protection, selection or assertion gate was weakened.

The first feature batch exposed four test migrations after progressive
disclosure/header placement. They were corrected by opening real tasks and
asserting actual capability availability; the final layout batch passes.
Deletion geometry now inventories rendered controls instead of treating a
closed, mounted tag field as a visible zero-size target. Visible target and
containment assertions remain intact.

Browser checks also exposed actual layout causes: globally sized native date
backings, intrinsic containment on a collapsed tag disclosure, unbounded SVGs,
and accumulated inline padding at enlarged text. The fixes constrain the
backing controls, preserve full-width disclosure, bound glyphs and reflow the
existing header/media composition. No forced clicks, arbitrary delays, retries,
page overflow clipping or assertion relaxation were added.

Capability-unavailable fixtures continue to omit unavailable photo sources or
voice; capable media/voice journeys preserve their existing state, import,
review, playback, sorting, cover, sensitivity and retry owners. The PR's
applicable hosted checks must pass on its final published head before it is
reported merge-ready.

# Final add-action visual evidence

PR: #1698. Issue: #1697. This evidence-only commit preserves unmodified synthetic-fixture browser captures separately from the validated source branch.

## Provenance

- Source head: `fc28138d57ffc695553cccbc666d61c7651ba4e9`.
- Source tree: `30170e8d8f76f309230d4d6b0491b5f750ba89ce`.
- Base main: `ab4590db29e53bc6eeed6b532e2e35dc17bdcfdf`.
- Tested PR merge snapshot: `2e9667994ef289c6f73d854b9fdd46388d3ac596`.
- Hosted [Web Browser QA run 42470990558](https://github.com/baerenmarke90/eimir/actions/runs/42470990558), attempt 1: 271 changed-spec cases and 878 PR-critical cases passed, 1,149 total. Aggregate Playwright + axe passed.
- Hosted [Web S8 run 42470990601](https://github.com/baerenmarke90/eimir/actions/runs/42470990601): 2,771 passed, two existing skips; build, lint and typechecks passed.

The screenshots are byte-for-byte copies of the source-bound workflow artifacts listed below. No image generation, visual editing, cropping or fixture substitution was performed. Original artifact paths and SHA-256 hashes allow independent verification after the short-lived Actions downloads expire.

## Reviewed result

The supplied Planning pattern is now the shared add-action surface: canonical blue fill, decorative plus, visible localized caption, pill radius and comfortable target. Compact People places its action below the heading. Media, tag, period, place and list actions follow the same contract in both themes and at larger text settings. The 320 px / 200% capture keeps the plus at the shared icon token and allows the full action caption to wrap. Empty Plan place selection also uses `+ Ort hinzufügen`; selecting a place retains the existing button identity, named selected-value editing and picker/focus lifecycle.

Pending list writes are covered by held-write browser assertions that verify identical button dimensions before and during submission. These screenshots do not claim to depict the pending state. Existing navigation, selected-value editing, native source choices and progressive disclosure retain their distinct semantics.

This is scoped visual acceptance of the changed add controls, not a redesign or blanket approval of surrounding legacy forms. Existing unrelated 200% emotion-choice reflow remains tracked separately in #1695. No source change, merge, release or deployment is included in this evidence commit.

## Captures

| Capture | Reviewed scope | Artifact | SHA-256 |
| --- | --- | --- | --- |
| [planning-360-light.png](planning-360-light.png) (360 × 913) | Compact Planning reference, visible Plan action | 13613073614 | `d8df9ca5c57b2cdbbda766aea03e3874f1b9ca01c0338b6617cf7172dac6ec18` |
| [people-390-light.png](people-390-light.png) (390 × 844) | Compact People header and Person action without heading collision | 13613073614 | `1ad25a3d8d5924c6e2e9a05d2f861ef2d0d4871ab4585939221af412fda73a5f` |
| [days-390-light.png](days-390-light.png) (390 × 968) | Compact Important Days action, focus return and successful creation | 13613073614 | `66003efd2892052cbb2b1263d0cf34bcb65e2c4c08ecdc0c291343de57ae48c8` |
| [heart-moment-390-light.png](heart-moment-390-light.png) (390 × 1487) | Compact media, place and tag insertion in Light | 13612694795 | `50e3d0f60e7976bdc3d9aaca4f0e96b0dcdd9e5d5354b7f59e9019f390fbe19f` |
| [tags-390-dark.png](tags-390-dark.png) (390 × 1567) | Compact media and authored tag insertion in Dark | 13613772561 | `f937efac06bbd11b918ce2c991c8b25b4adff3ae76dddca3e33feb3bb6cfa9ed` |
| [plan-320-200-percent-light.png](plan-320-200-percent-light.png) (320 × 2016) | 320 px Plan capture at 200% root text; consistent icon and wrapped captions | 13613772561 | `ef24b7c08ad39e17d7634d96cf7743da9f87e54f24e0180d7ce52b7f4a18a119` |
| [memory-expanded-dark.png](memory-expanded-dark.png) (1280 × 1026) | Expanded Dark period, media and place insertion | 13613073614 | `ec385706b8bff58864045f8248df672be7ec7a94374114a5b7c2f56d85de3466` |
| [memory-large-text-light.png](memory-large-text-light.png) (390 × 1428) | 390 px Memory at 24 px root text (150%) | 13613073614 | `ce7c34290d75a0e2e2e1fd890d52447c132bc09091acd62096f5e05c23e7a52d` |
| [lists-expanded-light.png](lists-expanded-light.png) (1440 × 900) | Expanded Light shared-list creation | 13613772561 | `70a600c4f3636b4963f432bb322fae5a2011d3ef3c34220b860a8e3427cfe75d` |

## Original artifact paths

- **planning-360-light.png** — artifact 13613073614: `planning-search-private-pr-a6da1-destinations-at-360px-light-chromium/planning-search-360-light.png`.
- **people-390-light.png** — artifact 13613073614: `people-important-dates-mob-400e7-hands-birthdays-to-Planning-chromium/shell-831-people-overview-390-light.png`.
- **days-390-light.png** — artifact 13613073614: `people-important-dates-mob-400e7-hands-birthdays-to-Planning-chromium/shell-831-occasions-390-light.png`.
- **heart-moment-390-light.png** — artifact 13612694795: `heart-moment-create-produc-f1bfc--Compact-composition-light--chromium/shell-heart-moment-create-reference-390-light.png`.
- **tags-390-dark.png** — artifact 13613772561: `private-location-and-captu-715d5-s-save-edit-reload-390-dark-chromium/shell-1693-tags-390-dark.png`.
- **plan-320-200-percent-light.png** — artifact 13613772561: `private-location-and-captu-79bd7-and-200-text-plan-plans-new-chromium/shell-1693-tags-large--plan-plans-new.png`.
- **memory-expanded-dark.png** — artifact 13613073614: `create-surface-visual-chec-502be-retired-sharing-block-dark--chromium/shell-memory-create-expanded-dark.png`.
- **memory-large-text-light.png** — artifact 13613073614: `create-surface-visual-chec-55be8-etired-sharing-block-light--chromium/shell-memory-create-large-text-light.png`.
- **lists-expanded-light.png** — artifact 13613772561: `product-accessibility-plan-c2ce4--at-200-percent-layout-zoom-chromium/planning-collections-expanded-light.png`.

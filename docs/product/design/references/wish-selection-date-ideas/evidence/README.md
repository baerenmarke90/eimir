# Date ideas in the shared selection: runtime evidence (#465 within #1535)

Captured by `web/e2e/tests/wish-selection-date-ideas.spec.ts` (Chromium,
mocked API derived from the bundled editorial catalog, reduced motion) on
branch `feat/wish-selection-date-ideas`; the pull request records the exact
head commit. These runtime captures are separate from the preflight
[Compact reference](../compact-reference.png).

| File | State |
| --- | --- |
| `wish-selection-ideas-setup-390-light.png` | Pro setup: summary of one Wish and two date ideas, source switch on date ideas (`wishSelection.sourceIdeas`), shared category filters. |
| `wish-selection-ideas-private-390-light.png` | Private choice with a Wish row and two idea rows (image, source label); nothing published yet. |
| `wish-selection-ideas-result-390-light.png` | Common date idea after both published: image, `wishSelection.sharedIdea`, facts, plan now (`dateIdeas.card.plan`) and save as Wish (`dateIdeas.card.save`); the non-common idea is absent. |
| `wish-selection-ideas-result-{360-light,390-dark,430-light,1280-dark}.png`, `…-result-320-light.png` | Result reflow, full page, including the later (`wishSelection.later`) note; 320 px at 200 % text. |
| `wish-selection-ideas-setup-{360-light,390-dark,430-light,1280-dark}.png`, `…-setup-320-light.png` | Setup picker reflow, full page (images below the fold load lazily); 320 px at 200 % text. |

Behavioral acceptance in the same spec (8 tests): Free keeps a Wish-only round
(`dateIdeaIds: []`) and shows the calm Pro hint without any catalog request;
Pro combines a Wish and two ideas → private choice → deliberate publication with
`favoriteDateIdeaIds` → common idea → plan now (`dateIdeas.card.plan`) opens the prefilled Plan
composer → one Plan with the idea's `planTitle` → Back returns to the
selection; the match itself saves nothing. A paused round (downgrade) shows no
catalog title and is replaced by a Wish-only round. Every state has no
horizontal overflow and passes axe (WCAG 2.2 AA tags) except the 200 % text
captures, which check reflow only.

Not covered here: a physical Android device run (no wrapper or native change)
and a real two-device partner session; the partner's publication is simulated
by the mocked API, while the real intersection and privacy boundary are covered
by backend PostgreSQL/HTTP tests.

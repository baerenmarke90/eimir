# #1907 J1 implementation evidence (web)

Exported from the browser journeys with `SCREENSHOT_EXPORT_DIR` on the merged
branch `feat/1907-j1-wishes-entry` (mocked API, German locale, partner shown as
`Alex`). Journeys: `shared-wish-selection.spec.ts`, `wish-selection-date-ideas.spec.ts`,
`date-inspiration.spec.ts`. Copy is referenced by locale key in the PR, not here.

| File | State |
| --- | --- |
| `wish-selection-entry-{360-light,390-dark,430-light,1280-dark}.png` | One entry row on the open Wishes list |
| `wish-selection-compose-{360-light,390-dark,430-light,1280-dark}.png` | Empty round: three steps, two source cards |
| `wish-selection-compose-320-light-large-reduced.png` | Same at 320 px with 200 % text and reduced motion |
| `wish-selection-pick-wishes-390-light.png` | Wish source with the sticky count bar |
| `wish-selection-setup-390-light.png` | Hub with two Wishes in the round and the occasion field |
| `wish-selection-ideas-pick-390-light.png` | Date ideas in pick mode: full cards, one action, filter button |
| `date-inspiration-390-dark-filters.png` | The one filter sheet (category, duration, budget, place) |
| `wish-selection-favorites-{360-light,390-dark,430-light}.png` | Private heart favourites, one marked |
| `wish-selection-favorites-320-light-large-reduced.png` | Same at 320 px with 200 % text and reduced motion |
| `wish-selection-several-390-light.png` | Two common favourites to tap |
| `wish-selection-chosen-390-light.png` | The tapped favourite as hero with the undo action |
| `wish-selection-no-match-390-light.png` | No common favourite |
| `date-inspiration-composer-hint-390-dark.png` | Solo browsing hint in the Wish composer |

Random pick with consent (follow-up PR, `shared-wish-selection.spec.ts`):

| File | State |
| --- | --- |
| `wish-selection-random-offer-390-light.png` | No common favourite: propose chance, pool kind and consent line |
| `wish-selection-random-asked-390-light.png` | Own pending question with withdraw |
| `wish-selection-random-consent-390-light.png` | The partner's request: agree, change favourites first, decline |
| `wish-selection-random-decided-390-light.png` | The stored pick after consent, the same on both devices |

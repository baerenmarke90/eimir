# Own daily check-in as the shared bottom sheet

Evidence for the change that opens the personal daily check-in (own vibe,
battery and note) from the own avatar as the same bottom sheet the partner
avatar already uses.

Baseline: `origin/main` at `de1fd7304`. Screens captured by the
`visual evidence` cases of `web/e2e/tests/today-daily-checkin.spec.ts`.

| File | State |
| --- | --- |
| `compact-390-light-own-check-in-sheet.png` | Compact, Light: the own check-in rising from the bottom |
| `compact-390-light-partner-sheet-reference.png` | Compact, Light: the partner sheet it must match (unchanged) |
| `compact-390-dark-reduced-motion-own-check-in-sheet.png` | Compact, Dark, reduced motion |
| `compact-360-large-text-own-check-in-sheet.png` | 360 px at 200 % text: vibes wrap, the sheet scrolls |
| `expanded-1280-light-own-check-in-sheet.png` | Expanded: the shared centred sheet presentation |

Behaviour covered by the browser spec: open from the avatar, save vibe, energy
and note independently, delete and undo a note inside the sheet, close with
Done, Escape or a press on the scrim (each saves the open note), focus returns
to the own avatar, failed save and offline states.

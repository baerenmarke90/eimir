# Navigation continuity

The Product Reference v1 navigation and task boundaries govern this correction. The App Shell, Story and Planning overviews, Detail View and Short Task templates supply the existing layout. The visible focus is the selected destination and its primary action. The baseline is main `6e51e7c0d`. The source under test is `508919b1871cdd97cd15b82015a7fc8e537acc53`, including browser inventory metadata. [App continuity #1470](https://github.com/baerenmarke90/eimir/issues/1470), [creation handoff #1753](https://github.com/baerenmarke90/eimir/pull/1753).

## Mobile interaction

- A held touch gives immediate feedback. The four primary destinations and the floating creation action keep their viewport coordinates throughout the transition. The live destination is immediately interactive, including during consecutive swipes. Expanded uses its existing top navigation.
- The visible loading status remains available for an initial read. The content begins its brief opacity transition when the result arrives. A direct return to Story reuses the fresh query. Empty states, request errors, retries and offline status use the existing components.
- A direct choice in the moment sheet opens the editor as soon as the dialog and its history entry have released. Back restores the origin and focus. Dirty drafts, pending saves and confirmed results follow the existing task boundaries. Reduced motion uses immediate content handoff.

## Chromium evidence

| State | Capture |
| --- | --- |
| Compact Planning at the first frame of a held entry animation | [390 px Light](planning-entry-390-light.png) |
| Compact Story while the Discover response is held | [390 px Light](story-loading-390-light.png) |
| Compact Story when the same response first becomes visible | [390 px Light](story-entry-390-light.png) |
| Moment choices over a filtered Timeline | [390 px Dark, reduced motion](moment-choices-390-dark.png) |
| Planning with Expanded top navigation | [1280 px Light](planning-expanded-light.png) |

These captures use synthetic data. The baseline regression measured a 4 CSS pixel horizontal jump in the floating action between the first animation frame and the settled page. The corrected browser case compares both coordinates and dock clearance and checks that the document lifetime stays continuous. Further cases hold a network response and a sheet exit, verify warm Story reuse, and exercise open, interact, save, confirmed result and return, including draft safety, selection and scroll. The suite covers 320, 360, 390 and 430 CSS px, Expanded, Light, Dark, reduced motion, large text and a simulated Capacitor runtime.

The 108 selected Chromium cases passed across the initial run and isolated reruns. Two cases timed out during concurrent checks and passed individually with their original limits. The 178 focused Vitest cases, 38 browser planning checks, production build, Capacitor foundation and browser inventory passed. The concurrent full Vitest run was stopped after timeouts. Physical Android device acceptance is pending.

# Discreet plans implementation evidence (#1790 F3)

Captured by `web/e2e/tests/discreet-plans.spec.ts` (reduced motion, mocked
API, English example content) on branch `feat/1790-discreet-plans` at
`9ba68dfab`.

| Prefix | State |
| --- | --- |
| `discreet-plans-overview-*` | Planen: list title, date, lock on the blurred cover, neutral lines, "Zum Anzeigen öffnen". |
| `discreet-plans-concealed-*` | Detail before "Anzeigen": place as a neutral bar, blurred cover, list title, schedule, calendar and completion actions. |
| `discreet-plans-revealed-*` | Detail after "Anzeigen": real title, place, prose, tags and comments; "Wieder verdecken" is focused. |
| `discreet-plans-editor-*` | Editor: "Diskret" below "Vorfreude auf Wir zeigen" with the prefilled suggestion, and the "Originaltitel" choice. |

Variants: 360 px Light, 360 px Light with 200 % text, 390 px Dark, 430 px Light
and 1280 px Dark (Expanded); the editor at 390 px Light.

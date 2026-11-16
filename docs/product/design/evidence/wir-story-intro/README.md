# Wir story summary introduction

Follow-up to [#1736](https://github.com/baerenmarke90/eimir/issues/1736). Baseline main was `95f3c096d94446e440a01943cb75dfe368671512`. The Compact composition reference was generated in Chromium from that revision's Wir route before editing the component. It shows the story summary alongside recent activity, the floating add control, and bottom navigation. All captures use synthetic fixtures.

| View | Evidence |
| --- | --- |
| Compact composition reference | [390 px Classic Light](compact-reference.png) |
| Implemented Wir view | [390 px Classic Light](compact-classic-light.png) |
| Implemented wide story card | [1280 px Dark](expanded-dark.png) |

The R4 Today reference and Today template govern the existing placement. The story summary now introduces the shared total with localized copy and the Moments heart. The day count appears in the relationship masthead. Category links lead directly to their corresponding timeline filters. The card uses existing semantic tokens and feedback. Very narrow layouts give the words priority over the decorative icon. [R4 Today reference](../../reference-screens.md#r4--wir--today) · [Today template](../../../../SCREEN-TEMPLATES.md#3-template-today)

The browser journey verifies the 181-to-182 day update on reload, refreshed totals, an unavailable duration, two and three categories, category navigation and return, and the personal Pro opt-in. Visual and accessibility checks cover Compact widths of 360, 390, and 430 px in Light and Dark, 320 px at 200% text, and Expanded at 1280 px. The Web build and 131 focused unit tests passed. The same Web component is used in Capacitor.

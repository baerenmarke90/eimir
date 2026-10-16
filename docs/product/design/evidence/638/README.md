# Notification settings: rendered Web evidence (#638)

The [Compact Light preflight](notification-settings-compact-light.jpg) was
recorded in [#638](https://github.com/baerenmarke90/eimir/issues/638#issuecomment-5811870487)
before implementation. It is a concept image. The four PNGs below are unedited,
full-page Chromium captures of the implemented `/more/settings/notifications`
route from [Web Browser QA run 35987171835](https://github.com/baerenmarke90/eimir/actions/runs/35987171835)
at commit `d7408e60`:

| Viewport | Light | Dark |
| --- | --- | --- |
| Compact, 390 × 844 | [Rendered view](implemented-390-light.png) | [Rendered view](implemented-390-dark.png) |
| Expanded, 1280 × 900 | [Rendered view](implemented-1280-light.png) | [Rendered view](implemented-1280-dark.png) |

The actual Compact view stacks the three channel choices per event. The concept
image arranged them in three columns at an illustrative width. That arrangement
made capability explanations too narrow in the real 390px browser view. Expanded
retains three columns. The implementation retains the existing anniversary and
birthday rule forms, their original wording, and the Notification Center link;
the concept used simplified example text and form details. The fixed bottom
navigation
appears at its initial viewport position within each full-page capture; the rest
of the page scrolls behind it.

The same browser run exercised the E-Mail switch, its server-confirmed result,
Back and reopen persistence, 320/360/390/430px Settings reflow, 320px with 200%
text, and WCAG axe checks in Light and Dark. No unresolved Web UI deviation was
observed in these checks. Push endpoint/provider setup (#565), digest and quiet
hours (#515), and native Android UI remain separate follow-ups to #638.

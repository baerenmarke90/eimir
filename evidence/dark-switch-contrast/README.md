# Switch contrast in Dark

Static renderings of the real `theme.css` and `PreferenceSwitch.css` (the `styles.css` base variables are included) at a 390 px wide Compact viewport, 2x scale, each with one on and one off switch on a raised card. They are produced with headless Edge from standalone HTML pages that only load these CSS files; they are not screenshots of the running app and not a device check.

| State | Dark | Light |
| --- | --- | --- |
| Before | [before-dark.png](before-dark.png) | [before-light.png](before-light.png) |
| After | [after-dark.png](after-dark.png) | [after-light.png](after-light.png) |

- Dark: the on track was a navy about 1.2:1 against the card; it is now a light track with a dark thumb, and the off switch has a visible outline.
- Light: before and after are identical, as intended.
- The switch control has a fixed size (44x26 track, 48 px touch target) and only its colors change, so the Expanded layout shows the same control with the same colors; row arrangement is untouched by this PR.

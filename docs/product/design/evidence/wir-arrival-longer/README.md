# Wir arrival, a notch longer

The opening of Wir (portraits, rings, names, heart line, ampersand and time) ran for about 0.84 s. After a phone check the Product Owner asked for it to be "a notch longer". The whole opening now counts in one beat, `--wir-intro-beat` = 1.4 times the shared sequence beat, and the modules follow the hero slightly later.

Timing of the stage animations, in milliseconds after the opening starts (delay + duration = end):

| Element | Before (calculated from the previous CSS) | After (measured in the running app) |
| --- | --- | --- |
| Heart line arms | 0 + 400 = 400 | 0 + 560 = 560 |
| Heart line path | 200 + 400 = 600 | 280 + 560 = 840 |
| Portraits | up to 80 + 480 = 560 | up to 112 + 672 = 784 |
| Rings around the portraits | up to 200 + 480 = 680 | up to 280 + 672 = 952 |
| Names and today's state | 280 + 400 = 680 | 392 + 560 = 952 |
| Ampersand and joined time | 440 + 400 = 840 | 616 + 560 = 1176 |

The "after" column was read from `getAnimations()` on the running app (local test instance, demo Space, web served from the PR branch, Compact 430 px). The opening ends at 1.18 s instead of 0.84 s, about 40 % longer. With reduced motion every duration is 0 ms as before.

The composition at rest is unchanged, so the final-state screenshots of the previous Wir change apply: `docs/product/design/evidence/wir-calm-arrival/`.

Not covered: a physical device and how the longer opening feels there.

## The distance (added by the Wir distance motion that landed on main meanwhile)

That change gives the distance its own choreography: the slot fades, the pin settles, then the value fades over, and a current position wiggles once. Its rules now count in the same opening beat, so the distance stays in step with the stretched opening. These values are calculated from the CSS, not re-measured after merging main:

| Element | Before (beat 200 ms) | After (beat 280 ms) |
| --- | --- | --- |
| Distance slot fades | 440 + 400 = 840 | 616 + 560 = 1176 |
| Pin settles | 440 + 600 = 1040 | 616 + 840 = 1456 |
| Value fades in | 840 + 400 = 1240 | 1176 + 560 = 1736 |
| Pin wiggle (current position only, 900 ms, not scaled) | 880 + 900 = 1780 | 1232 + 900 = 2132 |

The wiggle that runs outside the opening keeps its original delay.

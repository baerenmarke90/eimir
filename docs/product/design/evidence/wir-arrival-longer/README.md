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
| Ampersand, joined time, distance | 440 + 400 = 840 | 616 + 560 = 1176 |

The "after" column was read from `getAnimations()` on the running app (local test instance, demo Space, web served from the PR branch, Compact 430 px). The opening ends at 1.18 s instead of 0.84 s, about 40 % longer. With reduced motion every duration is 0 ms as before.

The composition at rest is unchanged, so the final-state screenshots of the previous Wir change apply: `docs/product/design/evidence/wir-calm-arrival/`.

Not covered: a physical device and how the longer opening feels there.

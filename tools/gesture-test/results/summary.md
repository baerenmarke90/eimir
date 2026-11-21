# Gesture test results

Chromium 151.0.7922.34 (Playwright, headless), 4x CPU throttling, 390x844, median of 5 runs, 2026-11-19T22:25:52.587Z.

| Variant | Scenario | Load ms/frame | Reduced | Dismissed | Settle ms | Frames drawn / expected | Drawn-frame gap p95 / max ms | Main-thread frame p95 / max ms | Style writes during settle | Finger velocity (measured) / estimated by variant / sheet before / after release px/ms | Regrab jump px |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: |
| current | fling | 0 | no | 0 % | 200 | 11 / 12 | 20.1 / 20.1 | 18.6 / 18.6 | 1 | 0.36 / n/a / 0.57 / -1.06 | n/a | 0.0 | 42.6 |
| current | dismiss | 0 | no | 100 % | 292 | 17 / 18 | 19.9 / 19.9 | 17.9 / 17.9 | 0 | 0.11 / n/a / 0.12 / 0.47 | n/a | 0.0 | 56.0 |
| current | cancel | 0 | no | 0 % | 191 | n/a / n/a | n/a / n/a | 18.3 / 18.3 | 1 | 0.00 / n/a / 0.00 / -0.83 | n/a | 0.0 | n/a |
| current | interrupt | 0 | no | 0 % | 497 | n/a / n/a | n/a / n/a | 20.9 / 27.2 | 4 | 0.00 / n/a / 0.00 / -0.93 | 11.7 | 0.0 | n/a |
| current | fling | 24 | no | 0 % | 242 | 12 / 14 | 26.7 / 26.7 | 34.6 / 34.6 | 1 | 0.36 / n/a / 0.41 / -0.22 | n/a | 0.0 | 43.8 |
| current | dismiss | 24 | no | 100 % | 339 | 17 / 20 | 28.9 / 28.9 | 41.5 / 41.5 | 0 | 0.00 / n/a / 0.15 / 0.00 | n/a | 0.0 | 75.4 |
| current | cancel | 24 | no | 0 % | 228 | n/a / n/a | n/a / n/a | 39.6 / 39.6 | 1 | 0.00 / n/a / 0.00 / 0.00 | n/a | 0.0 | n/a |
| current | interrupt | 24 | no | 0 % | 248 | n/a / n/a | n/a / n/a | 32.6 / 32.8 | 1 | 0.00 / n/a / 0.00 / -0.18 | 11.7 | 0.0 | n/a |
| current | dismiss | 0 | yes | 100 % | 2 | 0 / 1 | n/a / n/a | n/a / n/a | 0 | 0.00 / n/a / 0.12 / 0.00 | n/a | 0.0 | 68.2 |
| current | interrupt | 0 | yes | 0 % | 3 | n/a / n/a | n/a / n/a | n/a / n/a | 0 | 0.00 / n/a / 0.00 / 0.00 | 0.0 | 0.0 | n/a |
| waapi | fling | 0 | no | 0 % | 455 | 26 / 27 | 22.0 / 24.3 | 18.8 / 19.0 | 1 | 0.23 / 0.38 / 0.40 / -0.46 | n/a | 0.0 | 50.8 |
| waapi | dismiss | 0 | no | 100 % | 516 | 30 / 31 | 21.0 / 21.7 | 17.9 / 19.1 | 1 | 0.11 / 0.19 / 0.15 / 1.70 | n/a | 0.0 | 62.9 |
| waapi | cancel | 0 | no | 0 % | 423 | n/a / n/a | n/a / n/a | 19.0 / 20.1 | 1 | 0.00 / 0.10 / 0.00 / -0.47 | n/a | 0.0 | n/a |
| waapi | interrupt | 0 | no | 0 % | 773 | n/a / n/a | n/a / n/a | 19.6 / 24.2 | 5 | 0.00 / 0.10 / 0.00 / -0.51 | 0.0 | 33.3 | n/a |
| waapi | fling | 24 | no | 60 % | 562 | 31 / 34 | 23.2 / 29.3 | 35.6 / 35.6 | 1 | 0.39 / 0.64 / 0.54 / 0.00 | n/a | 0.0 | 33.3 |
| waapi | dismiss | 24 | no | 100 % | 540 | 30 / 32 | 18.9 / 27.5 | 32.6 / 32.6 | 1 | 0.11 / 0.20 / 0.12 / 0.00 | n/a | 0.0 | 56.4 |
| waapi | cancel | 24 | no | 0 % | 473 | n/a / n/a | n/a / n/a | 34.4 / 34.4 | 1 | 0.00 / 0.09 / 0.00 / 0.00 | n/a | 0.0 | n/a |
| waapi | interrupt | 24 | no | 0 % | 897 | n/a / n/a | n/a / n/a | 31.9 / 33.8 | 5 | 0.00 / 0.11 / 0.00 / -0.20 | 0.0 | 41.1 | n/a |
| waapi | dismiss | 0 | yes | 100 % | 1 | 0 / 1 | n/a / n/a | n/a / n/a | 0 | 0.11 / 0.25 / 0.24 / 0.00 | n/a | 0.0 | 51.9 |
| waapi | interrupt | 0 | yes | 0 % | 1 | n/a / n/a | n/a / n/a | n/a / n/a | 0 | 0.00 / 0.12 / 0.00 / 0.00 | 0.0 | 0.0 | n/a |
| motion | fling | 0 | no | 100 % | 507 | 28 / 30 | 19.0 / 20.3 | 17.9 / 18.6 | 28 | 0.76 / 0.79 / 0.86 / 2.51 | n/a | 0.0 | 22.8 |
| motion | dismiss | 0 | no | 100 % | 457 | 27 / 27 | 19.4 / 20.1 | 18.8 / 19.7 | 27 | 0.11 / 0.20 / 0.13 / 1.62 | n/a | 0.0 | 54.5 |
| motion | cancel | 0 | no | 0 % | 410 | n/a / n/a | n/a / n/a | 18.2 / 19.9 | 23 | 0.00 / 0.00 / 0.00 / -0.45 | n/a | 0.0 | n/a |
| motion | interrupt | 0 | no | 0 % | 635 | n/a / n/a | n/a / n/a | 19.6 / 21.7 | 29 | 0.00 / 0.00 / 0.00 / -0.47 | 4.5 | 35.8 | n/a |
| motion | fling | 24 | no | 100 % | 524 | 16 / 31 | 32.9 / 32.9 | 33.1 / 33.1 | 16 | 0.71 / 0.77 / 0.83 / 2.77 | n/a | 0.0 | 31.4 |
| motion | dismiss | 24 | no | 100 % | 474 | 15 / 28 | 31.4 / 31.4 | 32.3 / 32.3 | 16 | 0.11 / 0.17 / 0.12 / 1.71 | n/a | 0.0 | 59.1 |
| motion | cancel | 24 | no | 0 % | 456 | n/a / n/a | n/a / n/a | 31.1 / 31.1 | 13 | 0.00 / 0.00 / 0.00 / -0.15 | n/a | 0.0 | n/a |
| motion | interrupt | 24 | no | 0 % | 865 | n/a / n/a | n/a / n/a | 32.6 / 34.7 | 18 | 0.00 / 0.00 / 0.00 / -0.15 | 3.2 | 34.9 | n/a |
| motion | dismiss | 0 | yes | 100 % | 1 | 0 / 1 | n/a / n/a | n/a / n/a | 0 | 0.11 / 0.17 / 0.11 / 3.58 | n/a | 0.0 | 76.4 |
| motion | interrupt | 0 | yes | 0 % | 1 | n/a / n/a | n/a / n/a | n/a / n/a | 0 | 0.00 / 0.00 / 0.00 / -0.93 | 0.0 | 0.0 | n/a |

| Variant | Initial JS gzip | Lazy JS gzip | Initial delta vs baseline | Total delta vs baseline | Gesture code lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 69035 B | 0 B | — | — | — |
| current | 69848 B | 0 B | 813 B | 813 B | 67 (+ 52 shared) |
| waapi | 70193 B | 0 B | 1158 B | 1158 B | 145 (+ 52 shared) |
| motion | 102808 B | 21309 B | 33773 B | 55082 B | 72 (+ 52 shared) |

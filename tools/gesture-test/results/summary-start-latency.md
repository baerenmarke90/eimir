# Gesture test results

Chromium 151.0.7922.34 (Playwright, headless), 4x CPU throttling, 390x844, median of 5 runs, 2026-11-19T22:29:19.463Z.

| Variant | Scenario | Load ms/frame | Reduced | Dismissed | Settle ms | Frames drawn / expected | Drawn-frame gap p95 / max ms | Main-thread frame p95 / max ms | Style writes during settle | Finger velocity (measured) / estimated by variant / sheet before / after release px/ms | Regrab jump px |
| --- | --- | ---: | --- | ---: | ---: | --- | --- | --- | ---: | --- | ---: | ---: | ---: | ---: |
| current | fling | 0 | no | 0 % | 193 | 11 / 12 | 18.5 / 18.5 | 19.0 / 19.0 | 1 | 0.72 / n/a / 0.93 / -0.98 | n/a | 0.0 | 31.9 | 25.5 |
| current | dismiss | 0 | no | 100 % | 292 | 17 / 18 | 19.5 / 19.5 | 19.1 / 19.1 | 0 | 0.11 / n/a / 0.24 / 0.47 | n/a | 0.0 | 52.7 | 24.2 |
| current | fling | 24 | no | 0 % | 227 | 12 / 14 | 26.1 / 26.1 | 30.3 / 30.3 | 1 | 0.80 / n/a / 0.99 / -0.76 | n/a | 0.0 | 20.4 | 91.0 |
| current | dismiss | 24 | no | 100 % | 331 | 18 / 20 | 26.9 / 26.9 | 30.3 / 30.3 | 0 | 0.11 / n/a / 0.13 / 0.12 | n/a | 0.0 | 52.0 | 90.6 |
| waapi | fling | 0 | no | 100 % | 523 | 31 / 31 | 20.3 / 21.1 | 18.3 / 18.8 | 1 | 0.84 / 1.03 / 0.99 / 2.71 | n/a | 0.0 | 18.2 | 23.5 |
| waapi | dismiss | 0 | no | 100 % | 507 | 30 / 30 | 19.1 / 20.3 | 19.0 / 19.4 | 1 | 0.10 / 0.20 / 0.12 / 1.79 | n/a | 0.0 | 53.0 | 28.7 |
| waapi | fling | 24 | no | 80 % | 544 | 30 / 33 | 19.5 / 24.7 | 34.6 / 34.6 | 1 | 0.70 / 0.77 / 0.93 / 0.54 | n/a | 0.0 | 29.9 | 92.9 |
| waapi | dismiss | 24 | no | 100 % | 545 | 30 / 33 | 21.2 / 26.8 | 29.9 / 29.9 | 1 | 0.11 / 0.24 / 0.24 / 0.84 | n/a | 0.0 | 54.6 | 92.0 |
| motion | fling | 0 | no | 100 % | 509 | 28 / 31 | 19.2 / 19.3 | 18.3 / 18.6 | 28 | 0.75 / 0.75 / 0.91 / 2.45 | n/a | 0.0 | 23.3 | 24.8 |
| motion | dismiss | 0 | no | 100 % | 460 | 27 / 28 | 19.4 / 19.7 | 17.9 / 18.9 | 27 | 0.11 / 0.17 / 0.11 / 1.62 | n/a | 0.0 | 55.7 | 23.8 |
| motion | fling | 24 | no | 60 % | 512 | 16 / 31 | 35.6 / 35.6 | 36.0 / 36.0 | 16 | 0.73 / 0.73 / 0.86 / 0.00 | n/a | 0.0 | 24.1 | 110.9 |
| motion | dismiss | 24 | no | 100 % | 491 | 15 / 29 | 32.0 / 32.0 | 31.4 / 31.4 | 16 | 0.11 / 0.17 / 0.12 / 0.60 | n/a | 0.0 | 56.7 | 94.9 |

| Variant | Initial JS gzip | Lazy JS gzip | Initial delta vs baseline | Total delta vs baseline | Gesture code lines |
| --- | ---: | ---: | ---: | ---: | ---: |
| baseline | 69035 B | 0 B | — | — | — |
| current | 69848 B | 0 B | 813 B | 813 B | 67 (+ 52 shared) |
| waapi | 70193 B | 0 B | 1158 B | 1158 B | 145 (+ 52 shared) |
| motion | 102808 B | 21309 B | 33773 B | 55082 B | 72 (+ 52 shared) |

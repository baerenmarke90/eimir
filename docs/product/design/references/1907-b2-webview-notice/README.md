# WebView update notice: visual reference (#1907 B2, #1613)

Rendered on 2026-11-15 from the static page `web/public/webview-unsupported.html` with the shared
`web/public/offline.css`, before Capacitor was wired to it. Baseline: `main` `36bb47864`. Chromium
(Playwright), device scale factor 2. The outdated state uses an Android WebView user agent with
`Chrome/69.0.3497.100`, as on the stock API 28 image. The load-failed state uses a current WebView
user agent.

Baseline on `main`: there is no notice. Below the WebView floor (Chromium 111) the app shows an
empty screen without text or action; only logcat says `System WebView is not supported`.

| File | State | Viewport | Theme | Locale |
| --- | --- | --- | --- | --- |
| `01-outdated-390-light.jpg` | WebView below the floor | 390 px | Light | de |
| `02-outdated-390-dark.jpg` | WebView below the floor | 390 px | Dark | de |
| `03-outdated-360-light-200-text.jpg` | WebView below the floor, 200 % text | 360 px | Light | de |
| `04-outdated-390-light-en.jpg` | WebView below the floor | 390 px | Light | en |
| `05-load-failed-390-light.jpg` | Main-frame load failed on a supported WebView | 390 px | Light | de |
| `06-load-failed-390-dark.jpg` | Main-frame load failed on a supported WebView | 390 px | Dark | de |
| `07-outdated-1280-light.jpg` | WebView below the floor, Expanded | 1280 px | Light | de |

The composition reuses the existing PWA offline system page, with the same mark, brand, heading,
supporting copy and one filled action, so both static system states look alike.

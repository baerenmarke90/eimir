# #2125 Legal texts load on demand

Captured with Playwright Chromium on Windows against the mocked API (Cloud instance status with terms), from a production build of this branch. The capture script was a one-off and is not committed; the behavior is covered by the unit tests named below and by `cloud-onboarding-entry.spec.ts`.

The composition of every screen is unchanged. Only the moment the legal text is fetched changed, which adds the states below.

Views: Compact 360 px Light and 390 px Dark, Expanded 1280 px Light.

| File | What it shows |
| --- | --- |
| `entry-<view>.png` | The signup entry with the terms and privacy links. First paint is unchanged; on mount the links start loading the legal chunk in the background. |
| `sheet-loaded-<view>.png` | The terms reading sheet after the text loaded. With the usual preload the sheet opens with the text in the first frame: across all three views the loading status was present 0 times when the sheet opened after the preload finished. |
| `sheet-loading-held-<view>.png` | The loading state, forced by holding the chunk request. It only appears when someone opens the sheet before the preload has finished, for example on a very slow first connection. It is the shared compact `UiState` loading state. |
| `sheet-retry-<view>.png` (360 Light, 390 Dark) | The offline state, forced by aborting the chunk request. It only appears when the chunk was never fetched and the device is offline. **Erneut versuchen** reloads the page, because browsers keep a failed module import for the page's lifetime; after the reload the sheet shows the text. |
| `page-<view>.png` | The public `/legal/terms` page after the text loaded. Focus moves to the title after an in-app entry and not after Back/Forward or reload (`LegalDocumentPage.test.tsx`). |

Motion: no motion was added. The sheet keeps its existing open and close motion; the states inside it change without animation, also with reduced motion.

Open: no native device was tested. In the Capacitor app the chunk ships inside the APK, so the loading state lasts only for a local file read and the offline state cannot occur.

## Start-up: Wir first, the rest in the background

Product Owner decision (2026-11-20): the app starts, Wir loads, then the app loads the rest, which is then in memory.

- The HTML entry and its module preloads hold only what the first screen needs (measured by `check-entry-size`); no preload tag was added.
- About 1.5 s after the signed-in shell appeared, and then only in idle periods (`requestIdleCallback`, a short timeout where it is missing), the app loads every deferred chunk one at a time: the 37 deferred routes (Settings, product pages, games, maps and others), the map renderer and the legal texts. A failed chunk is skipped and loads on demand later. With the browser's Save-Data preference on, nothing is prefetched.
- A route whose chunk is loaded renders in the same frame (`deferredComponent`), so it shows no loading state.
- `deferred-prefetch.spec.ts`: after sign-in, without any navigation, the Settings and legal chunks are requested; opening More → Settings then shows no `.ui-state-loading` at any moment. A negative control with prefetch disabled (Save-Data) saw the loading state, so the assertion is sensitive.

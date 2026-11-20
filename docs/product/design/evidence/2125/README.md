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

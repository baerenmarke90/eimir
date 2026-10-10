# Capacitor Demo build flags: Android device evidence (PR #1275)

Captured on 2026-10-06 on a Pixel 10 Pro Fold (Android 16) from debug APKs built from
this branch. The test builds used a temporary local application ID suffix
(`.debug.qa`, not committed) so the device's existing install stayed untouched.

| File | Build input | Observed result |
| --- | --- | --- |
| `android-demo-entry-compact.png` | `VITE_EIMIR_API_BASE_URL=https://demo.sbs.ur-cloud.de`, no Demo flags | Demo banner (reset-timer-disabled copy) and the existing Demo persona entry, folded/Compact display |
| `android-demo-today-compact.png` | same | After choosing the Lea persona: backend-issued Demo entry, normal app shell and Today, banner retained |
| `android-demo-today-expanded.png` | same | Same session on the unfolded display (transient `device_state` override, reset afterwards) |
| `android-production-entry-compact.png` | `VITE_EIMIR_API_BASE_URL=https://api.eimir.invalid` plus a stray `VITE_EIMIR_DEMO_URL` | Ordinary sign-in, no Demo banner, no Demo entry, no Web-demo launch link |

Packaging checks on the same branch confirmed that `assembleDebug` and `assembleRelease` of one
synchronized bundle carry identical `VITE_EIMIR_DEMO_*` values.

Not covered here: Dark theme and large text on the device (system settings were not changed on a
personal phone; the Demo surfaces themselves are unchanged by this PR), and whether the public
Demo backend currently has its reset timer enabled. The banner reflects only the build input, so
the Demo bundle's `VITE_EIMIR_DEMO_RESET_*` values must be set to the deployment's actual values.

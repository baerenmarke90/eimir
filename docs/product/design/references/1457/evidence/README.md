# Diary implementation evidence

Runtime source: `f4147d28b123f9ddaea631fc324c440081d8a5f8` (PR #1458). The final harness adds an explicit READY assertion before simulating an expired server upload; runtime code is unchanged by that correction.

| Journey | Compact Light | Expanded Dark |
| --- | --- | --- |
| Write, attach and reorder photos, retain an unfinished label | [390 px](diary-compose-390-light.webp) | [1280 px](diary-compose-1280-dark.webp) |
| Recover, publish once and read the actual saved entry | [390 px](diary-read-390-light.webp) | [1280 px](diary-read-1280-dark.webp) |

The screenshots were reviewed at their actual sizes. They show production React, the existing shell and media components, with repository demo photography and synthetic authored content. The browser fixture mocks authorized APIs but uses real IndexedDB, File cloning and reload. WebP conversion changes the delivery format, not the UI composition.

## Automated validation

- Full Web unit run: **2,121 passed, one existing skip**, 229 passing files, on Node 24 with `TZ=UTC`. The first full run exposed two unrelated timezone-dependent assumptions under the execution host's default zone; both pass under the repository's UTC test convention. The changed layout/token and localized diary-tab assertions also pass.
- Browser regression: **65 distinct focused scenarios accepted across the final runs**. The combined capture/F2/visual batch passed 63 cases; the new disclosure's task-admission wait and the expired-upload fixture's READY precondition were then corrected. The former passes independently, and the entire 16-case capture/diary spec passes, including the latter. Assertions were strengthened rather than relaxed, and no retry or arbitrary delay was added.
- Coverage includes text/photo/title/mixed capture; custom and unfinished labels; default/backdated dates; local file/text recovery; photo ordering without duplicate upload; exact uncertain-create replay; known-created partial binding; server-expired unbound file replacement; Account/instance/Space isolation; writer replacement; logout invalidation; expiry; erasing a draft; confirmed clearing; canonical result and scoped return.
- Existing F2/visual journeys cover 320/360/390/430/1280, Light/Dark, reduced motion, 200% text, short viewport, native picker cancellation, offline failure, pending/duplicate submission, capability checks and accessibility scans.
- Typecheck, production build, formatting, browser inventory and lint passed; lint retains existing repository warnings. GitHub required checks remain a separate merge gate on the final PR head.

No physical Android-device release or live server persistence result is inferred from these mocked-API browser tests. The runtime adds no native capability; the existing Capacitor wrapper delivers the same shared React UI.

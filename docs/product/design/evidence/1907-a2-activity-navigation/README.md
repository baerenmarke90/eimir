# #1907 A2 – Activity navigation evidence

Captured by `web/e2e/tests/activity-navigation-return.spec.ts` (mocked API,
Light theme, animations finished) with `SCREENSHOT_EXPORT_DIR` set.

| File | State |
|---|---|
| `1907-a2-activity-more-active-390.png` | Compact 390 px: Activity opened from More; the More destination (`navigation.more`) stays active in the bottom navigation. |
| `1907-a2-activity-more-active-1280.png` | Expanded 1280 px: same state in the horizontal header. |

The behavioral journeys (scope switch without Back steps, item return, Wir
recent-trace return, direct entry, Places scope) are asserted by the same spec;
screenshots alone do not establish them.

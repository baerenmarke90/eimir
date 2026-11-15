# Wir settings reorder: rapid moves build on the latest order (#1907 B2)

Captured on 2026-11-15 in the Web e2e harness (Chromium, mocked API) from this branch, rebased on
`main` `602ec9e90`. The images were exported by `captureScreenshot` (`SCREENSHOT_EXPORT_DIR`) and
converted to JPEG.

| File | Journey (`web/e2e/tests/wir-design-selection.spec.ts`) | Observed result |
| --- | --- | --- |
| `settings-order-390-light.jpg` | "quote and statistics order survives pointer release, keyboard movement and reload" | Compact Light, after a pointer drag of the quote, a keyboard move of the statistics and a reload. The persisted order keeps both moves; the couple identity stays fixed on top. |
| `settings-aligned-360-light.jpg` | "module visibility controls stay aligned and reflow at 360 light, 430 dark and 1280 dark" | Compact Light at 360 px: aligned visibility controls and 44 px handles, without horizontal overflow. |
| `settings-aligned-430-dark.jpg` | same | Compact Dark at 430 px. |
| `settings-aligned-1280-dark.jpg` | same | Expanded Dark at 1280 px. |

The composition, components, tokens and copy are unchanged by this PR. The visible behavior change
is timing: a keyboard move now shows immediately, through the existing FLIP preview, and the next
press starts from it. Screenshots cannot show that timing. It is covered behaviorally by
`ListEntryActions.reorder.test.tsx`, the #1687 case in `DashboardSettingsPanel.test.tsx` and the
browser journeys listed in the PR.

Not covered here: a physical device (Pixel) check of hardware-keyboard reordering.

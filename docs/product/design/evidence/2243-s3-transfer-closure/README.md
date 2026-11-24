# #2243 S3: close the Transfer Bundle self-service (reference and evidence)

Owning work: tracker [#2243](https://github.com/baerenmarke90/eimir/issues/2243),
[ADR 0020](../../../../decisions/0020-remove-transfer-bundle-self-service.md), slice S3.

## Baseline review (before any UI code)

- Baseline: `origin/main` at `ab1050ef5` (2026-11-24).
- Method: the real `SettingsPage` was mounted in a throwaway Vite harness (not committed) with stubbed API
  answers, at a 390 px wide Compact viewport, German, light theme. The "before" images are that real screen. The
  "mockup" images are the same real screens with the approved copy and the removed controls applied in the DOM.
  They are an HTML mock-up in the sense of AGENTS.md (decision of 2026-11-21), not generated art.
- Reviewed screen and existing functions:
  - Settings overview: the data-and-account group, with the row built from the locale keys
    `profileIdentity.settingsData` (title) and `profileIdentity.settingsDataSummary` (summary line); it
    read "Data and portability / Export and import" before this change.
  - Settings › Data (`/more/settings/data`, hash `#settings-data`): the `StorageSection` card (states roomy,
    almost full, full for Free and Pro, absent without quota) and below it the `TransferPanel` (export scope
    choice, export request, download, import file picker, preview, apply, failure notices, skipped-video notice).
  - Account deletion: consequences step with the button from the locale key `accountSettings.exportBefore` (scrolls to `#settings-data`).
  - Leaving a Space: consequences step with the list line about creating and downloading an export and the same
    button.
  - Notification deep links `TRANSFER_EXPORT` / `TRANSFER_IMPORT` open `/more/settings/data?export=…|import=…`.
- What stays: the whole storage card and all of its states; the route and hash `#settings-data` as technical names;
  all other consequence lines in both dialogs.

## Files

| File | Shows |
| --- | --- |
| `reference/before-1-data-page.webp` | Settings › Data today: storage card plus the Transfer panel |
| `reference/before-2-settings-overview.webp` | Settings overview row today |
| `reference/before-3-delete-account.webp` | Delete account, consequences step, today |
| `reference/before-4-leave-space.webp` | Leave Space, consequences step, today |
| `reference/mockup-1-storage-almost-full.webp` | Target page "Speicher", almost-full state |
| `reference/mockup-1b-storage-unlimited.webp` | Target page, no quota (Self-Hosted) with the calm sentence |
| `reference/mockup-3-delete-account.webp` | Target delete account dialog (no export button, new intro) |
| `reference/mockup-4-leave-space.webp` | Target leave Space dialog (no export button, new line) |

Copy is the Product Owner-approved wording of 2026-11-23 (plan section 12, ADR 0020 item 14). Mock-up only covers
Compact, light. Expanded, dark, reduced motion and the 360/430 px widths are covered by the CI browser evidence of
`storage-section.spec.ts`. Screenshots of the implemented Compact light result are in `implemented/`.

## Observation for review

The category title and the storage card both read "Speicher" once the Transfer panel is gone. The approved copy keeps
both. The card heading is the accessible name of the section, so it is kept; the visual duplication is noted in the
pull request for a Product Owner decision instead of being changed silently.

## Implemented captures (real code, local harness, stubbed API data)

Captured with the real `SettingsPage` mounted in a throwaway Vite harness (not committed), so they show the page
content without the app shell (no tab bar or side navigation). Dark uses the stored theme preference, large text
sets the root font size to 200 percent.

| File | Shows |
| --- | --- |
| `implemented/after-1-storage-almost-full.webp` | Compact 390, light, opened with an old export deep link: no export or import control |
| `implemented/after-1b-storage-unlimited.webp` | Compact 390, light, no quota: the calm sentence |
| `implemented/after-2-settings-overview.webp` | Compact 390, light, overview row of the data category |
| `implemented/after-3-delete-account.webp` | Compact 390, light, delete account consequences, no export button |
| `implemented/after-4-leave-space.webp` | Compact 390, light, leave Space consequences, no export button |
| `implemented/after-5-storage-almost-full-390-dark.webp` | Compact 390, dark |
| `implemented/after-6-storage-almost-full-390-text-200-top.webp`, `...-7-...-bottom.webp` | Compact 390, light, 200 percent text; the measured document width equals the viewport width (no horizontal overflow) |
| `implemented/after-8-storage-almost-full-1280-light.webp`, `...-9-...-1280-dark.webp` | Expanded 1280 |

Not captured: reduced motion (the storage card keeps its existing enter animation and its reduced-motion
handling; no motion code changed), the 360 and 430 px widths, dark or Expanded versions of the roomy, full, Pro and
no-quota states and of the overview row and the two dialogs, and any native device or emulator. The CI browser job
(`storage-section.spec.ts`) asserts overflow at 320/360/390/430 px and axe in light and dark.

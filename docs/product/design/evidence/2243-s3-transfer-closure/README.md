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
  - Settings overview: group "Daten und Konto", row "Daten und Portabilität / Exportieren und importieren".
  - Settings › Data (`/more/settings/data`, hash `#settings-data`): the `StorageSection` card (states roomy,
    almost full, full for Free and Pro, absent without quota) and below it the `TransferPanel` (export scope
    choice, export request, download, import file picker, preview, apply, failure notices, skipped-video notice).
  - Account deletion: consequences step with the button "Vorher Daten exportieren" (scrolls to `#settings-data`).
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
Compact, light. Expanded, dark, reduced motion and the 360/430 px widths are covered by the implemented evidence
that is added later in this folder.

## Observation for review

The category title and the storage card both read "Speicher" once the Transfer panel is gone. The approved copy keeps
both. The card heading is the accessible name of the section, so it is kept; the visual duplication is noted in the
pull request for a Product Owner decision instead of being changed silently.

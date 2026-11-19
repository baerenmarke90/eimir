# #2063 Plan date sheet: visual reference

Generated visual reference for the in-app calendar in the Plan schedule sheet.
The Product Owner chose it on 2026-11-19 instead of the platform date dialog,
after on-device QA of Android test release `0.2.0-test.95`.

- `reference-compact-390-dark.png`: the Compact (390 × 844) reference in the
  Dark theme. It is a static composition rendered with the app's Dark theme
  values and the planned structure, not a screenshot of the running app.

## Baseline reviewed

- `main` at `4065e38be` (the Plan composer in `PlanningCreatePage` and the Plan
  editor in `PlanProductPage`, both using `PlanScheduleFields` in compact mode).
- Existing functions kept in the sheet: "no fixed date yet", start time,
  optional end time or last day, the shared sheet header and Done action.
- The occasions calendar of the planning area (`ImportantDatesPanel`)
  supplies the grid language: Monday first, round day targets, today outlined.

## Composition decisions

- The month grid replaces only the date field. The native date input stays
  hidden as the single value owner, so dirty guards, form reset and draft
  handling keep their existing path.
- Time stays optional and keeps the platform time field. The help text
  explains that a Plan without a time covers the whole day.
- "No fixed date yet" moves below the time, as a quiet text action.
- Expanded/Web keeps the existing native date field, because the compact sheet
  is the phone path.

The reference guides composition and is not a pixel lock. Accessibility, Light
and Dark roles and later Product Owner decisions take precedence.

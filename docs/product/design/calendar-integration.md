# Calendar integration: preflight and delivery contract

Owner: [#1895](https://github.com/baerenmarke90/eimir/issues/1895).
Baseline `main`: `146708719e469f1d86656e632c7c4145ee1bc3c3` (2026-11-15).

The Product Owner requested on 2026-11-15 a provider-neutral calendar
integration: an improved Free calendar handoff (PR A), automatic Pro sync to
one shared target calendar per Space over CalDAV and Google Calendar (PR B).
Shared availability is optional and **not commissioned**; it is recorded in
the issue only.

## PR A – calendar handoff (Free/Core)

### Reviewed baseline

Before the reference and before UI code: the focused Plan composer
(`PlanningCreatePage`, `/plan/plans/new`), the shared schedule sheet
(`PlanScheduleFields`) with date, optional start time, optional end time and
"ends another day", Plan detail editing, Wish→Plan conversion
(`WishProductPage`) and the shared Wish selection (`WishSelectionPage`), the
schedule summary (`planScheduleLabel`), Today agenda rows, discreet
presentation (`calendarPresentation`) and `PlanCalendarAction` with its native
Android bridge (`PlanCalendarPlugin`/`PlanCalendarIntent`) and the browser
`.ics` share/download.

### Generated visual reference

![Compact reference: current schedule sheet, proposed add action, proposed last day](references/calendar-integration/handoff-compact-reference.png)

Left: the unchanged current schedule sheet from the real app (mocked API, 390 px,
Light) with a selected day. Middle: the same sheet with one add action for a
last day below the time hint, shown only while no start time is set. Right:
the disclosed last-day field; the summary reads as a period. This session has
no image-generation model, so the reference was composed from the real running
app plus DOM composition with existing components (the documented fallback of
#1816/#1892). It is composition guidance, not a pixel lock.

### Mobile Interaction Contract

| Concern | Contract |
| --- | --- |
| Outcome | Plan a weekend or a trip without inventing times, and hand it to any calendar app. |
| Relationship value | A shared getaway reads as one experience, not three separate days. |
| Placement / template | Existing schedule sheet in the Plan composer, Plan edit, Wish→Plan conversion and shared Wish selection. No new screen. |
| Primary Compact state | Date → start time (optional) → add action "Mehrere Tage" (only without a time) → "Fertig". |
| Dominant action | "Fertig" stays the single primary action of the sheet; the last day is an optional add action using the shared AddAction presentation. |
| Hierarchy | First day, optional time, optional last day; the trigger summary shows the period. |
| Immediate vs. disclosed | First day immediate; last day behind the add action; disclosure can be removed again (`m5s3.plan.removeLastDay`). |
| Pattern | Existing bottom sheet with native date inputs; no custom picker. |
| Loading / empty | Not applicable inside the sheet; an undated Plan stays valid. |
| Error | A last day before the first day is blocked inline by native `min` and a field error, the sheet stays open and focus moves to the field. |
| Offline | Unchanged composer behaviour: nothing is saved until the server confirms. |
| Success | The saved Plan detail and all overviews show the period; the calendar handoff produces an all-day event over the inclusive days. |
| Privacy | Discreet Plans keep exporting only the list title and the schedule. |
| Large text / narrow | 320 px reflow and 200 % text keep the stacked labelled fields; 44 px targets. |
| Motion | The existing sheet and disclosure motion; reduced motion removes translation. |
| Expanded | Same sheet content inside the bounded composer width. |
| Typing avoidance | Native date picker only; the last day defaults to the first day + 1. |
| Browser-only controls | None added. The browser `.ics` share/download stays hidden in the native app (existing runtime check). |

### Handoff contract

- All-day: `DTSTART;VALUE=DATE:<first>` and exclusive `DTEND;VALUE=DATE:<last+1>`;
  the native bridge receives UTC-midnight start and an end N≥1 whole days later.
- Timed: exact UTC instants; cross-midnight and DST changes are preserved.
- One-time copy: never described as synchronisation; no account needed.

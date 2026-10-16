# M2 Screen State Matrix

**Purpose:** binding UI states before implementation begins  
**As of:** August 24, 2026

## 1. Global state order

Every data-driven M2 view evaluates at least:

```text
initial → loading → content
                 ├→ empty:first-use
                 ├→ empty:filter
                 ├→ partial
                 ├→ offline:cached
                 └→ error {validation | 401 | 404 | 409 | 429 | 5xx}
```

Privacy filtering runs before every visible state. An empty screen therefore must not reveal that private or foreign results exist.

## 2. Shared copy and actions

| State | Primary copy | Primary action | Preserved context |
|---|---|---|---|
| loading | no technical copy required; structural Skeleton | none | route, filters, selection |
| empty:first-use | “Eure Story beginnt hier” | “Erinnerung hinzufügen” | navigation |
| empty:filter | “Keine passenden gemeinsamen Momente” | “Filter zurücksetzen” | search field locally only, never telemetry |
| partial | “Einige Inhalte konnten nicht geladen werden.” | “Erneut versuchen” | already safe content |
| offline:cached | “Offline · Stand von {Zeit}” | optional “Erneut verbinden” | cache + scroll position |
| offline:write | “Noch nicht gespeichert.” | “Erneut versuchen” after reconnection | complete safe draft |
| validation | concrete field/file message | “Fehler korrigieren” implicitly | all input |
| 401 | “Deine Sitzung ist abgelaufen.” | “Erneut anmelden” | allowed return destination only |
| 404 | “Dieser Inhalt ist nicht verfügbar.” | “Zur Story” | no existence/privacy details |
| 409 | “Dieser Inhalt wurde inzwischen geändert.” | “Aktuellen Stand ansehen” | own input separately |
| 429 | “Das waren viele Versuche.” | timed retry | input without automatic spam |
| 5xx | “Das hat gerade nicht geklappt.” | “Erneut versuchen” | safe view/draft |

## 3. Matrix by screen

| Screen | Loading | Empty | Partial/Offline | critical errors | Success |
|---|---|---|---|---|---|
| Story Timeline | month Skeleton, no stale foreign data | first use and filter are distinct | safe cards + status bar | 401, privacy-safe 404, 5xx | stable timeline, focus on heading |
| Story Search | field usable immediately, result Skeletons | no matches without private counts | last authorized result state clearly marked | invalid cursor neutral, 429 | filter count and results consistent |
| Memory Detail | structure for text/media/comments | not applicable | text may load while individual media fails | 404, 409 on edit | author/date/media correct |
| Memory Form | existing edit-state Skeleton | new draft | offline draft without success signal | field errors, 409, upload failure | detail opens; Story updates |
| Media Queue | per-file status | “Foto hinzufügen” remains optional | individual failures do not block everything | type/size/dimension/timeout | `ready` with order |
| HeartMoment Form | do not imply default privacy | visibility remains required | offline save blocked | privacy change 409/offline | correct owner or shared destination |
| Private Moments | owner-bound Skeleton | calm personal Empty State | cache clearly personal and offline | partner sees neutral 404 | owner content only |
| Milestone Form/Detail | standard form/detail Skeleton | new draft | text remains on network failure | validation, 409, 404 | distinct Story type |
| Comments | comment Skeleton after parent | “Noch keine Kommentare” only on allowed target | existing comments remain, retry separately | target 404/private, send failure | new comment exactly once |

## 4. Story Timeline in detail

### Initial and Loading

- App Shell and page title appear immediately.
- Skeleton mirrors the card and month group but contains no random names, images, or date values.
- An already visible safe cache is not replaced with an empty Skeleton; it gets a refresh state.
- Screen reader announces “Story wird geladen” once, not once per Skeleton card.

### Empty: first use

```text
Eure Story beginnt hier
Haltet einen gemeinsamen Moment fest, wenn es für euch passt.
[Erinnerung hinzufügen]
```

No artificial urgency, no blame toward the partner, and no private alternative in the shared Story.

### Empty: search/filter

- Active filters remain visible.
- Search text is not copied into analytics or error reports.
- No copy such as “3 private Treffer ausgeblendet”.
- Reset preserves Story context and resets cursor/scroll correctly.

### Partial

- Failed media shows a placeholder per card.
- Failure of a cursor page does not remove already loaded cards.
- Retry loads only the affected section and does not create duplicates.

## 5. Forms

### Required structure

1. unambiguous page title,
2. domain fields,
3. privacy status or required selection,
4. optional media,
5. one primary Save action,
6. secondary Cancel with a draft warning only when changes exist.

### Validation

- An error appears directly at the field and in a focusable summary when multiple errors exist.
- The first invalid area receives focus after submit.
- Value, selection, media order, and local draft remain intact.
- No error message names internal field, table, or storage names.

### Saving

- The action is protected against double submission.
- Status “Wird gespeichert …” is announced politely; focus remains stable.
- A timeout is not success. The UI checks idempotency/status before creating again.
- Leaving during an active upload follows the media decision; there is no silent background promise.

## 6. Media states

| Error class | User copy | Next action | Telemetry |
|---|---|---|---|
| type not allowed | “Dieses Dateiformat wird nicht unterstützt.” | choose another file | `unsupported_type` |
| too large | “Diese Datei ist zu groß.” | choose another file | `size_limit` |
| dimension/processing | “Dieses Bild konnte nicht verarbeitet werden.” | retry or remove | `processing_failed` |
| network | “Upload unterbrochen.” | retry | `network` |
| authorization | neutral parent/session state | sign in/back | no file information |
| storage/server | “Upload gerade nicht möglich.” | retry later | `service_unavailable` |

Filename, MIME details, pixel dimensions, and Read URLs do not belong in standard telemetry. Technical details may appear only in sanitized diagnostics.

## 7. HeartMoment privacy states

| State | Visible elements | Forbidden elements |
|---|---|---|
| selection open | both options equally understandable | preselected privacy without a product decision |
| PRIVATE saved | “Nur für mich”, owner context | comments, partner activity, Story link |
| SHARED saved | “Mit Partner geteilt”, Story/comment access | ambiguous lock without text |
| PRIVATE → SHARED | confirmation of the new visibility | silent switch |
| SHARED → PRIVATE | notice about future invisibility and the limit of withdrawal | promise to erase what was already read |
| partner deep link to PRIVATE | neutral 404 state | “privat”, author name, date, attachment |

## 8. Accessibility acceptance per state

- Name, role, value, and status are programmatically identifiable.
- Status changes are announced once and politely.
- Focus remains stable during Loading/Refresh and does not jump to the top of the page.
- Error summary and field errors are linked.
- Privacy selection is operable as a group with two complete labels.
- Media tiles include file type, status, and action in the accessible name.
- Reordering is possible without drag.
- 200% Web zoom and the largest supported Android font size do not clip required copy.
- Color is always supplemented by text, icon, or shape.
- Reduced motion does not remove status information.

## 9. Visual test data sets

Test every screen with:

- 0, 1, 2, and 20 Story items,
- very short and very long title/text,
- date with a long German month name,
- 0, 1, and multiple media items in mixed states,
- long display names and missing avatar,
- no comments, one comment, and a longer list,
- PRIVATE canary that must not appear in any shared view.

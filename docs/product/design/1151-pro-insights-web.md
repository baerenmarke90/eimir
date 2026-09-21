# #1151 Pro Vibe/Energy insights — Web implementation notes

**Status:** implementation record for the Web slice of [#1151](https://github.com/baerenmarke90/eimir/issues/1151). It is not a new design authority.<br/>
**Authority:** the approved references in [`references/1151/`](references/1151/), [Product Reference v1](product-reference-v1.md) and the current Today (Wir) surface. `daily.quote` is intentionally not part of this slice: its Today and preference references do not exist yet.

## Contract used

| Concern | Source |
| --- | --- |
| Pro boundary | `daily.insights`, read from `GET /spaces/{spaceId}/entitlements` (`capabilities`) and enforced again by `GET /spaces/{spaceId}/daily-check-in/insights` (403 `PREMIUM_ENTITLEMENT_REQUIRED`). No local Pro flag. |
| Data | `getDailyCheckInInsights(startDate, endDate)` only: own values plus a per-day partner projection, 90-day server cap. |
| Modules | `vibeEnabled` / `energyEnabled` on the insights response. Space configuration (#432) stays a separate authority; Pro never re-enables a module. |

## Routes

`/more/insights` (week), `/more/insights/patterns` (month) and `/more/insights/recap` (weekly recap) live under **More**, which keeps *Mehr* active as the references require for Screens A and B. Screen C's reference shows *Geschichte* as active; the recap keeps *Mehr* because the three views are one Pro context that must not change the active destination while people move between them. The Today entry is a single quiet link after the Vibe card.

## Privacy and Mutual Reveal

The insights endpoint distinguishes `HIDDEN_UNTIL_SELF_CHECK_IN` from `NO_CHECK_IN` per day, while the Today read deliberately does not. Rendering that difference would tell a caller whether the partner checked in on a day the Mutual Reveal rule keeps closed. The client therefore:

- keeps a partner value only when the state is `VISIBLE` and collapses every other state into one absent value (`kein Wert sichtbar`);
- never writes copy such as "did not check in", never counts hidden days and never derives a statement from a value the server did not project;
- derives every statement from visible values only, behind minimum sample thresholds, so sparse or hidden data yields no statement instead of a weak one.

## Deviations from the reference images (data reality, not styling)

| Reference | Implemented | Reason |
| --- | --- | --- |
| Vibe chart on a five-level ordinal axis (*Sehr gut … Schlecht*) | Six labelled lanes, one per real Vibe state, with glyph + marker shape and no connecting line | Vibe is categorical (`GOOD`, `OKAY`, `STRESSED`, `SAD`, `NEEDS_CONNECTION`, `NEEDS_SPACE`). An ordinal axis would rank *Nähe wäre schön* and *Etwas Ruhe* against the others, which is a judgment the product must not make. |
| Scatter with trend line and *r = 0,62* | Strip chart: Energy of the person-days per Vibe state, plus a sentence only when the data supports it | A correlation coefficient between a categorical Vibe and Energy is not valid, and the issue makes *r* optional. |
| Theme chips *Zeit zu zweit / Weniger Stress / Früher Feierabend* | Weekday chips for days on which both people repeatedly had a good day | The contract carries no theme data; inventing themes would fabricate insights. |
| *Eure besten Tage lagen nach gemeinsamen Plänen* | Not shown | Requires Planning data that is not part of the insights contract. |
| *Leas Energie zog Philipps Vibe … mit nach oben* | *Wenn {Name} viel Energie hatte, ging es dir oft auch gut.* | Same-day co-occurrence share instead of a lagged, causal-sounding claim. |
| Narrative hero *… wenn der Alltag ruhiger wurde* | One sentence chosen from a fixed set of data-backed rules | The hero must be derivable from the data. |
| 4-week matrix with two rows | Calendar-month matrix, Monday-first weeks, Vibe and Energy marks for both people per day | Both partners and the month picker need one cell per day; a tap or keyboard press reveals the exact values as text. |

## Accessibility and motion

- Every value is available as text: each day is a button whose label carries both people's values, and the selected day is shown as a sentence below the chart.
- Person identity is avatar + first name + marker shape (circle / diamond); color is never the only carrier of meaning.
- Charts are built from HTML and non-scaling SVG strokes, so labels scale with text size and reflow instead of shrinking with the viewBox.
- Line drawing and card fades run only under `prefers-reduced-motion: no-preference`.

## Downgrade

Without `daily.insights` the page renders one calm state: the daily Vibe/Energy ritual stays free, everything already shared is kept, and no new analysis is run. Nothing is deleted, hidden or claimed to be lost. The web slice stores no recap artifacts, so the *frozen artifact* read rule in the Freemium matrix has nothing to render here yet.

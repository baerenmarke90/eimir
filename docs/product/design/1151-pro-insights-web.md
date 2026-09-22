# #1151 Pro Vibe/Energy insights — Web implementation notes

**Status:** implementation record for the Web slice of [#1151](https://github.com/baerenmarke90/eimir/issues/1151). It is not a new design authority.<br/>
**Authority:** the approved references in [`references/1151/`](references/1151/), [Product Reference v1](product-reference-v1.md) and the current Today/More information architecture. Historical #1151 screenshots remain delivery evidence, not current placement authority.<br/>
**Placement update:** [#1196](https://github.com/baerenmarke90/eimir/issues/1196) supersedes the historical Today entry. Weekly insights are discovered only from **More**.

## Contract used

| Concern | Source |
| --- | --- |
| Pro boundary | `daily.insights`, read from `GET /spaces/{spaceId}/entitlements` (`capabilities`) and enforced again by `GET /spaces/{spaceId}/daily-check-in/insights` (403 `PREMIUM_ENTITLEMENT_REQUIRED`). No local Pro flag. |
| Data | `getDailyCheckInInsights(startDate, endDate)` only: own values plus a per-day partner projection, 90-day server cap. |
| Modules | `vibeEnabled` / `energyEnabled` on the insights response. Space configuration (#432) stays a separate authority; Pro never re-enables a module. |

## Routes

`/more/insights` (week), `/more/insights/patterns` (month) and `/more/insights/recap` (weekly recap) live under **More**, which keeps *Mehr* active across the complete Pro context. Since #1196, **Eure Woche** is the first destination in the shared **Gemeinsam** group on `/more`, using the standard destination-row contract with title, quiet Pro badge and chevron. There is no Today/Wir teaser and no descriptive subtitle in the More row.

## Privacy and Mutual Reveal

The insights endpoint distinguishes `HIDDEN_UNTIL_SELF_CHECK_IN` from `NO_CHECK_IN` per day, while the Today read deliberately does not. Rendering that difference would tell a caller whether the partner checked in on a day the Mutual Reveal rule keeps closed. The client therefore:

- keeps a partner value only when the state is `VISIBLE` and collapses every other state into one absent value (the `dailyInsights.noValue` copy key: "no value visible");
- never writes copy that says the partner "did not check in", never counts hidden days and never derives a statement from a value the server did not project;
- derives every statement from visible values only, behind minimum sample thresholds, so sparse or hidden data yields no statement instead of a weak one.

## Deviations from the reference images (data reality, not styling)

| Reference | Implemented | Reason |
| --- | --- | --- |
| Vibe chart on a five-level ordinal axis (very good … bad) | Six labelled lanes, one per real Vibe state, with glyph + marker shape and no connecting line | Vibe is categorical (`GOOD`, `OKAY`, `STRESSED`, `SAD`, `NEEDS_CONNECTION`, `NEEDS_SPACE`). An ordinal axis would rank "would like closeness" and "needs quiet" against the others, which is a judgment the product must not make. |
| Scatter with trend line and a correlation coefficient | Strip chart: Energy of the person-days per Vibe state, plus a sentence only when the data supports it | A correlation coefficient between a categorical Vibe and Energy is not valid, and the issue makes it optional. |
| Theme chips (time together, less stress, early finish) | Weekday chips for days on which both people repeatedly had a good day | The contract carries no theme data; inventing themes would fabricate insights. |
| Pattern about best days after shared plans | Not shown | Requires Planning data that is not part of the insights contract. |
| Pattern stating that one partner's Energy pulled the other's Vibe up | "When {name} had a lot of energy, you often felt good too" as a same-day co-occurrence share | A descriptive co-occurrence instead of a lagged, causal-sounding claim. |
| Narrative hero about calmer everyday life | One sentence chosen from a fixed set of data-backed rules | The hero must be derivable from the data. |
| 4-week matrix with two rows | Calendar-month matrix, Monday-first weeks, Vibe and Energy marks for both people per day | Both partners and the month picker need one cell per day; a tap or keyboard press reveals the exact values as text. |
| Weekly recap with *Story* active in the navigation | Recap keeps *More* active | The three views are one Pro context that must not change the active destination while people move between them. |

## Accessibility and motion

- Every value is available as text: each day is a button whose label carries both people's values, and the selected day is shown as a sentence below the chart.
- Person identity is avatar + first name + marker shape (circle / diamond); color is never the only carrier of meaning.
- Charts are built from HTML and non-scaling SVG strokes, so labels scale with text size and reflow instead of shrinking with the viewBox.
- Line drawing and card fades run only under `prefers-reduced-motion: no-preference`.

## Downgrade

Without `daily.insights` the page renders one calm state: the daily Vibe/Energy ritual stays free, everything already shared is kept, and no new analysis is run. Nothing is deleted, hidden or claimed to be lost. The web slice stores no recap artifacts, so the *frozen artifact* read rule in the Freemium matrix has nothing to render here yet.

## Visual evidence

The stored [`evidence/1151/`](evidence/1151/) set documents the original #1151 delivery and therefore still contains the historical Today entry. Current placement evidence is generated by `web/e2e/tests/today-pro-insights.spec.ts`: it asserts that Today has no weekly-insights entry, captures the **More** destination, and then covers week, patterns, recap and the gated Free state with axe and horizontal-overflow checks at Compact 390 px Light, 320 px Dark with 200 % text and Reduced Motion, and Expanded 1280 px Light.

# Reading views design preflight

Baseline: `78a9000bda5a97e177f7bfc134970b97e27d590b`. Related decisions: #1151, #1744, #1960 and #1973. The Product Owner approved the generated prototype after a Compact review of the public demo.

| Surface and existing behavior reviewed | Compact interaction contract |
| --- | --- |
| More / Insights. Vibe and Energy charts, day drill-down, calendar and longitudinal patterns, weekly review and optional AI. | Two tabs, Week and Month. Plot and read one selected day through a shared legend and day axis. Display week highlights from visible check-ins directly in Week. Use labelled date controls. Preserve Month charts, the optional AI feature and historical access. |
| Moments / Chapters. Chapter and original detail routes, authorized links, link picker, unlink and diary's Album and List setting. | The primary reading surface is the same StoryList card as in the diary, in the chapter's reading order. The card opens the original and returns to the chapter. Keep management contextual and keep the existing shared Momente-Design choice. |
| Moments / Recaps. Current monthly cover, monthly/yearly archive, pending status, retained editions, reader and original links. | Put readable editions first in a date-first archive and distinguish pending/empty editions. Preserve the current cover and show an understandable last stand when generation is unavailable. App pages keep tap, swipe and hold gestures. Use visible localized text for navigation rather than arrow graphics. |

Use Product Reference v1's Compact-first, content-first and context-return principles and the Detail View and System States templates. Reuse the existing charts and highlight derivation, native date inputs, StoryList and useDiaryLayout, recap query/media and task navigation. Keep the app shell and expanded reading widths. Support loading, empty, limited/missing data, offline, error, and success with existing visible states. Screen interactions retain their existing reduced-motion and focus contracts. Avoid extra typing and animation, and preserve relationship/Space authorization and privacy. Render descriptive highlights only from already visible data. Existing Pro Insights, recap retention and free Chapter grouping entitlements apply in both distribution models. No new dependency, provider, storage or API is needed.

## Generated reference compositions
- [insights-week at 390 CSS pixels](reference-insights-week-390.jpg)
- [chapter-album at 390 CSS pixels](reference-chapter-album-390.jpg)
- [chapter-list at 390 CSS pixels](reference-chapter-list-390.jpg)
- [recap-library at 390 CSS pixels](reference-recap-library-390.jpg)

The references depict the agreed presentation change with fictional/sample content. Product verification covers the real implementation on Compact and Expanded, Light and Dark, reflow, the native reader's gesture and Web keyboard paths, chapter assignment and original round-trip, Insights date/period continuity, and archive access after Pro expires.

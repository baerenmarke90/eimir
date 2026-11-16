# Reading views design preflight

Baseline: `78a9000bda5a97e177f7bfc134970b97e27d590b`. Related decisions: #1151, #1744, #1960 and #1973. The Product Owner approved the generated prototype after a Compact review of the public demo.

## Compact interaction contract

- Insights retains the current charts, historical periods, calendar and optional AI review. Week and Month are the two tabs. The Vibe and Energy plots share a legend and day selection. Highlights based on visible daily entries appear in Week.
- Chapter detail uses the same StoryList entry cards and Album/List preference as the diary. The entry opens its original. Returning restores the chapter. The picker and unlink remain available alongside the reading experience.
- Recaps retains the current-month cover, month/year filters and the reader. Published editions and editions in preparation have distinct status treatments. The app reader continues to accept taps, swipes and holds. Relevant navigation uses text labels.

Use Product Reference v1's Compact-first, content-first and context-return principles and the Detail View and System States templates. Reuse the existing charts and highlight derivation, native date inputs, StoryList and useDiaryLayout, recap query/media and task navigation. The app shell and expanded reading widths support the same actions. Loading, missing data, offline, and error states are handled in the existing product flows. Screen interactions respect reduced motion and restore focus where appropriate. The presentation uses the existing Space authorization and visible-data boundaries. Current Pro Insights, recap retention and free Chapter grouping entitlements apply to both distribution models. The features use the existing provider and API contracts.

## Generated reference compositions

- [Insights Week at 390 CSS pixels](reference-insights-week-390.jpg)
- [Chapter Album at 390 CSS pixels](reference-chapter-album-390.jpg)
- [Chapter List at 390 CSS pixels](reference-chapter-list-390.jpg)
- [Recap library at 390 CSS pixels](reference-recap-library-390.jpg)

The references depict the agreed presentation with sample content. Verification covers Compact and Expanded, Light and Dark, reflow, native reader gestures, Web keyboard navigation, chapter assignment and return, the Insights period change, and recap reading after Pro expires.

## Implementation evidence

- [Week in Compact Light](insights-week-390-light.jpg) and [Week in Expanded Web](insights-week-1280-light.jpg).
- [Chapter cards in Compact Light](story-chapter-430-light-detail.jpg) and [Chapter cards in Expanded Dark](story-chapter-1280-dark-detail.jpg).
- [Recap library in Compact Light](recaps-library-390-light.jpg) and [Recap library in Expanded Dark](recaps-library-1280-dark.jpg).

These captures use the existing Playwright fixtures. The application tests cover the shared layout setting, chapter assignment and original return, both Insights tabs and their date state, and retained recaps and native reader gestures.

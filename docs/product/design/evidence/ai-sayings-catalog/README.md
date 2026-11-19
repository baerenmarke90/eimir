# AI-generated sayings catalog: category sheet evidence

`category-sheet-390-light.png` is the Compact (390 px, light, warm theme) category
sheet of the daily saying, captured by the `personal Daily Quote preferences stay
caller-only and round-trip If-Match` journey in
`web/e2e/tests/today-daily-quote.spec.ts`. It shows all ten categories of the new
catalog with the German labels and two selected categories.

The journey opens the sheet, selects a category, saves through `Fertig` and checks
the `If-Match` PATCH body. The full spec (18 tests) passed locally against
`feat/ai-sayings-catalog`.

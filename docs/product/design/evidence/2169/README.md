# Evidence for #2169 — weekly brief (Wochenbrief)

Captured by `web/e2e/tests/today-pro-insights.spec.ts` with mocked API data
(revision of the containing commit, Chromium, local run). Full-page captures
show the Compact navigation bar over the scrolled content; that is an
artifact of full-page screenshots, not of the layout.

| File | State |
| --- | --- |
| `brief-390-light.webp` | Compact 390 px, Light: follow-up, headline, moment, day strip, attention, impulse, new pattern |
| `brief-320-dark-200pct-reduced-motion.webp` | 320 px, Dark, 200 % text, reduced motion; tabs wrap as whole words |
| `brief-1280-light.webp` | Expanded 1280 px, Light: same bounded reading column |
| `week-tab-390-light.webp` | Former week view, now the **Woche** tab |
| `gated-390-light.webp` | Free Space: unchanged calm gate, no insights request |

Behavior covered by the same spec: open from More, axe without violations,
no horizontal overflow, basis disclosure, cycling to the next idea, the plan
action opening the Wish → Plan conversion, Back returning to the brief, and no
model call.

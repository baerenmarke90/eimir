# Implementation prompt: Wir monthly mosaic and story summary

Copy everything below the line into the implementing agent (ChatGPT/Codex).

---

You are implementing an approved Product Owner design in `baerenmarke90/eimir`.
Implement it **exactly as shown** in
`docs/product/design/references/today-month-story/`. Deviate only where a rule
below says so and record every deviation in the PR.

## 0. Before writing code

1. Read `AGENTS.md` and every mandatory source it lists for user-facing Web work.
2. Read `docs/product/design/references/today-month-story/README.md` and look at
   `generated-wir-context-reference.png` (frames 1–3) and
   `generated-month-story-states-reference.png` (frames 4–8).
3. Start from current `main` and inspect the owners named in the README
   (`TodayPage` with `TodayMonthlyStrip`, `client/todayComposition.ts`,
   `SharedStorySummary`, `MemoryPreview`, the `m5s5.dashboard.*` and
   `today.monthly.*` copy, `design/tokens.json`).

## 1. Scope

In scope: presentation of the Wir monthly photo module and the story summary.

Out of scope: the cover/feeling/recent-activity modules, module ordering and
visibility settings, photo selection logic, eligibility rules, API, backend.

## 2. Monthly photo mosaic (frames 1, 4, 5, 6)

- Title "Euer {{month}}" (localized long month name via `Intl`), header action
  "Alle Momente" with the existing destination.
- Replace the swipe strip with the mosaic described in the README: 1, 2 and 3
  photo layouts with the stated heights, column ratio, 6 px gaps and
  `radius.sheet` outer corners. No horizontal scrolling.
- Title on the photo bottom-left over a bottom gradient; date only in the
  accessible name. Each tile links to its memory.
- Sensitive previews remain concealed via `MemoryPreview`.
- Keep `today-monthly-notes` text highlights below the mosaic unchanged.
- Hover/press image scale with existing motion tokens; none for reduced motion.

## 3. Story summary (frames 2, 3, 7, 8)

- Title "Eure Geschichte"; one soft card, no tiles.
- Lead line: total of rendered categories (accent, display role) +
  "Erinnerungen in {{period}}" from the existing relationship duration, with
  German dative singular/plural; fallback "{{count}} gemeinsame Erinnerungen".
- Proportional segmented pill bar (`aria-hidden`, minimum segment width).
- One row per rendered category: dot, bold count, label, chevron, existing
  timeline link and plural accessible name, 44 px+ target.
- Keep `sharedStorySummaryIsEligible` and the settings preview behavior.
- Add semantic category color tokens (Light/Dark) instead of literals.

## 4. Verification and evidence

- Unit tests: mosaic layout per photo count, sensitive concealment, story line
  with each period unit and the no-duration fallback, only non-zero categories,
  eligibility unchanged.
- Browser: extend the owning Today journeys (`--workers=1` locally) for 1, 2 and
  3 photos and the story summary; Axe Light/Dark.
- Evidence at 360/390/430 px Light/Dark, 320 px with 200 % text and reduced
  motion, one Expanded width, placed next to the matching reference frames.
- Run lint, type-check, the touched unit tests and
  `tools/ci/engineering_language_audit.py` before pushing.

## 5. Pull request

Use the PR template: reuse review, business/freemium result ("No
business/freemium impact" with rationale), Product Design / UX checklist,
cross-cutting notes. Reference the owning issue and this folder. English for all
code, comments, tests, commits and PR text. Do not change this reference folder.

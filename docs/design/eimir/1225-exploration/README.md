**Reference status: HISTORICAL / exploration evidence.** This folder captures Phase A design-exploration artifacts for [#1225](https://github.com/baerenmarke90/eimir/issues/1225). Nothing here is a design decision. Per the issue's explicit gate, no direction is selected and no repo-wide branding implementation has started. [Product Reference v1](../../../product/design/product-reference-v1.md) and [`docs/eimir-brand-guidelines.md`](../../../eimir-brand-guidelines.md) remain the current normative design/brand authority until an explicit Product Owner decision inside #1225 supersedes them.

# Visual identity exploration — #1225 Phase A

Three candidate directions, each grown from a reference image the Product Owner posted in [issue comment #5784651622](https://github.com/baerenmarke90/eimir/issues/1225#issuecomment-5784651622), not invented independently of it. Each candidate is a real Chromium render (`chrome --headless=new --screenshot`) of a hand-composed static HTML mockup — not a live-app screenshot. The "Wir" home content (couple presence, "Ich denke an dich", an upcoming item, a featured shared memory, partner activity, the four-destination nav) is reproduced from the real `AppShell`/`TodayPage`/`PartnerQuickActions` copy and structure in `web/src/components` and `web/src/i18n/locales`, with a placeholder partner name ("Alex").

All three candidates apply the same three color worlds, sampled directly from the reference board's own pixels (see each PNG's own notes for the exact sampling): **Original** (`#7C5FE0 → #7FABF6`, cool/calm), **Natürlich** (`#4FAE9E → #3D95D0`, fresh/vivid) and **Warm** (`#F2A46E → #F6C98C`, soft/timeless).

## Candidates

| File | Mark | Icon language | Concept |
| :--- | :--- | :--- | :--- |
| [`candidate-a-verwoben.png`](./candidate-a-verwoben.png) | Two overlapping circles, no letterform | Outline | Closest to the mark already shipped today; lowest migration risk. |
| [`candidate-b-wachstum.png`](./candidate-b-wachstum.png) | Two leaves meeting at a growth point | Duotone | Builds on the plant/growth reference from the issue thread; furthest from the shipped mark. |
| [`candidate-c-monogramm.png`](./candidate-c-monogramm.png) | Two overlapping circles with a legible lowercase "e" | Filled | Matches the "e" icon idea from the reference board; most distinctive at a glance. |

Each PNG shows, top to bottom: Light/Dark/Monochrome app icon and wordmark; small-size legibility samples (16/32/48px, home-screen grid); core navigation icons (Wir, Momente, Planen, Neu/Hinzufügen, Mehr) plus relationship/action icons (Ich denke an dich, Gemeinsam/Geteilt, Wünsche, Privat, Benachrichtigungen); Default/Active/Pressed/Disabled states for the "Ich denke an dich" action; the **Listen** icon shown in its real in-app context (a row inside *Mehr › Gemeinsam*, not a bottom-nav tab — the shipped IA keeps four labeled destinations: Wir, Momente, Planen, Mehr); the three color worlds; and two full "Wir" home mockups (Light + Dark) with identical representative content across all three candidates so their visual differences, not their copy, can be judged.

The `.html` source for each candidate is included alongside its PNG for provenance and so a reviewer can re-render or tweak a candidate without reverse-engineering the image.

## Indicative contrast notes

Each candidate's own PNG states its approximate WCAG contrast figures (computed by hand, not a formal audit). Candidate B's Natürlich accent in particular reads under AA for normal text on white at its blue end (~3.3:1) and should not carry small body copy as-is. Formal WCAG sign-off belongs to Phase C of #1225, not this exploration.

## Open reconciliation items

- `docs/eimir-brand-guidelines.md` currently documents the interlocking-rings mark as binding; Candidates B and C would need that document (and Product Reference v1's D1) formally superseded by an explicit PO decision at #1225's decision point.
- `docs/FREEMIUM-FEATURE-MATRIX.md` already classifies user-selectable "Bespoke Themes, Covers & UI Personalization" as Premium. Whether the three color worlds become user-selectable or stay system-controlled is an open question in #1225 itself; staying system-controlled avoids a freemium conflict.

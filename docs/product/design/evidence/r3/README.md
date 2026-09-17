# R3 Planen evidence

This directory contains exact-build Web evidence for #968. The captures are produced by the real authenticated application routes with deterministic API fixtures; they are not standalone mockups. The behavioral assertions that produce them cover navigation, mutation ordering, dirty-state protection, canonical result ownership, focus, reflow, reduced motion, and accessibility alongside the visual states.

The submitted source revision is recorded in `r3-web-source-commit.txt`, and `SHA256SUMS` makes the captured artifact set independently verifiable. Regenerate the evidence from that revision with:

```text
cd web/e2e
npx playwright test tests/planning-focused-create.spec.ts tests/planning-upcoming.spec.ts tests/planning-reference.spec.ts tests/planning-completion-story-continuation.spec.ts tests/planning-wish-completion-continuation.spec.ts --project=chromium --workers=2
```

## Coverage map

- `r3-overview-*`: empty and dense Plans, focal upcoming intention, later agenda, undated Plans, receded history, 360/390/430 Compact, representative Expanded, Light/Dark, and reduced motion.
- `r3-wishes-390-light.png`: Wishes as a separate peer mode without schedule/status pressure.
- `r3-create-plan-*`: focused Plan creation at 320/390/Expanded and 200% layout zoom; the paired browser journey verifies an undated Plan, optional enrichment, save failure, dirty exit, Quick Create, and origin return.
- `r3-plan-detail-range-*`: read-first detail with same-day and cross-day range presentation at 320/390/1280 in Light/Dark.
- `r3-plan-completion-*`: authoritative completion followed by optional canonical Memory/Milestone continuations and the quiet Later route.
- `r3-wish-completion-*`: direct Wish completion and optional canonical Memory continuation, including Compact, Expanded, Light, and Dark.

Additional browser assertions outside the screenshot-producing cases cover existing-place and inline-place creation, Wish-to-Plan behavior, Plan scheduling after creation, refresh/error handling, tab keyboard behavior, Browser Back, no-autofocus task entry, axe checks, and Today cache freshness.

Android runtime adaptation is intentionally not represented here. Per #837, this delivery establishes the Web product reference first; no native R3 parity claim is made.

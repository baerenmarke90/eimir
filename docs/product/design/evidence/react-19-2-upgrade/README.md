# Web dependency compatibility evidence

Runtime source: `013ed04f`, combined PR #133, retaining the original commits of #136, #156, #135 and #1314.

Locked runtime: React/React DOM 19.2.8, React types 19.2.18/DOM types 19.2.5, React Query 5.102.2, Vite 8.2.2 and Vitest 5.0.4. A clean locked installation without force or legacy peer overrides passes all 1,466 Web unit/component tests (one existing skip) and the production build. The existing Planning input-target guard preserves title-versus-enrichment dirty ownership. The existing focus matcher declaration follows Vitest 5's return/received generic parameters. No runtime assertion, timeout, type-check gate or feature was weakened.

Fifteen existing Planning/inline-Place browser journeys pass against the production preview with one worker and zero retries. The four PNG files come directly from that successful run: create enrichment, Expanded cross-day detail and 390px Light/Dark Plan detail. The temporary capture configuration was removed; no test/runtime configuration changed. The existing R3 baseline files written by the test helper were restored; this separate evidence records the dependency compatibility run.

Product Reference v1 R3 and the existing [Planning contract](../../r3-planen.md) remain authoritative. No composition, copy, motion, primary action, privacy or data contract changed, so no new feature visual preflight is required. Browser cases retain validation, failed read/retry, keyboard tabs, draft preservation, no-place semantics, 320px reflow, Expanded and Light/Dark Axe checks. The captures were visually inspected for the existing hierarchy, readability and layout.

These are actual browser captures, not generated references or native-device acceptance. Final aggregate #946 acceptance remains separate.

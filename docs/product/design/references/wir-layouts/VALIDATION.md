# Personal Wir designs — production consumer acceptance

The approved preflight and baseline are in [README](README.md). This delivery uses the same Today tree for all three designs; Classic retains the existing composition. The source fingerprints in [runtime-source-hashes.json](runtime-source-hashes.json) bind these captures to the runtime files. Images contain only synthetic HTTP fixture identities/content, including a deliberately sensitive synthetic photo behind the real blur. They are real Chromium renders, not generated product references.

## Browser coverage

Eight Chromium journeys pass across 320/360/390/430/1280, Light/Dark and 390 at persistent 200% root text. Each design completes selection (where applicable), explicit confirmed save, return to Wir, energy overlay keyboard dismissal and reload. Each rendered Today passes axe and document reflow. Native radio focus/Space, a Free user retaining Classic after Pro expiry and resetting to Warm, preview/cancel, failed writes and deliberate retry are covered. The complete multi-design journey has 90 seconds for three cycles/axe passes; each functional assertion stays intact.

The 200% capture exposed a pre-existing shared-history nowrap overflow. Labels now wrap and the same badges reflow instead of clipping or hiding information. Selector labels move under the radio/preview when enlarged text needs space; the focused selected radio remains reachable with a sticky Save footer. A focused large-text rerun passes after this layout correction. The existing shell remains visible in the full-page capture at the captured viewport scroll position.

| Capture | Review purpose |
|---|---|
| [Warm Compact Light](evidence/wir-warm-360-light.png) | Free default identity, vertical Vibe group and authored-content hierarchy |
| [Modern Compact Dark](evidence/wir-modern-390-dark.png) | Wrapping horizontal identity, paired Vibes and blue accents |
| [Classic Compact Dark](evidence/wir-classic-390-dark.png) | Existing centered identity and component composition |
| [Modern Expanded Dark](evidence/wir-modern-1280-dark.png) | Same bounded content and task semantics |
| [Selector Compact Dark](evidence/selector-modern-390-dark.png) | Named radio previews and explicit Save |
| [Selector 200% text](evidence/selector-modern-390-dark-large.png) | Labels retain reading width and sheet body scrolls above its footer |
| [Modern 200% text](evidence/wir-modern-390-dark-large.png) | Identity/content wrapping, countdown and history reflow |

## Other checks

Full Web suite: 2,218 passed, two existing skips. Full Backend unit suite: 1,014 passed. Seven new real settings/provider regressions cover confirmed deduplicated Save, preview/cancel, retention/reset, offline, failed retry, read failure, stale conflict recovery and a late result after query removal. Existing app-icon provider coverage also passes. TypeScript, production build, full Ruff/format, targeted strict mypy, Web format/lint, tokens/PWA and changed engineering-language checks pass.

Real PostgreSQL tests are committed for the hosted gate: both owners, capability/membership, invalid/stale tokens, downgrade/reset, personal export/cleanup, concurrent initial writes and icon/design shared-version protection. No local PostgreSQL pass, physical Android acceptance or live Cloud deployment is claimed. Exact-head hosted gates remain required before merge.

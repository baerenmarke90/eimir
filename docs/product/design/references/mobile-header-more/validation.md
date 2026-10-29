# Mobile header / More validation

Runtime source: `0d2e147b73c3eefd434a861c92821c09bd946d43`, based on main `f35f82dbab2465fe337850a1e8db147f4eb3942a`. [Source hashes](source-sha256.json) identify the runtime and browser-case files. Generated composition and exact prompt were published in #1507 before UI implementation.

## Completed checks

- Full Web test command: **2,259 passed, 2 existing skips**, 246 passing files and 2 skipped files. Token/PWA checks pass.
- Production build: passed, including TypeScript. Existing dependency module-directive and bundle-size warnings remain.
- Final source's dedicated browser suite: **5 passed** without retries. It covers More discovery and search, authoritative unread count, failed then successful mark-all, Light/Dark/Expanded, 320px at 200% text, reduced motion, safe-area consumption, Story return, authorized administration, real sign-out and reload.
- Separate introduction and partner-account replacement browser cases: **2 passed** without retries.
- Related run: 15 individual passes covering the changed root navigation/heading/surface contracts, pending sign-out ownership, private create/save followed by real sign-out at 390/1280px, and shell accessibility in Light/Dark. That runner ended with SIGTERM before its final quote case; the remaining quote case is included in the completed two-case run above. This is not a claim that the complete browser regression ran.
- Browser inventory and whitespace checks pass. Component coverage also verifies current-user fallback, conditional administrator access, shared unread projection and safe logout callback.

Early failures identified duplicate responsive Back controls and stale header/sign-out test expectations. Back now renders once inside the detail page at every width; the complete final Web run passes. Multi-route shell tests navigate through actual primary links rather than repeatedly rebuilding the document. Final dedicated browser checks were run after the last runtime source commit.

## Visual evidence

- [390px Light, unread](evidence/more-390-light-unread.png), [read](evidence/more-390-light-read.png)
- [360px Light](evidence/more-360-light.png), [390px Dark](evidence/more-390-dark.png), [430px Light](evidence/more-430-light.png)
- [320px Dark at 200% text](evidence/more-320-dark-large-text.png)
- [Expanded Light](evidence/more-1280-light.png), [Expanded Dark](evidence/more-1280-dark.png)
- [Compact footer / account actions](evidence/more-footer-390-dark.png)
- [Contextual Story return](evidence/memory-390-headerless-return.png)
- [Today without global header](evidence/01-today-without-global-header.png), [demo-banner adaptation](evidence/02-today-shared-surface-with-demo-banner.png)

The light grouped surfaces were explicitly selected by the Product Owner after reviewing the generated reference. Dark uses existing raised-surface tokens. Axe checks cover More and the active primary navigation; keyboard/focus, growing rows, footer reachability and horizontal reflow are exercised by the browser cases.

## Limits and isolation

Browser API fixtures use fictional identities and exercise the real React product and session cleanup. Top/bottom safe-area values are simulated; no physical handset/native-wrapper acceptance is claimed. No wrapper, backend, database, entitlement or deployment configuration changed.

All work used `/tmp/eimir-mobile-header-more`, branch `fix/mobile-header-more`, copied dependencies and explicit strict preview ports. The shared working checkout and other chats' source changes were not edited. An interrupted runner's identified orphaned preview was stopped; no unrelated processes were targeted. Publication is a reviewable PR, not a production deployment or merge.

## Merge follow-up: native modal background target

The retained F2 native-modality proof now uses the real bottom More link rather than the retired header brand. It still cycles keyboard focus, rejects programmatic focus behind the native dialog, clicks the background navigation destination through the backdrop, and requires the complete original URL to stay unchanged. An explicit geometry assertion proves the click is outside the floating sheet. The focused Chromium case passes without retries. This is a test compatibility repair; runtime sources remain unchanged.

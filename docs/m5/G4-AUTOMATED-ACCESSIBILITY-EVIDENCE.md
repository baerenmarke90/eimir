# G4 automated accessibility evidence

**Issue:** #192  
**Scope:** automated Web and Android accessibility/client QA gates only  
**Manual assistive-technology acceptance:** still required by `docs/ACCESSIBILITY-QA-MATRIX.md`

## Purpose

Issue #192 predates most of the production client work. Its Web automation has since been delivered incrementally by the M5 Web slices, while Android gained Compose semantics coverage as its product surfaces were implemented. This record maps the current executable gates to the original #192 acceptance criteria and closes the remaining Android navigation/back/large-text automation gap without creating a second QA framework.

## Web gate

The dedicated pull-request workflow `.github/workflows/web-browser-qa.yml` runs for Web changes and executes:

- the locked Web dependency install and high-severity dependency audit;
- the production Web build;
- pinned Chromium installation through Playwright;
- `web/e2e` Playwright tests;
- `@axe-core/playwright` WCAG 2.0/2.1/2.2 A/AA scans.

The executable suite is `web/e2e/tests/product-accessibility.spec.ts`.

Current automated coverage includes:

- Compact 320 px sign-in with keyboard focus order;
- long German product copy without horizontal overflow;
- authenticated Compact shell and global create menu keyboard operation;
- Arrow-key entry and Escape focus return for the menu;
- Reduced Motion behavior;
- Expanded 1440 px authenticated shell;
- direct legacy Deep Link entry and canonical route handling;
- Skip Link focus transfer;
- browser Back behavior;
- axe scans on representative unauthenticated and authenticated states.

The browser gate fails the pull request when an asserted interaction, layout invariant, or axe scan fails.

## Android gate

The existing `.github/workflows/android-s8.yml` workflow runs for Android changes and executes:

- `:app:testDebugUnitTest`, including Robolectric Compose semantics tests;
- Android lint;
- a reproducible debug build with strict dependency verification.

Existing product tests already cover semantics for the entry surface, shell, Story and the M2 reference flow. `EntryScreenSemanticsTest` also verifies that sign-in remains operable at a 2x font scale.

#192 adds `AppNavigationAccessibilityTest`, which exercises the real Navigation Compose host and verifies:

- every primary destination remains reachable on a 320 dp Compact surface at a 2x font scale;
- the active destination remains exposed as selected;
- navigation still reaches the requested screen under large text;
- a detail route keeps its parent Story destination selected;
- popping the real Navigation Compose back stack returns to the parent screen without losing navigation semantics.

No new navigation, accessibility, screenshot, or test dependency is introduced.

## Acceptance mapping

| #192 criterion | Evidence |
|---|---|
| Automated browser E2E runs in CI | `Web Browser QA` pull-request workflow executes Playwright |
| Representative accessibility violations fail the gate | `@axe-core/playwright` scan asserts zero WCAG A/AA violations |
| Keyboard/focus/Deep Link/Back are automated | `product-accessibility.spec.ts` Compact and Expanded flows |
| Compact/Expanded and long localized text are represented | 320 px and 1440 px browser cases with German copy and overflow assertion |
| Android P0 semantics are covered | Robolectric Compose semantics suites in `:app:testDebugUnitTest` |
| Android navigation/back/large-text regression is covered | `AppNavigationAccessibilityTest` plus the existing 2x-font entry test |
| Manual accessibility acceptance remains explicit | `docs/ACCESSIBILITY-QA-MATRIX.md` remains the release gate and explicitly requires real assistive technology |

## Manual release acceptance remains separate

Automation does not establish that a release has passed manual accessibility acceptance. Before G4/G5 release approval, the applicable matrix still requires real assistive-technology and platform checks, including as relevant:

- TalkBack on Android;
- external keyboard and switch-control behavior;
- NVDA/JAWS or VoiceOver for Web;
- browser zoom and platform contrast behavior;
- representative real devices/window classes and large display settings.

Those observations must record platform/version, assistive technology, test date and any finding severity. #192 closes the reproducible automation gap; it does not replace that manual release evidence.

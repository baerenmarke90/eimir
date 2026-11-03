# Runtime evidence for #1616

Main baseline: `a7d443dea7070bf546ccfcaa48280420da4ef818`; dependency #1615:
`a1d0659481cc3cb07d82d1bc11141afad94a593c`. The accompanying implementation's
changed runtime sources are fingerprinted in [runtime-sources.sha256](runtime-sources.sha256).
Captures come from actual React/Vite journeys in Chromium 153, using the existing
repository API fixtures, real DOM/CSS, keyboard/focus and Axe checks. Map tiles
are deliberately mocked; these images prove navigation/composition and marker
rendering, not an external tile provider or physical Android device.

## Journeys and validation

- Full Web unit/component suite: **2,572 passed, two existing skips**. The old
  assertion for a Diary years link was retired with its removed browse layer;
  More now proves the destination independently of loaded Story pagination.
- **53 scoped browser cases passed** across Plans, comments/links, Discover,
  Diary, saved-memory map and annual history. After preserving the existing
  Photos/Chapters destinations in More, both affected Diary/More cases passed
  again. No assertions or timeouts were weakened.
- Open/Experienced Plan scopes: upcoming, later, undated and past uncompleted
  plans remain Open; completed plans show their experienced date separately.
  Select scope → open canonical detail → Back → selected scope and item focus
  restored; peer Wishes keeps Open/Fulfilled. Scope-specific empty results are
  tested. Cases cover 360/390/430, Expanded and 320 with 200% text.
- Expanded descriptions keep links/previews and disclosure identity. More/Less
  has normal padding, no underline, a ≥44px target and working collapse. Plan
  place label/name/address and linked-Wish destination retain native links and
  reachable secondary controls in Light/Dark, Expanded and enlarged text.
- Story peer-tab bounds match within one CSS pixel across Discover, Diary and
  Map at 360/390/430 and Expanded. Existing marker, fullscreen, source-return,
  privacy/Pro, failure and media continuity assertions remain.
- Diary uses its existing filter with contained focus, Escape and trigger
  restoration. No duplicate browse strip. More → Our Year → annual archive →
  Browser Back works; Photos/Chapters retain their canonical destinations.
- Discover leads with authored content, has no invitation banner, and renewal
  follows the last content section. Existing duplicate-activation, confirmed
  selection, offline/rate failure and safe-return cases pass.
- Production build/typecheck, semantic tokens, PWA, browser-test inventory,
  focused Biome lint and diff whitespace checks pass. Existing informational
  template-literal lint suggestions in unrelated fixture code remain.

The first browser attempt could not launch its expected bundled Chromium. It
was replaced with the installed Chromium 153 executable in a scratch-only
configuration; no repository launch settings or CI gates were changed. One old
unit assertion expected the intentionally removed Diary years entry; the More
destination and annual data/chronology tests supply the appropriate coverage.
No hosted workflow was manually rerun to conceal a failure.

## Captures

| Surface/state | Actual runtime evidence |
| --- | --- |
| Plan expanded description, place and Wish actions | [390 Light](plan-description-390-light.png), [430 Dark](plan-description-430-dark.png), [1280 Dark](plan-description-1280-dark.png) |
| Open and experienced Plans | [360 Light/Open](plans-open-360-light.png), [390 Dark/Experienced](plans-experienced-390-dark.png) |
| Diary filter and reflow at 200% text | [320 Dark](diary-320-dark-large-text.png) |
| More with annual, Photos and Chapters destinations | [390 Light](more-390-light.png) |
| Authored discovery, renewal after content | [390 Light](moments-390-light.png) |
| Stable map navigation and photo markers | [360 Light](map-360-light.png), [1280 Dark](map-1280-dark.png) |

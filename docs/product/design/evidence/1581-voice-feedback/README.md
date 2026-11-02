# Voice-feedback implementation evidence

Owner: #1581. Runtime baseline: `b9843b504a8e10a3d49e89838262681b13b7d1aa`;
final scope-label and large-text test refinement:
`0d51246ac6f6e1d420fbf2902739ed843310f011`. Both descend from main
`26369e5d54f91fe63c180b5bc6d47cba6a8b4900`, including the merged Push work.
The generated reference was linked in the issue before UI implementation;
it is separate from these actual application captures.

## Implemented journeys

- A photo-free Wish is completed, remains readable under Fulfilled, and opens
  its canonical detail. Back restores the selected scope and source focus;
  reload preserves the explicit fulfilled scope. No Memory/photo is required.
- Memory capture selects a saved Place, retains it through explicit owner-local
  draft recovery, and submits its ID in the exact create snapshot. The normal
  canonical result opens after confirmed save. The existing typed relation is
  written in the same backend transaction as the new Memory.
- Shared HeartMoment capture submits the selected Place. Switching to Private
  removes the place action and omits the place from the create payload. Backend
  relation authorization also rejects private targets and foreign Places.
- Personal Immich setup has optional disclosed steps, a key-versus-password
  explanation, and a device-photo alternative. Existing consent, selection,
  staging, save and disconnect behavior remains.

The existing saved/map Place-choice lifecycle is shared with post-save linking;
creating a new independent Place remains explicit. Manual links precede automatic
photo-location association. Basic Place capture does not require Immich, a photo
or the Premium map. Existing notification admission is unchanged.

## Actual captures

| Surface | Representative evidence |
| --- | --- |
| Fulfilled Wishes, Compact Light | [390 px](1581-fulfilled-390-light.webp), [430 px](1581-fulfilled-430-light.webp) |
| Fulfilled Wishes, Dark / Expanded | [360 px](1581-fulfilled-360-dark.webp), [1280 px](1581-fulfilled-1280-dark.webp) |
| Memory with selected Place, Light | [390 px](1581-memory-place-390-light.webp), [430 px](1581-memory-place-430-light.webp) |
| Memory, Dark / Expanded | [360 px](1581-memory-place-360-dark.webp), [1280 px](1581-memory-place-1280-dark.webp) |
| Memory, 320 px with 200% browser text | [Large-text reflow](1581-memory-place-320-dark.webp) |
| Shared / private HeartMoment capture | [Shared](1581-heart-place-SHARED.webp), [Private](1581-heart-place-PRIVATE.webp) |
| Immich setup | [Collapsed help](1581-immich-390-light.webp), [Expanded help](1581-immich-help-390-light.webp) |

The captures use the real React product and synthetic account/source transport,
with reduced motion. Full-page captures of long forms show the viewport-fixed
navigation at its captured viewport position. They do not imply a second bar
inside the form. The optional place action follows the current composition.

## Verification and limits

- Full Web suite: **2,467 passed, two existing skips**. The scope-label-only
  refinement also passed the five Planning component tests and typecheck.
- Browser matrix: **16/16 passed**; six affected journeys were repeated after
  the scope label and 320 px / 200% text refinement, **6/6 passed**. The matrix
  covers 320/360/390/430 and Expanded, Light/Dark, explicit draft recovery,
  source/Back/reload, private capture, real selection/save and scoped axe checks.
- Backend unit suite: **1,178 passed** initially; its sole remaining failure
  was the environment's missing optional SOCKS support when constructing the S3
  adapter. Installing `socksio` into this ephemeral test environment resolved
  that isolated test: **1 passed**. No dependency or proxy rule was changed in
  the repository, and no production S3 request was made.
- Scoped Ruff, strict mypy, OpenAPI export/check, canonical Web generation with
  the exact approved OpenAPI Generator **7.24.0**, semantic tokens, PWA checks,
  TypeScript and production build passed. No generated client was edited by hand.
- New PostgreSQL/HTTP cases cover atomic manual-place creation/replay,
  changed-payload/same-key rejection, foreign-place rollback including receipts, and private
  target rejection. This managed environment cannot switch to a non-root user
  to start PostgreSQL; those cases require the hosted CI PostgreSQL service.

Local browser execution used Chromium **153.0.8010.0** from an isolated test
tool installation because the normal browser ZIP download was unavailable.
The repository's Playwright dependency/configuration is unchanged. No physical
Android test, deployed persistence test or real Immich-server acceptance is
claimed. Hosted checks must pass before merge; this task does not merge or
publish a release.

Initial hosted Change Detection rejected five German synthetic fixture values in
two browser specs. The fixture address/prose were translated into English;
assertions, product localization and test gates were retained. Local scoped
engineering-language audit and all 27 audit tests pass. Fresh checks run on the
fix commit; no workflow was restarted as a retry.

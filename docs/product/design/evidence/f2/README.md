# F2 production journey evidence

This is implementation evidence for [F2 #958](https://github.com/baerenmarke90/eimir/issues/958), governed by the [task contract](../../f2-task-boundaries.md). It exercises production consumers with synthetic transport and content. It is not acceptance of the finished R1/R2 compositions or a live-backend persistence test.

## Web

The [browser report](f2-web-report.json) records scenarios, exact source identity, browser/configuration, assertions and image hashes. The [source manifest](f2-web-source-hashes.sha256) distinguishes runtime inputs from test-only changes; it is a plain `sha256sum -c`-compatible checksum file (hash first, no JSON key/value shape) so evidence provenance survives a squash merge without commit-bound scan exceptions. The equivalent suite command is `npm test -- tests/f2-task-boundaries.spec.ts` from `web/e2e`; the normal browser CI includes the suite and publishes `f2-*.png` evidence. The captured run instead used an isolated configuration with the explicit worktree Web root, port 4188, HMR disabled, one worker, no retries and `reuseExistingServer: false`, avoiding unrelated local servers. Those isolation settings must be retained when reproducing exact-source evidence.

**32/32 scenarios passed** on source `23862d61759558836d5c605e3340e665d57d0e39`, using Playwright 1.62.1 / Chromium 151.0.7922.34, one worker and no retries. All 929 captured inputs match the source manifest; the 791 runtime inputs have combined SHA-256 `106281b66a8efd69a8d227c7403e85aa4d4eb18617914e6e428939f5d7409ecd`. The 27 selected PNGs are unchanged browser output.

| Journey/state | Light | Dark |
| --- | --- | --- |
| Compact Quick Create | [390 px](f2-quick-create-390-light.png) | [390 px](f2-quick-create-390-dark.png) |
| Compact filter draft | [390 px](f2-filter-390-light.png) | [390 px](f2-filter-390-dark.png) |
| Focused capture, narrow | [320 px](f2-create-320-light.png) | [320 px](f2-create-320-dark.png) |
| Focused capture, Compact | [360 px](f2-create-360-light.png), [390 px](f2-create-390-light.png), [430 px](f2-create-430-light.png) | [360 px](f2-create-360-dark.png), [390 px](f2-create-390-dark.png), [430 px](f2-create-430-dark.png) |
| Confirmed photo result | [390 px](f2-result-390-light.png) | [390 px](f2-result-390-dark.png) |
| Expanded Quick Create menu | [1280 px](f2-quick-create-1280-light.png) | [1280 px](f2-quick-create-1280-dark.png) |
| Expanded filter dialog | [1280 px](f2-filter-1280-light.png) | [1280 px](f2-filter-1280-dark.png) |
| Expanded capture | [1280 px](f2-create-1280-light.png) | [1280 px](f2-create-1280-dark.png) |
| Expanded result | [1280 px](f2-result-1280-light.png) | [1280 px](f2-result-1280-dark.png) |

Additional evidence: [older Timeline return with selected-item focus](f2-restored-older-timeline-390-light.png), [unconfirmed photo association](f2-partial-photo-binding.png), [unknown create outcome](f2-unknown-create-outcome.png), [filtered no-match](f2-filter-no-matches.png), [200% text at 320×480](f2-large-text-short-compact.png). Behavioral assertions, rather than screenshots alone, establish exact saved identity, one POST, loaded-range/position restoration, dirty/pending protection, nested dismissal and safe direct entry. The enlarged composer uses scoped spacing adjustments so labels and the native date value remain readable without shrinking text.

All photos reuse the repository-approved CC0 cabin fixture at `backend/demo_assets/images/cabin-lake.jpg`; no external account or personal content was used. The reports state the tested browser/viewport limits. Desktop browser emulation does not establish physical-phone keyboard or screen-reader behavior.

## Android

The debug-only `TaskJourneyProofActivity` mounts the actual `ReferenceFlowRoute`, ViewModel, picker, sheet, capture and detail. Only process-local transport is synthetic. Production release manifests/assets exclude both this Activity and its photo fixture. The capture helper installs the exact debug APK only on a disposable emulator and restores display, font, animation and night-mode settings.

Native device validation and TalkBack results are being completed before this slice is marked ready for merge. They must be recorded separately from Compose semantics and UIAutomator assertions.

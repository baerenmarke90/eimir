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

The [device report](android/f2-android-report.json) records **16 passing behavior scenarios**, 34 unchanged screenshots and 36 measured targets meeting 48 dp on an AOSP API 35 arm64 emulator. The [build identity](android/f2-android-build.json) pins runtime source `0616ed02e2acf2ded76292ced51e1c83a420fb41` and APK SHA-256 `f2e5b9a5273ddd0a2d57b9435c3cafef0e5a5d62509ba6cb65a81eb79a000faf`. The 122 files in `android/app/src/main` and `android/app/src/debug` have combined SHA-256 `e39af6c6feb538b15f1c3b041353b6e627545fb82f5d8d3633cb4701f8e04376` and remain unchanged after capture.

| Journey/state | Light | Dark |
| --- | --- | --- |
| Narrow Quick Create | [320 dp](android/f2-android-320-light-quick-create.png) | [320 dp](android/f2-android-320-dark-quick-create.png) |
| Compact Quick Create | [390 dp](android/f2-android-390-light-quick-create.png) | [390 dp](android/f2-android-390-dark-quick-create.png) |
| Narrow capture | [320 dp](android/f2-android-320-light-composer.png) | [320 dp](android/f2-android-320-dark-composer.png) |
| Compact capture | [360 dp](android/f2-android-360-light-composer.png), [390 dp](android/f2-android-390-light-composer.png), [430 dp](android/f2-android-430-light-composer.png) | [360 dp](android/f2-android-360-dark-composer.png), [390 dp](android/f2-android-390-dark-composer.png), [430 dp](android/f2-android-430-dark-composer.png) |
| Expanded Quick Create | [1280 dp](android/f2-android-1280-light-quick-create.png) | [1280 dp](android/f2-android-1280-dark-quick-create.png) |
| Expanded capture | [1280 dp](android/f2-android-1280-light-composer.png) | [1280 dp](android/f2-android-1280-dark-composer.png) |

The matrix also includes 360/430 dp Quick Create in both themes. Behavioral captures cover [IME](android/f2-android-ime-input.png), [rotation](android/f2-android-draft-after-rotation.png), [pending exit](android/f2-android-pending-exit-explanation.png), [confirmed result](android/f2-android-confirmed-result.png), [rejection](android/f2-android-rejected.png), [unknown create outcome](android/f2-android-uncertain.png), [offline input](android/f2-android-offline.png), [post-save refresh failure](android/f2-android-refresh-failure.png), [authoritative denial](android/f2-android-denied-result.png), and [200% text with reduced animation](android/f2-android-large-text-reduced-motion-composer.png).

The main run used the helper at the captured commit. Its Timeline return assertion could reveal the selected card before comparing bounds. The stronger [separate return assertion](android/scoped-return-no-scroll.json) performs no scroll or reveal after Back: the fully visible older Memory returns at exactly `[40, 856, 740, 1137]`, with identical before/after pixels and semantics. The final helper now uses a direct lookup on return. This establishes position and content continuity; it does not infer accessibility focus from geometry.

Native supplements, recorded separately from the main UIAutomator run: [dark detail with corrected foreground contrast](android/dark-detail-final.png); [200% text with the save action scrolled into view](android/large-text-scrolled-actions.png); and the [scoped Timeline return](android/scoped-return-no-scroll.json) triptych — [before](android/scoped-return-before.png), [older-Memory detail](android/scoped-return-detail.png) and [after Back with no scroll/reveal](android/scoped-return-after-no-scroll.png).

**TalkBack.** The [service-state record](android/f2-android-talkback.json) confirms TalkBack was actually installed, enabled and bound (`adb shell dumpsys accessibility`) against the exact APK above, with touch exploration active. With TalkBack running, initial accessibility focus lands on meaningful content on Home ([home](android/f2-android-talkback-focus-home.png)) and moves into the Quick Create sheet on open instead of staying on now-obscured background content ([sheet](android/f2-android-talkback-focus-quick-create.png)); the flow remains fully operable throughout. A full linear-navigation, element-by-element spoken-announcement transcript was not produced: adb-injected touch gestures do not reliably reproduce TalkBack's real explore-to-focus/double-tap-to-activate semantics in this headless emulator (injected taps activated controls directly rather than only moving focus). This is a synthetic-input tooling gap, not an observed defect; the existing Compose semantics assertions remain the source of truth for accessible name/role/state per control.

# F1 visual foundations — implementation and proof

**Owner:** [#957](https://github.com/baerenmarke90/eimir/issues/957), child of #955.  
**Authority:** [Product Reference v1](product-reference-v1.md), D1/D2/D7; [system direction](design-system-direction.md).  
**Status:** implemented with Web and Android emulator evidence; delivery and review are tracked in [#960](https://github.com/baerenmarke90/eimir/pull/960). The preflight was committed before UI implementation on 2026-09-15.

## Live baseline and overlap

Start from `f1d3496d091c1823ad618748686f2c5eea068a50` (`origin/main`, merged #959). #955 and #957 were read with all comments; both had no comments. #953 and the identity migration are complete. The original checkout remains untouched; work uses `codex/957-visual-foundations` in an isolated worktree.

The live open-PR inventory has 18 entries: #763, #762, #339, #317, #234, #233, #232, #207, #157, #156, #142, #141, #140, #139, #136, #135, #133 and #132. Their `updatedAt` values match the file-level inventory reviewed for #959. No open design/token implementation competes with F1. #317 targets an older feature branch and touches App/Space context/localization; F1 does not alter that flow. Dependency PRs touching Android build configuration (#142/#141/#140/#139), Gradle (#207), Web manifests (#156/#136/#135/#133/#132), containers or workflows are not adopted here. Preserve their dependency versions and review any overlapping build-file hunks again before merge.

## Product Design Preflight and Mobile Interaction Contract

**User-facing UI / UX impact reviewed.** The full bounded Mobile Interaction Contract is recorded in #957. This implementation binds it to concrete consumers before UI code:

- Web: `web/e2e/fixtures/product-reference-foundations.html`, `.tsx` and `.css`, exercised by `web/e2e/tests/product-reference-foundations.spec.ts`. Vite serves the internal fixture in development; the production entry/router does not import it. Check the production build excludes it.
- Android: `android/app/src/debug/java/de/eimir/app/design/VisualRolesProofActivity.kt`, debug-only manifest/resources and `android/app/src/testDebug/java/de/eimir/app/design/VisualRolesProofTest.kt`. Explicit developer launch only; no production navigation or release Activity. Copy the approved photo into generated debug assets, never release assets.
- Production consumers: Web `shell.css` and `product-reflow.css` consume the responsive gutter; existing Android `EimirTheme.spacing.pageMargin` consumers inherit the responsive adapter. The approximately 28 native consumers include some all-direction padding, so review their vertical spacing consequence as well.
- Templates: Story Timeline/Detail View for photo and text, Settings and Privacy for compact utility selection. This fixture creates no new Screen Template.
- Composition: a large photo and meaningful short title; a separate authored text memory with no photo hole; a small utility group. Photo/words → supporting audience/context → utility. One selected sample opens its own reading detail; Close/Back returns to the sample. Utility has real fixture selection/status behavior, not dead controls.
- Overlay: browser-native modal dialog and Compose Material 3 ModalBottomSheet demonstrate the raised role with a visible Close action. F1 does not introduce a reusable sheet lifecycle or change production navigation; F2 owns those mechanics.
- States: stable media loading; failed media retaining caption and retry; successful retry; text-only/absent-image composition; explicitly simulated cached/offline information and visible announced fixture completion. No domain save/sync promise.
- Privacy: synthetic text and the existing approved cabin photo only; shared/private meaning includes text/semantics. No accounts, real IDs, credentials, API, analytics or persisted fixture data.
- Mobile: 320 reflow plus 360/390/430 widths; 16-unit gutters below 390, 20 from 390 through Compact. Reading and targets grow with text; Web minimum 44, native 48. No autofocus or IME. Expanded adds reading/media room within a bounded measure, without a tile wall or permanent management controls.
- Warmth comes from the approved image, authored words, selective Literata and varied spacing. Utility remains Instrument Sans. No love-message banner or decorative delight animation is appropriate in this foundation proof.
- Motion uses existing fast/standard/emphasized durations and platform mechanics; reduced motion preserves content, status, focus and every action without nonessential translation/scale/shimmer.
- Acceptance includes actual interaction, focus/Back/return, contrast and layout measurements, Light/Dark screenshots, long labels, 200% text and reduced motion. Native host tests supplement device/emulator evidence, never substitute for it.

## Role and consumer decisions

| Purpose | Existing source / selected delivery | Constraint |
| --- | --- | --- |
| Bare page, reading, bounded content | `background`, `surface`, `surfaceSubtle`; semantic HTML/Compose layout | No universal Card component or mandatory border/shadow |
| Meaningful tint | Existing shared/private surfaces plus explicit audience text | No tint-only privacy signal |
| Elevated sheet | `surfaceRaised`, existing scrim/overlay depth and `radius.sheet` | Only a transient interaction layer |
| Photograph | Existing approved image; `radius.large`; no extra card padding | Caption below; full view contains complete image; failed differs from absent |
| Personal/content title | Existing heading2/heading3 metrics with existing display family | Selective Literata; long prose uses body, not display |
| Utility, reading, support | Existing heading2/heading3, body and bodySmall; UI family; `textSecondary` | Essential small text does not use failing Light `textMuted` |
| Links/selected text | Strong coral in Light, existing bright coral in Dark | Filled actions keep strong coral + onAccent in both themes |
| Radius and motion | Existing JSON scale via additive purpose roles | Legacy Web aliases have different values; no blanket consumer rewrite |
| Page gutter | Existing 16/20 spacing; one new narrow-gutter alias and 390 threshold | JSON owns values; both viewport/container and native adapters agree |

**Preflight baseline:** the Web adapter was manual and drift-tested; native generation omitted layout/motion. F1 now extends those boundaries using existing Node/Gradle APIs. This maps the current token source without replacing the token framework. Existing aliases remain compatible until their consumers migrate. Do not add duplicate palette/supporting-text values or one token per fixture margin.

## Current reuse review

Reviewed on 2026-09-15 before implementation:

- Standards/platform: [CSS media queries](https://www.w3.org/TR/mediaqueries-3/) express width-dependent spacing; [reduced-motion guidance](https://www.w3.org/WAI/WCAG21/Techniques/css/C39.html) preserves understandable changes without movement. [HTML dialog](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element) provides top-layer modality and background inertness for the controlled Web sample.
- Framework/native: [Compose window information](https://developer.android.com/reference/kotlin/androidx/compose/ui/platform/WindowInfo) supplies available window dimensions; [Material 3 sheets](https://developer.android.com/develop/ui/compose/components/bottom-sheets) supply established native overlay behavior. Reuse existing EimirTheme, fonts, Image/Text/Material controls and bounded image decoding.
- Existing Web: reuse MemoryPreview/VisibilityBadge/UiState where their actual behavior fits; keep recovery honest. Domain editors are too coupled to authorization/forms for this visual proof. Do not turn that rejection into a new shared overlay framework.
- Established OSS considered: [Style Dictionary](https://styledictionary.com/getting-started/installation/) is a general token transformation option. The existing JSON/Gradle boundary and a small deterministic Node mapping need no new package, configuration ecosystem or migration. Existing React, Playwright, axe, Compose and Robolectric remain at locked versions.
- External providers: none solve a missing requirement. Existing self-hosted fonts and checked-in approved demo media avoid image/font CDN requests, new accounts, keys, costs, rate limits or deletion obligations. `docs/EXTERNAL-PROVIDER-CANDIDATES.md` was reviewed; a media pipeline/provider is out of scope.

No new runtime dependency or service is selected. Existing React (MIT), AndroidX/Material, Playwright/Robolectric (Apache-2.0), axe (MPL-2.0) and OFL fonts keep their documented provenance/licensing. They support the same Cloud/Self-Hosted build with no new user/hoster configuration. Failure falls back to readable text and explicit retry. Existing build infrastructure owns dependency installation; no new production storage/cache/data transfer results.

Photo provenance: `backend/demo_assets/manifest.json`, `memory-cabin`, creator Darkmoon_Art, CC0 1.0 Universal, SHA-256 `6c734e84d199e3d2e38d9d51064ce5bdd741def0b842fe4fb5dbb20d8c0f7f8f`. Reuse these approved local bytes; no third-party image download or duplicate source asset is needed.

## Business/Freemium Model Consistency

**No business/freemium impact:** official clients, standard appearance and Memory/Timeline remain Free/Core under the versioned matrix; accessibility/i18n remain non-paywallable. This is the baseline design system, not Premium bespoke themes/covers. Space entitlements, ownership, quotas, storage, compute, provider costs, retention, downgrade/trial/grandfathering/restore/export and existing data are unchanged. Cloud and Self-Hosted receive the same behavior.

## Cross-cutting review

- Security/privacy: debug/test proof only, approved fixtures; no new production route, authentication, authorization, persistence, logs, analytics, or data lifecycle. Verify release/build exclusion.
- Accessibility/i18n: localized fixture resources, semantic headings and named controls, text plus privacy meaning, visible focus/Back/Close, contrast, large text/reflow and minimum targets. No automatic keyboard. Platform and RTL-aware padding semantics.
- Concurrency/resilience: no domain mutations. Ignore stale image completions/unmounts using existing lifecycle; stable pending/error/retry states preserve text. Offline fixture explains available read-only content.
- Performance: bounded single existing image, stable aspect ratio, bounded decoding, no new derivative/processing infrastructure or decorative loops. Responsive spacing responds to window changes without resetting sample state.
- Contracts/operations: additive token/adapter roles with reproducible generation; preserve legacy consumers and dependency versions. No API/DTO/database migration, backend runtime or deployment change.
- Validation: adapter/token contrast and drift tests, Web/native component behavior, production build exclusion, visual/reflow/large-text checks and relevant CI. Record real evidence and remaining limitations rather than checking unperformed gates.

## Delivery and evidence

### Delivered API and migration boundary

`design/tokens.json` is version **2.1.0**. The only new reusable values are `layout.mobileGutterNarrow` (the existing spacing.4 reference) and `layout.breakpoint.compactComfortableMin` (390). Existing colors, font files, spacing scale, radii and motion values remain the source.

| Consumer | Delivered boundary | Usage |
| --- | --- | --- |
| Web | Generated `web/src/design/product-roles.css`, imported after `theme.css` | Personal/content headings, utility/section headings, reading/supporting/navigation/action type roles; media/content/sheet radii; group/section gaps; gutter, motion and overlay elevation roles; readable `--color-link-text` |
| Android | Existing Gradle generator plus `EimirTheme.contentTypography`, responsive `EimirTheme.spacing.pageMargin`, `EimirReadingWidth`, `EimirMotion`, `EimirColors.linkText` | Selective Literata for personal/content headings; Instrument Sans for utility and reading; generated layout/motion values and the same contrast-safe accent-text choice |
| Existing product shell | Web `shell.css` and `product-reflow.css`; native page-margin consumers | Web widths 390–839 change from 16 to 20 px. Native widths below 390 change from 20 to 16 dp; consumers using all-direction padding also reduce their vertical margin by 4 dp. Web Expanded 32 px spacing remains unchanged. |
| Internal proofs | Development-only Web entry and debug-only Android Activity | Photo, authored text, utility selection, reading detail, visible privacy, stable loading/error/retry, absent image, explicitly simulated offline/status, and platform overlay |

For Web token changes run `npm --prefix web run tokens:generate`; `tokens:check` is part of build and unit-test commands. Never edit the generated CSS directly. The supported Web-only Docker context uses explicit `build:bundle` to compile this checked-in adapter; it does not have the canonical JSON. Default monorepo build/test and token-source-triggered Web S8 CI retain strict drift checking. Android generation runs through the existing Gradle token task. Existing legacy Web radius/motion aliases are deliberately compatible; migrate consumers by their meaning in the owning R1–R5 slice. There is no universal Card/Surface wrapper. Raised surfaces belong to transient overlays, meaningful tints require textual meaning, and essential supporting text uses the readable secondary role.

The proof is an internal composition, not a standalone populated catalog: Playwright supplies the approved local photo at `/__foundation-proof/cabin-lake.jpg`. Opening the Vite fixture directly can use `?media=none` for the intentional text-only composition. No remote photo request or new CDN is introduced. Android copies the same source asset only into generated debug assets. The production Web bundle and merged Android release manifest/assets exclude the proof and its photo.

### Reproduce the bounded proof

From `web/e2e`, run the existing Playwright setup, then:

```sh
npm test -- tests/product-reference-foundations.spec.ts tests/product-gutters.spec.ts
```

The fixture is typechecked separately with `web/node_modules/.bin/tsc -p web/e2e/fixtures/tsconfig.json`. The browser CI runs this check and the proof tests, and uploads `f1-*.png` / `f1-*.json` with the existing visual-evidence artifact. Local alternate-port runs must start Vite with this checkout as an explicit root; never reuse a server from another checkout.

For Android, build `:app:assembleDebug`, then use a **dedicated disposable emulator**:

```sh
python3 tools/qa/capture_f1_android.py \
  --serial emulator-5562 \
  --apk android/app/build/outputs/apk/debug/app-debug.apk \
  --output /tmp/eimir-f1-android-evidence
python3 tools/qa/measure_f1_android_contrast.py \
  --captures /tmp/eimir-f1-android-evidence \
  --output /tmp/eimir-f1-android-evidence/f1-android-contrast.json
```

Pass `--adb` when platform-tools is not on PATH. The capture helper installs only the debug APK, exercises controls through UIAutomator, captures screenshot/semantics pairs, and restores display/font/motion/system-night overrides. Its report includes source commit, APK hash, screenshot hashes, observed bounds, interaction results and limitations; unsuccessful runs explicitly report `completed: false`. The contrast sampler uses Pillow, already declared in the backend project, in the QA environment, reads images without modifying them, and fails when expected rendered role colors are missing. No production runtime dependency is added.

### Evidence and validation

The [evidence index](evidence/f1/README.md) links representative Compact/Expanded and Light/Dark results. Web captures exercise source revision `115136f1` (the same runtime files were present during the preceding capture); final test-only/documentation commits do not alter that rendering. The full 320/360/390/430/1280 matrix and state images are also produced by browser CI.

Web proof: **19 passing tests** plus **20 passing gutter-boundary checks**, including image/detail recovery, stale completion protection, reading return, native-dialog modality, theme completion, 200% text, long labels, reduced motion, axe and minimum targets. Essential rendered CSS contrast ratios are recorded in the JSON files: Light/Dark body **15.44/15.71**, supporting copy **6.29/11.72**, shared label **5.25/7.71**, link text **5.27/6.69**, focus **5.88/8.58**; filled actions **5.99** in both themes.

Native proof: **24 accepted captures and 8 real interaction scenarios** on a dedicated Android 15 / API 35 ARM64 emulator, at 2 pixels per dp. The report records 320/360/390/430/1280 in both themes, loading/error/absent media/offline/success, photo/text detail, selection and overlays. Both visible Back and System Back return to the source; Retry reveals the photo; absent media stays absent in detail. Close and System Back dismiss the sheet. 200% font scaling plus disabled system animations retain reachable actions. Measured Back/selection/sheet/Close/Retry targets meet **48 dp**. Photo bounds prove symmetric **16 dp** gutters at 320/360 and **20 dp** at 390/430; the outer accessibility scroll node includes padding and is not used as the gutter measurement.

Native source: `0dffed3e1e3beaaaf54adac3395fb221e1d46e12`; APK SHA-256: `614d3d14f09253ac115828a9e39d4296006dfd019b2938f705f9183a24bba152`. Screenshots and their semantic hierarchies are committed without image modification. The contrast report checks actual role pixels inside bounded semantic regions in addition to calculated token ratios. All **15 sampled text pairs pass**, with minimum **5.267:1**. The Dark utility-heading correction is explicitly covered by its own region. Activity and system night mode match for each capture; the final Dark sheet and system-bar icons were visually checked with normal and 200% text.

| Check | Result |
| --- | --- |
| Full Web unit suite in CI | 818 passed, 1 existing skip; an overloaded local W08 timeout also reproduced on clean main and passes in CI |
| Web build, typecheck, lint and formatting | Passed; fixture has a separate typecheck |
| Web production exclusion | No proof entry, fixture copy or cabin image in the production bundle |
| Native build, unit tests and lint | Passed; 570 tests, 0 failures/errors, 1 existing real-stack G2 skip; 20 focused tests rerun after the final visual fix |
| Android release exclusion | No proof Activity or photo in merged release manifest/assets |
| Product-design tooling / language tooling | 26 and 22 tests passed; documentation/engineering audits and status-drift passed |
| Web-only build compatibility | Isolated bundle with no canonical JSON produces identical JS/CSS; normal token check still rejects missing source; 16 source-build helper tests pass |
| Full browser and remaining integration gates | Required checks on [PR #960](https://github.com/baerenmarke90/eimir/pull/960); no claim of merge readiness before those checks pass |

Local macOS native builds used lenient verification for the existing host-tool metadata gap; the unchanged Android CI runs unit tests, lint, APK assembly and the tampered-metadata negative check with **strict** dependency verification.

The final diff retains the preflight business/freemium and cross-cutting conclusions: no new domain, entitlement, data lifecycle, managed service or runtime dependency. The only broader production presentation change is the documented responsive margin. Build-context adjustments preserve existing local and remote Self-Hosted source-build entrypoints.

### Remaining scope and limitations

This proves reusable visual roles and a bounded internal interaction. It does not accept any R1–R5 screen, complete #955, or replace the final product audit #946. F2 owns reusable overlay, editor lifecycle and interruption/return mechanics. UIAutomator/Compose semantic checks and visible Back/scroll return do not constitute a human TalkBack session or a full release-device matrix; no such claim is made. Merge requires Product Owner approval.

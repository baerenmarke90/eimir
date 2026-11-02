# Short-video completion evidence — 2026-11-02

Owner: #88 / PR #1598. The Product Owner requested completion, merge and a new Android test release on 2026-11-02. The former implementation-only/draft restriction is superseded by that request; general production/store release is not included.

## Exact runtime and journey

Web runtime source: `b434fc35ced2f5052107f6bfc9ce63bf7047e508`, including main `6164447c35cef16a2f1b7bc1ba7dfacbb67fa413`. The capture commit changes tests/documentation/assets only. Subsequent native acceptance exposed a Photo Picker proxy/WebView read failure; Android video selection now uses the system document picker as documented below. The shared Web composition and current editing rights, expandable descriptions, push onboarding and decoded-image cache remain the captured runtime.

The seven `video-attachments.spec.ts` journeys ran with one worker and `--retries=0`. They cover capture -> mixed ordering -> confirmed readiness -> save -> canonical result -> deliberate playback of the decoded blue H.264 frame -> seek/pause -> return, plus draft-safe Pro explanation and retained playback with intake disabled. Four `media-url-continuity.spec.ts` journeys also passed, including diary/detail return and cross-tab original-image continuity with fresh authorization.

The local pinned Playwright browser download was unavailable; these captures use the existing Chromium 153.0.8010.0 binary through a temporary configuration outside the repository. Hosted CI independently installs its locked browser. One earlier local run was interrupted by Vite HMR while source files were being formatted; its trace showed a document reload before authentication. It is not counted as acceptance. Fresh source runs completed without automatic retries.

| Viewport/theme | Capture | Decoded player |
| --- | --- | --- |
| 320px Light, 200% text | [Capture](video-capture-320-light.png) | [Player](video-playback-320-light.png) |
| 360px Light | [Capture](video-capture-360-light.png) | [Player](video-playback-360-light.png) |
| 390px Dark | [Capture](video-capture-390-dark.png) | [Player](video-playback-390-dark.png) |
| 430px Light | [Capture](video-capture-430-light.png) | [Player](video-playback-430-light.png) |
| 1280px Dark | [Capture](video-capture-1280-dark.png) | [Player](video-playback-1280-dark.png) |

The blue frame is synthetic decoded video, deliberately different from the lake poster; a poster alone cannot satisfy playback acceptance. Native controls and privacy/close overlays remain separately reachable. Reduced motion and large-text reflow retain the same semantics.

## Source, native and deployment gates

The restricted pinned FFmpeg build passed its new codec-context mismatch executable and all 33 local real-codec/media-content/stream tests without skips. The current upstream advisory fingerprint passed. See [source/security review](../../../../operations/video-uploads.md). Backend mypy passed 341 source files; complete unit-suite results and the final exact-head hosted checks belong to the PR validation record.

Android API 36/37.1 run a real shell-owned video through the MIME-filtered system document picker, Chromium File intake, inline decoding, pause and seek. The original Photo Picker proxy path produced an actual `NotReadableError`; the reviewed platform correction avoids it without caching selected videos or adding library-wide permissions. The launcher workflow retains picker/player screenshots and selected bytes. Its in-memory Blob contains the exact selected bytes and checks native decoding; production HTTP/range playback is independently covered by browser tests. Until the exact-head native run passes, acceptance remains pending. Final source and workflow links belong to PR #1598. Physical-device installation, OS links, accessibility and upgrade/data continuity remain explicitly unclaimed by the private test publication.

The existing sole private-channel publisher requires successful exact-main Media Video checks and separate archive/SBOM/attestation/config-digest/pull-back verification for the same-revision media derivative. Only then can it select the canonical restricted worker and enable test intake. No user provider setup, signing-key change, production approval change, branch-protection bypass or destructive instance reset is introduced.

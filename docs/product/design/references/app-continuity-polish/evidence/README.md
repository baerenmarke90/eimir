# Implementation evidence

## Tested source and dependency

The implementation is based on #1650 at
`6f95173f7bfc5d41280de3ec12ef3ba31ad20db4`. After #1650 merged,
the fetched remote main `0a65ac8f83384285b855c440280201dc398e23b7` was verified
to have the identical complete tree `8ba8162883240f0fa29416d87188b7e2e00d2a3a`.
The local main tracking reference was stale; comparing the actual fetched commit
resolves the apparent deletions without a further source merge. Its later backend-test/workflow fix
was integrated before final validation; it changes no Web source. The final
implementation commit contains these images and this record.

## Browser results

**56 distinct affected browser cases pass** across six specs. The case inventory
is [browser-results.json](browser-results.json). Tests use production components,
real routing/rendering and deterministic synthetic API/media fixtures.

| Spec | Passing distinct cases | Main evidence |
| --- | ---: | --- |
| `app-continuity-polish.spec.ts` | 8 | A on a delayed second Wish page precedes Z before the list appears; safe-area geometry and answer colors at 360/390/430/1280; consume/open/Back/reload/new comment; byte/grant counts across browser/native restoration |
| `media-url-continuity.spec.ts` | 4 | Existing detail/tab return and a ninety-second visit; the global core stays unchanged |
| `media-planning-corrections.spec.ts` | 9 | Complete alphabet and retained return at 360/390/430/1280 plus 320/200% text; retry retains partial content; Plans remain progressive; existing Edit/media/real codec journeys |
| `story-discover-tapestry.spec.ts` | 18 | One full-width retrospective, natural photo aspect ratio, source/focus order, reading typography, themes, axe/reflow and 320/200% text |
| `shared-experience-answers.spec.ts` | 4 | Both authors, own edit/save/result/return and chronological comments in Compact/Expanded and both themes |
| `planning-reference.spec.ts` | 13 | Segments, planning/detail, loading/error/retry, reflow, linking and axe |

The two long-retrospective cases were rerun after the final prose typography and
theme-aware foreground correction. Their final images are below. The final Wish
behavior was validated by the delayed-second-page acceptance case plus the retained nine
media/planning cases, preserving all accessibility, reflow, retry and return checks.

### Persistent image reuse

For the same `att-canal-1` thumbnail, the real app sees one initial binary
download. After a full browser runtime reload or synthetic native session
restoration, a fresh Story request occurs, **binary downloads remain one**, and
**the attachment grant count does not increase**. The latter distinguishes the
repair from the baseline: baseline persistence already prevented redownload, but
still blocked every cached preview on another per-image read-access request.

Fresh parent proofs are scoped, single-use, memory-only and bounded to sixty
seconds. Unit negative cases cover wrong parent/variant, account/API/Space,
expiry, logout, current denial and an old response resolving after revocation.
Cache misses still require the ordinary descriptor; originals and sensitive
reveal retain their contracts. The IndexedDB limits/lifecycle are unchanged.

### Review images

- [Complete alphabet](wishes-complete-alphabet-390-light.png)
- [Sticky Diary below the simulated status inset](story-sticky-safe-area-360-light.png)
- [Current comment before opening](today-current-comment-before-open-390-light.png)
- [Consumed comment in historical activity after return/reload](today-consumed-comment-history-390-light.png)
- [Full reading row and natural photo, Compact Light](story-retrospective-full-row-390-light.png)
- [Full reading row and natural photo, Expanded Dark](story-retrospective-full-row-1280-dark.png)
- [Distinct happiness answers, Compact Dark](shared-answers-history-390-dark.png)
- [Distinct happiness answers, Expanded Dark](shared-answers-history-1280-dark.png)

## Unit and tooling results

- Full Web sweep: 2,665 passes, two existing skips, 15 cases timing out under
  host storage/memory pressure. With the pressure resolved, all 15 pass in an
  18-file/180-case run with two workers. No timeout/assertion is increased or
  removed. The final Wish implementation separately passes 17 component/cache
  regressions; the final retrospective passes its four rendering regressions.
- TypeScript and production build pass; token and PWA consistency checks pass.
  Formatting passes. Lint passes with the existing repository warning baseline.
- Browser inventory and 38 planner/runner regressions pass. Shared media
  foundations conservatively select the full hosted regression: 70 PR-eligible
  specs plus 22 additional specs; actual full collection is 1,056 cases in 92 specs. New acceptance stays feature-owned; the global
  core is unchanged. The two new cold-start cases live in the feature-owned
  acceptance spec with explicit loader/session/production-consumer roots; the
  existing four-case global media-continuity spec is unchanged.
- Product-design/classifier regressions (33), status regressions (12) and the
  status-surface consistency check pass.

## Environment and recovery

macOS Chromium, local Node 26.7.0; hosted CI validates the pinned runtime. The
first full local run hit host disk pressure, and a concurrent browser run could
not create its artifact directory. Clearing only the disposable package download
cache restored capacity; the bounded rerun proves every timed-out unit case.
No source assertion, timeout or protection was weakened. One existing browser
sign-in case overlapped a Vite source reload; its trace records a second document
navigation before any sign-in request. The unchanged case passes after editing
stops. Independent successful cases were retained, and interrupted/affected work
was completed separately. No hosted workflow has been manually rerun.

Native CSS insets are simulated at 28 px; secure-native-session restoration uses
the existing synthetic bridge. No Android device, running emulator or installed
AVD is available. These browser results do not claim installed-device status-bar
acceptance, OS storage-pressure retention, or live backend/production acceptance.
The PR's hosted checks and actual Android product acceptance remain required
before claiming merge/release/device completion.

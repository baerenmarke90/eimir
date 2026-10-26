# Android test.14 — published 2026-10-26

Owner: #1331 / #1332. This prepares the existing private sideload channel; it
does not accept that draft foundation for main or certify public/store launch.

## Published artifact checkpoint

The complete immutable prerelease is available at
[android-test-v0.2.0-test.14](https://github.com/baerenmarke90/eimir/releases/tag/android-test-v0.2.0-test.14).
The APK source is `11a24139e372d5f97fc0d1fde276066f208c1123`; publication
orchestration is `e10c9e5448a47b954ef1f33f3d315470c34d72e9`,
[run 40337010184](https://github.com/baerenmarke90/eimir/actions/runs/40337010184).

- APK: `eimir-android-test-v0.2.0-test.14.apk`, **9,876,726 bytes**.
- SHA-256: `badc86ad1dfe59dc7db1a189254e0993694cc946c166cb20bb3651783aa1dcfc`.
- Both test.13 and test.14 actual signatures match the original certificate below;
  package remains `de.sidebyside.app`, with versionCode increasing from 13 to 14.
- All four draft assets were downloaded and compared before atomic publication.
  A later independent anonymous check downloaded all four public assets, matched
  their exact GitHub SHA-256 digests/byte counts, checked marker/checksum/APK binding
  and embedded clean-source, updater, regular origin and Demo-disabled identity.
- The immediate post-publication catalog read raced GitHub propagation and ended
  with `StopIteration`. The published bytes were retained. The reusable public
  verifier now retries only transient publication visibility within a bounded window;
  deterministic identity/hash failures remain fatal.

The owner explicitly authorized removing mandatory review only from
`android-test-release`; the exact existing channel branch allowlist is retained.
Future test releases use the [validated plan and unattended workflow](../ANDROID-TEST-UPDATES.md#unattended-github-test-delivery).
Physical-device update/data continuity, launcher appearance and OS App Links still
require the device acceptance listed below. Earlier preparation evidence is
retained in the following sections.

## Identity and source

| Contract | Candidate |
| --- | --- |
| Version name / code | `0.2.0-test.14` / `14` |
| Intended tag | `android-test-v0.2.0-test.14` |
| Package | `de.sidebyside.app` |
| Previous published APK | `android-test-v0.2.0-test.13`, versionCode 13 |
| Required certificate SHA-256 | `b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472` |
| Persistent API origin | `https://demo.eimir.ur-cloud.de` |
| Demo mode / reset timer | Both disabled |
| Source branch | `release/android-test.14-20261026` |

The branch integrates `main@18225f97cafde42523bca691ff0470d64029377f`,
including the merged #508 offline-browser contract repair, into the unpublished
`release/android-test.14-20261024` channel source (`c6ed91ee`). The build helper
embeds the full clean checkout SHA; the release must target that exact SHA.
Do not infer the APK source from main, an older test.14 build or these notes.

The candidate contains #1439 Daily Check-in ownership, #1440 private profile-note
context/reflow and #1441 all-eleven launcher-mask corrections. It also inherits
the shared selected-File array contract and the #1448 Cloud publisher repair.
It retains the test updater and shared identity intake. Do not include the
unrelated draft FCM candidate #1392 or migrate the installed package to
`de.eimir.app` (#1395).

## Earlier preparation boundary

At the source-preparation checkpoint, no signed APK or published update existed.
The original test signing environment was unavailable in the preparing workspace
and GitHub Actions had no configured release-keystore secrets.
No replacement key, debug signature, install marker or APK is fabricated.
The existing durable key must be supplied privately through the supported
environment; never commit it, attach it to an issue/release or put it here.

The main CI failure was a stale browser expectation: `assertOnlineWrite`
correctly prevents known-offline dispatch, but the old Wish case expected one
request. The repair asserts zero before/reconnect and one deliberate retry,
with a separate held-request transport-disconnect case. Runtime completion and
authorization contracts are unchanged. The bounded repair was merged through
[PR #1442](https://github.com/baerenmarke90/eimir/pull/1442). This Android source
preparation does not close the broader #508 acceptance work.

## Earlier preparation evidence (`9bce39fb`)

- #1442 head `68c64cced72ba4bd88066113b1a9d474fe41f093`: all 18 Wish
  completion browser scenarios passed without a retry in the
  [changed-spec job](https://github.com/baerenmarke90/eimir/actions/runs/40311285985/job/121532907413),
  including known-offline dispatch rejection and transport disconnect.
- The existing 37 Plan/Wish completion component regressions and 20 browser
  planner tests passed locally.
- On the integrated candidate: 12 release-producer/launcher/resource source
  tests, Capacitor foundation, token/PWA checks, Biome lint/format and the Vite
  production bundle passed. The audit gate reports no High/Critical findings;
  three existing moderate Capacitor CLI/xcode/uuid findings remain under #1393.
- Local Chromium installation is unavailable (invalid download), and TypeScript
  7 cannot resolve `/proc/self/exe` in this sandbox. Hosted checks supply those
  results; the Vite-only local build is not a substitute for typechecking.
- No new compiled/signed Android or physical-device acceptance is claimed.
  Historical native evidence stays bound to its original APK/source. Full
  integrated Web/Android checks and final signing checks remain required on the
  source selected for the release.

These results belong to the earlier candidate. The refreshed merge of
`main@18225f97` requires its own exact-head hosted checks before signing. A
successful Cloud publisher is separate from a signed APK and from a deployed
instance's Web/API revision smoke check.

## Refreshed source checks

- `TZ=UTC npm test`: 2,128 tests passed, one existing skip; 231 passing files.
- All 12 Android release-producer/launcher/resource source tests passed.
  The channel suite passed 24 cases; five Docker Compose cases require the
  hosted Docker environment.
- Capacitor foundation, tokens/PWA, TypeScript, production Vite build, Biome
  lint and formatting passed. Existing lint/build warnings remain unchanged.
- Hosted CI/browser/native resource checks must pass on the refreshed commit
  before signing. Local source checks do not establish signed assembly,
  same-signer installation, real-device behavior or Cloud rollout acceptance.

## Signing handoff

Use a clean checkout of the reviewed candidate, Java 21, Android SDK/build tools
36, and the existing protected `EIMIR_RELEASE_KEYSTORE`,
`EIMIR_RELEASE_KEYSTORE_PASSWORD`, `EIMIR_RELEASE_KEY_ALIAS` and
`EIMIR_RELEASE_KEY_PASSWORD` environment. Confirm the candidate's exact required
checks and browser result before signing. These commands produce local files
only:

```bash
git fetch origin
git switch --track origin/release/android-test.14-20261026
test -z "$(git status --porcelain)"
npm --prefix web ci --ignore-scripts --no-audit --no-fund

test14_dir="$(mktemp -d "${TMPDIR:-/tmp}/eimir-test14.XXXXXX")"
gh release download android-test-v0.2.0-test.13 \
  --repo baerenmarke90/eimir \
  --pattern eimir-android-test-v0.2.0-test.13.apk \
  --dir "$test14_dir/previous"

python3 scripts/android_test_release.py build \
  --version-name 0.2.0-test.14 --version-code 14 \
  --output-dir "$test14_dir/build"

python3 scripts/android_test_release.py package \
  --apk "$test14_dir/build/eimir-android-test-v0.2.0-test.14.apk" \
  --previous-apk "$test14_dir/previous/eimir-android-test-v0.2.0-test.13.apk" \
  --certificate-sha256 b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472 \
  --notes-file docs/releases/android-test-0.2.0-test.14-notes.txt \
  --output-dir "$test14_dir/release"
```

Packaging must verify both actual APK signatures, unchanged package, increasing
versionCode, source/mode metadata, native updater and non-debuggable state.
Do not use `--initial-release` for this update. An unsigned validation build is
not eligible for packaging or installation over the testers' existing app.

## Draft staging and remaining acceptance

Only after producing the verified signed bytes, create a draft prerelease at
`git rev-parse HEAD` and follow the corrected draft-first publication sequence in
[ANDROID-TEST-UPDATES.md](../ANDROID-TEST-UPDATES.md#public-release-assets).
Do not publish until all assets, source identity and downloaded draft bytes are
verified. No release-build workflow dispatch or live backend change is required
by this source preparation.

- Record APK hash, byte count, source SHA, signing fingerprint and exact test
  results in the bounded acceptance record before staging it.
- Recheck all eleven icon choices on home screen and app drawer after an
  in-place same-signer update; preserve session, selected Space and saved data.
- Verify #1375 warm/cold external-browser mail/invitation entry on the actual
  installed app. In-app parsing and source tests do not prove OS App Links.
- Exercise a denied/failed action and explicit retry, large text/Dark, Back and
  return, and offline/reconnect without silent submission.
- Keep API deployment identity separate: packaging current Web assets does not
  prove that the configured backend or a tester's installation has been updated.
- After authorized publication, verify the anonymous updater catalog and exact
  public asset bytes before claiming that test.14 is available in App Updates.

The broader #1307, #1375, #1331/#1332, #565 and #797 acceptance work remains with
its owners. No physical-device, live push or Cloud-launch acceptance is implied.

## Reuse, product and business review

Reuse the existing channel, Capacitor UI, build/package verifier, Android
installer and GitHub draft/immutable-release lifecycle. No provider, SDK,
permission, native/runtime code or product composition is added here. Existing
design references remain applicable. Official client maintenance stays Free/Core;
icon eligibility remains the existing Mixed/Premium classification with retained
saved cosmetics after expiry. No entitlement, quota, Cloud/Self-Hosted parity,
provider cost, retention, export or downgrade contract changes.

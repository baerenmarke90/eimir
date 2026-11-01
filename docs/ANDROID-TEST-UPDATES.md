# Temporary Android test channel

Owner: #1331. Scope: Philipp and his partner, using real registration, sign-in,
partner onboarding and everyday product flows before public release.

The only product UI remains `web/`, packaged by Capacitor. The test API origin is
`https://demo.eimir.ur-cloud.de`. **This is a regular persistent installation, not
public Demo mode.** Backend provisioning follows app preparation. Do not enable
Demo entry, reset timers, synthetic memberships or Premium overrides. Full
connected acceptance is pending until that installation exists.

## Native email entry for the private installation

The private installation uses the Cloud authentication policy to exercise
self-service registration with real SMTP; Cloud disables local passwords.
The initial `0.2.0-test.1` APK registered only the OIDC native callback, so it is
not the installation candidate for this Cloud mail flow. Use the higher-version
same-key `0.2.0-test.2` candidate with HTTPS email entry support instead.

The sideload manifest declares verified App Links only for the five existing
email-proof paths on `demo.eimir.ur-cloud.de`. React validates the configured HTTPS
origin, bounded token and exact allowed path, then passes the proof in memory to
the existing IdentityEntry consumer. The shared `useIdentityEntry` intake waits for session restoration and processes
a same-account invitation even when already signed in. A callback for a different
Account leaves the current session intact and revokes the newly issued session;
external callbacks wait in memory until protected drafts/saves close. It also
accepts the exact pre-upgrade signup invitation fragment. The obsolete separate
`nativeEntryLinks` listener has been removed. No token is
stored in history, native preferences or logs. Cold/warm delivery, duplicate and
late events use one subscription boundary. Browser authentication and the
existing OIDC callback remain independent.

The TLS proxy must serve `/.well-known/assetlinks.json` with HTTP 200, JSON content
type and the test certificate fingerprint recorded below. Configure Android's supported
links if the OS verifier has not enabled them. Actual OS verification and emailed
proof -> native session still require device acceptance; JavaScript bridge tests
do not establish them. See [email entry preflight](product/design/references/1331/native-email-entry.md).

## Build and signing identity

### Unattended GitHub test delivery

The sole writer workflow, `.github/workflows/release-publish.yml`, owns repeatable
Android test delivery. Its test jobs run automatically on pushes to the existing
allowlisted channel branch `release/android-test.14-20261026`. The branch name is
retained as an access boundary; subsequent test version numbers come from the plan,
not from that branch name. Product release and private Web/API publishing retain
their separate existing guards.

Configure the next test release by committing `.github/android-test-release.json`
on that branch after the intended APK source has passed its required checks:

```json
{
  "schemaVersion": 1,
  "sourceRevision": "<full checked 40-character commit SHA>",
  "versionName": "0.2.0-test.15",
  "versionCode": 15,
  "previousVersionName": "0.2.0-test.14",
  "notesFile": "docs/releases/android-test-0.2.0-test.15-notes.txt"
}
```

The notes file must already exist in the selected source. Use a strictly higher
versionCode and the corresponding `test.N` suffix. Never put credentials, keys,
arbitrary URLs or alternative signing identities in this plan. The package,
origin and original certificate stay fixed. Plan validation rejects unknown fields,
moving refs, unsafe notes paths, inconsistent versions and noninteger codes.

The owner explicitly authorized unattended publication on 2026-10-26. The
`android-test-release` Environment now has no required reviewer; its exact branch
allowlist and all four signing secrets remain in use. No production Environment
approval setting was changed. Do not broaden this allowlist implicitly.

For a new plan, the workflow checks the exact APK source, verifies the predecessor,
builds the unsigned validation variant, runs sideload lint and actual policy/catalog
JVM tests, confirms the original keystore certificate, signs the release APK and
verifies the actual package/signature/version/source identity. APK inspection uses
an SDK view containing **only build-tools 36.0.0**: a runner may also have 37 installed,
whose human-readable signer output is incompatible with the existing helper parser.

It then follows the draft-first/marker-last publication sequence below. Anonymous
verification downloads all four public files, checks GitHub asset digests and byte
counts, binds marker/checksum to the APK, and checks the embedded regular-mode source
identity. Only transient missing-publication/HTTP propagation responses are retried
within a 90-second retry window; deterministic identity or hash failures stop at once.

If an identical plan is already published, the unprivileged job verifies its immutable
public assets and completes without signing, rebuilding, rewriting or requesting
secrets. A conflicting/incomplete publication fails closed. This makes routine later
pushes and verification retries safe. A published APK is never replaced to fix a
verification race; real content corrections require a new higher version.

Only explicitly selected test releases are automated. This does not publish every
main commit as an Android APK, accept a draft foundation into main, or certify
physical-device upgrade/data continuity, OS App Links or public/store readiness.

### Local build and signing

Requirements: clean committed checkout, locked Web dependencies installed, Java
21, Android SDK 36 and build tools, Python 3, and the existing Gradle wrapper.
No release workflow dispatch is needed. Normal required PR CI remains intact.

Provide the durable signing environment through the existing protected mechanism:
`EIMIR_RELEASE_KEYSTORE`, `EIMIR_RELEASE_KEYSTORE_PASSWORD`,
`EIMIR_RELEASE_KEY_ALIAS` and `EIMIR_RELEASE_KEY_PASSWORD`. Never commit keys,
passwords, recovery files or signed APKs. The initial test key and its recovery
material are retained privately outside this repository. It is a test-channel
identity, not a decision about Play App Signing.

Public SHA-256 certificate fingerprint for this initial test channel:

```text
b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472
```

Package identity remains `de.sidebyside.app`. Do not reuse an RWN signing key or
silently replace the eimir. test key. Installing over a differently signed prior
APK will be rejected by Android; do not solve that by deleting user data.

```bash
python scripts/android_test_release.py build \
  --version-name 0.2.0-test.1 --version-code 1 \
  --output-dir /protected/artifacts/test-1

python scripts/android_test_release.py package \
  --apk /protected/artifacts/test-1/eimir-android-test-v0.2.0-test.1.apk \
  --certificate-sha256 "$EIMIR_TEST_CERTIFICATE_SHA256" \
  --notes-file /protected/artifacts/notes.txt \
  --initial-release \
  --output-dir /protected/artifacts/release-1
```

`build --unsigned` is only for local validation; its embedded `validationOnly`
flag makes it ineligible for packaging. Signed builds reject dirty checkouts.
The helper overrides inherited Demo variables and legacy aliases, writes the
origin/mode/source identity before Capacitor synchronization, and uses strict
dependency verification. `package` verifies the actual APK signature, package,
version, SDK, non-debuggable status, native adapter, install permission and build
identity before producing an update marker. It does not publish anything.

For every subsequent version, increase `versionCode` and replace
`--initial-release` with `--previous-apk /protected/artifacts/previous.apk`.
Packaging then requires the same certificate and package and a strictly greater
version code. Keep the original signing material available for the entire test.

Treat a build number as consumed once any signed APK with that number has been
shared or installed, including private or unpublished candidates. A corrected APK
needs a higher code even when the earlier APK never appeared in GitHub Releases.
Different source revisions with the same installed/published code are not offered
as upgrades; [test.15](releases/android-test-0.2.0-test.15.md) corrects that earlier
Build 14 distribution collision without weakening the updater's version policy.

## Public release assets

The native catalog reads the public `baerenmarke90/eimir` GitHub Releases list,
including prereleases. The channel is public distribution metadata; partner
content remains on the authenticated eimir. installation. No account token,
Space, content, device identifier or GitHub credential enters the updater.
GitHub still receives ordinary request/network metadata. Requests are bounded,
and automatic checks run on foreground/start at most once per six hours. Manual
checks can retry immediately. API throttling/offline is an actionable unavailable
state, never a false claim that the app is current.

Publication is an explicit separate operation. GitHub makes this repository's
published releases immutable, so the complete asset set must be assembled while
the release is still a draft:

1. Create a **draft prerelease** `android-test-vX.Y.Z-test.N` at the recorded
   source commit. Do not publish an empty release.
2. Upload the verified universal `eimir-android-test-vX.Y.Z-test.N.apk`,
   `SHA256SUMS` and bounded acceptance evidence to that draft.
3. Download the draft APK through authenticated asset access and compare its
   bytes with the verified local APK and checksum.
4. Upload **`eimir-test-update.json` last, while still a draft**. Download and
   verify its bytes, source revision and APK binding too.
5. After the required checks and release review, publish the complete draft
   atomically as a prerelease. Never try to append the marker after publication.
6. Fetch the anonymous public catalog and all assets, verify hashes and source
   identity, then perform the real A → B device acceptance below.

Do not edit/replace published bytes or weaken immutability to repair an
incomplete release. Publish a verified higher version instead. The source and
signing preparation for `0.2.0-test.14` is recorded in
[the test.14 handoff](releases/android-test-0.2.0-test.14.md).

An incomplete release without the marker is ignored. Invalid marked metadata
fails closed. The highest compatible version code in the bounded 30-release
catalog wins; do not bury the active test channel below 30 newer unrelated
releases. No eligible marker is shown as “no test version published”, distinct
from “current”. Local package generation or an APK attachment does not establish
that the public feed has been published or that native installation works.

## Native boundary and removal

Only `android/app/src/sideload/` owns transport, package inspection, cache files,
FileProvider and `REQUEST_INSTALL_PACKAGES`. Ordinary release/debug builds have
the compile-time capability disabled. The Web entry additionally requires
`VITE_EIMIR_TEST_UPDATES=true`, Android and the registered native plugin. The
ordinary Web/store build leaves it false; the route redirects to Settings when
unavailable. There is no alternate product UI, arbitrary URL/install API or
remote code/live-Web update system.

Downloads use private cache files, size/time limits, allowlisted HTTPS redirects
and SHA-256. Before each installer handoff the native code rechecks the actual
file's package, higher version code, SDK, ABI and current installed signer set.
The Android installer supplies final APK signature enforcement and confirmation.
Returning from unknown-source permission settings does not install anything;
another explicit Install action is required. Cancellation and process teardown
stop transport; the next process removes previous partial/ready files.

To stop using the updater, build ordinary `release` with
`VITE_EIMIR_TEST_UPDATES=false`. Publish a higher version code with compatible
signing if an in-place transition is intended. Verify the APK/AAB excludes the
updater class, provider and permission, and check real-device data continuity.
The isolated source set, adapter, settings destination and helper can then be
deleted without changing product data or backend schemas. A transition to Play
requires an explicit app-signing identity decision; an upload key alone does not
establish continuity.

## Verification and remaining acceptance

Automated evidence and screenshots:
[implementation evidence](product/design/references/1331/evidence/README.md).

```bash
python -m unittest discover -s scripts -p test_android_test_release.py -v
cd android
./gradlew --dependency-verification strict \
  :app:testSideloadUnitTest :app:lintSideload :app:assembleSideload :app:assembleRelease
```

These checks establish policy/parser behavior, shared-UI interactions, build
viability and exclusion boundaries. They do not replace the following:

- [ ] Deploy the persistent regular test installation with production-style
  mail delivery and registration configuration for the two testers; test real
  confirmation/recovery links, TLS, backup/restore and restart persistence.
- [ ] Install A on a real Android device; register both accounts, create/join the
  same Space and save representative everyday content.
- [ ] Publish B with the same certificate and a higher code; discover it from A,
  cancel/retry the download, grant source permission and deliberately install.
- [ ] Confirm B starts, reports its new version, and retains session, Space and
  saved content. Exercise denied permission, offline, installer cancellation,
  corruption, wrong signer, wrong package and downgrade rejection.
- [ ] Exercise screen reader, increased system text, background/rotation and
  process death on the supported Android devices.
- [ ] Prove the updater-free higher-version transition preserves the same data.

No physical-device acceptance, public test-release publication, backend
deployment or public/store readiness is claimed by this change. Unrelated
UnifiedPush #1271 device gates remain separate.

---
name: android-test-release
description: Build and publish the next eimir. Android test release (prerelease tag android-test-v0.2.0-test.N) from current main. Use when the Product Owner asks for a new Android test release, test build or test APK, in any language (for example "neues Testrelease"). The APK is built, signed and published by GitHub Actions; no local signing key is needed.
---

# Android test release

Test releases are produced by `.github/workflows/release-publish.yml` on the
release branch `release/android-test.14-20261026` (jobs
`android-test-preflight` and `android-test-publish`). Every push to that
branch runs them; the preflight reads `.github/android-test-release.json`
(validated by `scripts/android_test_release_plan.py`) and publishes when it
names a new, consistent test version. The test
signing keystore lives as a secret in the GitHub Environment
`android-test-release`; never look for, create or use a local keystore for
this flow, and never ask for signing passwords.

## Preconditions

- The Product Owner asked for the release. Publishing is outward-facing.
- `main` CI is green on the revision you will ship. If it is not, report the
  failing checks and stop.
- `gh` is authenticated with `repo` and `workflow` scopes.

## Steps

1. **Determine N.** List releases with `gh release list` and take the highest
   `android-test-v0.2.0-test.<n>` tag; N = n + 1. Read the current
   `.github/android-test-release.json` on the release branch; its
   `versionName` must be `0.2.0-test.<n>`.
2. **Integrate main.** In a separate worktree of
   `release/android-test.14-20261026`, merge `origin/main` with the commit
   message `build(android): integrate current main for test.N`. Add
   `docs/releases/android-test-0.2.0-test.N-notes.txt` in the same commit:

   ```text
   eimir. Android 0.2.0-test.N

   - <user-facing change since test.N-1, one line each, English>

   The product changes come from main at <full main SHA>.
   Install over test.N-1 with the same de.eimir.app package, signing certificate and test server. This build uses versionCode N.
   ```

   Derive the bullets from the PRs merged into `main` since the previous
   test release's source (`git log --merges <previous main SHA>..origin/main`).
   Describe what changed for the couple; leave out tests and tooling.
3. **Publish.** In a second commit,
   `build(android): publish verified test.N from current main`, update
   `.github/android-test-release.json`:

   ```json
   {
     "schemaVersion": 1,
     "sourceRevision": "<SHA of the integrate commit from step 2>",
     "versionName": "0.2.0-test.N",
     "versionCode": N,
     "previousVersionName": "0.2.0-test.<N-1>",
     "notesFile": "docs/releases/android-test-0.2.0-test.N-notes.txt"
   }
   ```

   Push the branch (never force-push).
4. **Verify.** Wait for the `release-publish` run on the branch and confirm:
   - the run succeeded;
   - the prerelease `android-test-v0.2.0-test.N` exists;
   - it has the assets `eimir-android-test-v0.2.0-test.N.apk`,
     `eimir-test-update.json`, `native-acceptance.md` and `SHA256SUMS`.

   If a job fails, diagnose it from its logs before any retry (see
   `AGENTS.md`, CI retry policy).
5. **Report.** Give the release link, the workflow run link, the shipped
   `main` SHA and the release notes. Device acceptance on the Product Owner's
   phone remains outstanding until they confirm it.

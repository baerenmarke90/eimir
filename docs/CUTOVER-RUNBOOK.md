# Repository cut-over runbook (Decision 0019)

**Status:** working runbook for the cut-over of [Decision 0019](decisions/0019-repository-split-and-cutover.md);
not a decision record. Where this runbook and Decision 0019 disagree, the decision wins and this runbook is corrected.  
**Owning issue:** [#2183](https://github.com/baerenmarke90/eimir/issues/2183) (stays open until the old repository is
archived)  
**Related:** [#2182](https://github.com/baerenmarke90/eimir/issues/2182) (Phase 2 relocation),
[#2202](https://github.com/baerenmarke90/eimir/issues/2202) (private image packages),
[#2090](https://github.com/baerenmarke90/eimir/issues/2090) (repository visibility),
[Decision 0017](decisions/0017-pro-plugin-seam.md) (Pro plugin seam),
[Private test channel](PRIVATE-TEST-CHANNEL.md), [Arcane](ARCANE.md),
[Development and release environments](DEVELOPMENT-AND-RELEASE-ENVIRONMENTS.md)  
**Baseline:** `main` at `fc487472a` on November 25, 2026. Re-read every fact marked "verified" on the day it is used;
repository state, open pull requests and issue counts move.

## 0. Scope, names and roles

The Product Owner decided on November 25, 2026 (recorded in the November 25 addendum of Decision 0019, pull request
[#2286](https://github.com/baerenmarke90/eimir/pull/2286), not yet merged when this runbook was written):

| Item | Value |
| --- | --- |
| Public Core repository | `baerenmarke90/eimir-core` (fresh single-commit history) |
| Private Pro and release repository | `baerenmarke90/eimir-pro` (proprietary, all rights reserved, no CLA) |
| Old repository | `baerenmarke90/eimir`, renamed `eimir-archive`, set private and archived, never deleted |
| Private image packages | `ghcr.io/baerenmarke90/eimir-cloud-backend`, `eimir-cloud-web`, `eimir-cloud-media` (unchanged) |
| OpenAPI contract | the full contract, including Pro routes, is checked in publicly in `eimir-core` |
| Android sideload channel | ends with the first public Google Play release; until then it must survive the cut-over |
| Open issues | re-created in the new repositories |
| Open pull requests | re-created from patches in the new repositories (or merged or closed before the day) |
| Old history | backed up with `git bundle` before archiving |
| Operator runner | may serve `eimir-pro` only, never `eimir-core`, never fork pull requests; signing, publishing and attestation stay on GitHub-hosted runners |

**Target:** cut-over on **Tuesday, December 1, 2026**; **Wednesday, December 2, 2026** is the buffer. Nothing in this
runbook authorizes a merge, a publication, a deletion or a settings change by itself; each needs the Product Owner's
approval at the step where it happens.

Roles used below:

- **PO**: the Product Owner. Owns every console action in GitHub, Arcane, Google Play and Firebase, enters every
  secret, approves every merge, publication, visibility change and deletion, and performs all device checks on the
  phones. Agents never enter passwords, tokens or keys, and never use the phone without an explicit device-test request.
- **Coordinator**: the coordinating Claude session for this cut-over. Keeps this runbook current, verifies each gate
  against GitHub, runs read-only `gh`/`git` commands and, after the PO's explicit go for that step, the non-secret
  `gh` commands listed below.
- **Implementation sessions**: sessions that write code or documentation for one work item (export tool,
  secret scan, pipeline adaptations, Android bridge build). They open pull requests; they never merge.

## 1. Verified starting point (November 25, 2026)

These facts were read from the repository and GitHub on November 25, 2026. They drive the steps below.

| Area | Verified state | Source |
| --- | --- | --- |
| Branch rules | One ruleset `main` (id 21286018): no deletion, no force push, pull request required (0 approvals), ten required checks: `Secret Scan`, `Backend`, `Supply Chain`, `Provenance`, `API Clients`, `Backend Integration`, `Self-Hosted Start`, `Network and Port Guard`, `Reuse Review`, `Web Reference Flow` (GitHub Actions app id 15368). No classic branch protection. | `gh api repos/baerenmarke90/eimir/rulesets/21286018` |
| Repository settings | Public; auto-merge off; branches deleted on merge; squash, merge and rebase allowed; no wiki, no discussions; secret scanning and Dependabot security updates **off**; immutable releases **on**. | `gh api repos/baerenmarke90/eimir`, `.../immutable-releases` |
| Actions settings | All actions allowed, SHA pinning not required, default `GITHUB_TOKEN` permission **write**, Actions cannot approve reviews, fork pull requests from all external contributors need approval. | `gh api .../actions/permissions`, `.../workflow`, `.../fork-pr-contributor-approval` |
| Self-hosted runners | None registered on the repository. `ci.yml` (`Secret Scan`) can route same-repository pull requests to label `eimir-kvm-pr`; the variable `EIMIR_PR_RUNNER=github-hosted` keeps it on GitHub-hosted runners. | `gh api .../actions/runners`, `.github/workflows/ci.yml` |
| Actions variables | `EIMIR_PR_RUNNER`, `EIMIR_TEST_CHANNEL_ENABLED=true`, `EIMIR_TEST_CHANNEL_PACKAGE_PREFIX=eimir-cloud`, `EIMIR_TEST_CHANNEL_PROMOTE=true`. | `gh variable list` |
| Secrets (names only) | Repository: `EIMIR_ANDROID_GOOGLE_SERVICES_JSON`. Environment `android-test-release` (deployment branch policy): `EIMIR_RELEASE_KEYSTORE_BASE64`, `EIMIR_RELEASE_KEYSTORE_PASSWORD`, `EIMIR_RELEASE_KEY_ALIAS`, `EIMIR_RELEASE_KEY_PASSWORD`. Environment `production-release` (required reviewers): no secrets. GitHub secrets cannot be read back, so every value must come from the PO's own offline copy or its original source. | `gh secret list`, `gh api .../environments` |
| Dependabot | `.github/dependabot.yml` (uv, Docker and further ecosystems, Mondays). | file |
| Packages | Public `eimir-backend`, `eimir-web`, `eimir-media` linked to `baerenmarke90/eimir`; the private `eimir-cloud-*` packages are not listed without a `read:packages` token, so their repository link was not checked here. | `gh api users/baerenmarke90/packages?package_type=container` |
| Releases | Android prereleases up to `android-test-v0.2.0-test.103` (2026-11-24); product releases `v0.1.0` to `v0.1.2`. | `gh release list` |
| Open issues | 87 open issues, 18 labels. | `gh issue list`, `gh label list` |
| Branches | 28 branches on the remote, including `deploy/eimir-test`, `deploy/eimir-test-rollback` and the Android release branch `release/android-test.14-20261026`. | `git ls-remote` |
| Test channel | `.github/workflows/release-publish.yml` job `test-checked-main` runs only when `github.repository == 'baerenmarke90/eimir'`; `scripts/test_deployment_channel.py` has `REPOSITORY = "baerenmarke90/eimir"`. Arcane Git Sync reads `https://github.com/baerenmarke90/eimir.git`, branch `deploy/eimir-test`, without a credential. | files, [Private test channel](PRIVATE-TEST-CHANNEL.md#connect-arcane-once) |
| Android updater | On the release branch, `UpdatePolicy.REPOSITORY = "baerenmarke90/eimir"`; the feed is the anonymous `https://github.com/baerenmarke90/eimir/releases.atom`; downloads are allowed only from `github.com`, `release-assets.githubusercontent.com` and `objects.githubusercontent.com`. Every installed test APK carries this address. | `android/app/src/sideload/java/de/eimir/app/updates/UpdatePolicy.java` on `release/android-test.14-20261026` |
| Status tooling | `tools/ci/status_drift.py --online` (step of the required `Reuse Review` check) resolves every unchecked `- [ ] ... #N` line of `docs/IMPLEMENTATION-STATUS.md` (13 such lines) against `GITHUB_REPOSITORY` and fails when an issue cannot be read. In a new repository those numbers point at the wrong issues or at nothing. | `tools/ci/status_drift.py`, `.github/workflows/reuse-review.yml` |
| Licence and provenance check | The required `Provenance` check requires `PROVENANCE.md`, `LICENSE` (PolyForm Noncommercial 1.0.0), `COMMERCIAL-LICENSE.md`, `CONTRIBUTING.md`, `CLA.md`, `TRADEMARKS.md` and four documents. `PROVENANCE.md` sections "Date-idea catalog and images" and "Daily Saying catalog" describe Pro assets under `backend/pro/`. | `.github/workflows/ci.yml` job `provenance`, `PROVENANCE.md` |
| Extraction dry run | `Pro extraction dry run` (`tools/ci/pro_extraction_dry_run.sh`) installs `backend/pro` from a clean copy on top of a Core wheel; not a required check. | `.github/workflows/ci.yml` |
| App Links | The Android manifest verifies HTTPS App Links for `app.eimir.de` and the transition host `demo.eimir.ur-cloud.de`. `assetlinks.json` is not part of this repository; it is served on those hosts and depends only on the package name and the signing certificate. | `docs/CAPACITOR-ANDROID-FOUNDATION.md`, `android/app/src/main/AndroidManifest.xml` |
| Google Play | The app entry `de.eimir.app` exists in Play Console; no upload key, bundle, subscription or Google Cloud link is set up. The upload key is planned for the `production-release` environment. | [Google Play Billing](operations/google-play-billing.md) |
| Hard-coded repository identity | `web/capacitor.config.ts`, `backend/src/eimir/providers/photon.py` and `place_search.py` (User-Agent contact URL), `backend/src/eimir/demo/assets.py` (`ORIGINAL_SOURCE_PATH_PREFIX`), `backend/pro/src/eimir_pro/photo_sources/google_setup.py` (issue link), `.github/workflows/self-hosted-deployment-guard.yml` (Git build contexts), the two lines above, and test fixtures. | `grep -rn baerenmarke90/eimir` |

## 2. Day-by-day plan

Each day ends with the Coordinator recording the state of its gate in #2183 (and, after the cut-over, in the
re-created tracker). A gate that is not green moves everything after it; the target date moves before any gate is
weakened.

| Day | Date | Work (owner) | Depends on | Gate at the end of the day |
| --- | --- | --- | --- | --- |
| D-6 | Wed 2026-11-25 | This runbook ([#2183](https://github.com/baerenmarke90/eimir/issues/2183)), Decision 0019 addendum ([#2286](https://github.com/baerenmarke90/eimir/pull/2286)), Core lifecycle tests without Pro ([#2285](https://github.com/baerenmarke90/eimir/pull/2285)) (implementation sessions). Export tool under `tools/cutover/` started (implementation session). Secret scan over all refs started (implementation session). PO reads the decisions table in section 8. | Decision 0019 | **G0:** PO answered the decisions in section 8 or accepted the recommendations. |
| D-5 | Thu 2026-11-26 | Export tool pull request ready for review (allow-list, the three export gates, a manifest of exported paths). Secret scan findings handed to the PO as a rotation list (section 3, step C2). Pipeline adaptation pull requests drafted (section 6.1). Android bridge pull request on the release branch drafted (section 3, step C17). PO confirms that an offline copy of the Android test signing keystore and its three passwords exists. | G0 | **G1 (readiness):** export tool green on `main`; rotation list complete; keystore copy confirmed. **No keystore copy means no-go** for the Android part (section 7). |
| D-4 | Fri 2026-11-27 | **Freeze** of changes to existing Pro functions once the active Pro-worlds work has merged (PO announces it). After the freeze, Pro changes wait for `eimir-pro`. PO merges the pull requests chosen for "merge before snapshot" (section 4). Rehearsal run 1 in throwaway private repositories (section 5) by the Coordinator and implementation sessions; PO performs the console steps. | G1 | **G2 (freeze):** Pro freeze announced; the "merge before" pull requests are merged or re-classified. |
| D-3 | Sat 2026-11-28 | Fix rehearsal findings in the pipeline pull requests (implementation sessions). Secret rotation by the PO for every real secret on the list. | Rehearsal run 1 | Findings listed with owners; rotation done or each remaining item has a reason. |
| D-2 | Sun 2026-11-29 | Rehearsal run 2 with the fixes, from a fresh export of current `main` (section 5). PO merges the pipeline and bridge pull requests after green checks. | Fixes | **G3 (rehearsal):** every item of section 5.3 green in one run. |
| D-1 | Mon 2026-11-30 | Android bridge release published from the old repository (section 3, step C17); PO installs it on both phones through the in-app updater. Final open-pull-request decisions (section 4). Issue mapping file reviewed by the PO (section 3, step C9). Last full nightly regression green on the `main` revision that becomes the snapshot. | G3 | **G4 (go/no-go for D0):** bridge installed on both phones (or the PO accepts a manual reinstall), snapshot revision chosen, rollback owners named. |
| D0 | **Tue 2026-12-01** | Cut-over checklist, section 3, in order (PO and Coordinator). | G4 | **G5 (done):** a trivial pull request is green in each new repository; the test channel advanced `eimir-test` from `eimir-pro`; the first test APK from the new location is found by the phones. |
| D+1 | Wed 2026-12-02 | Buffer for anything of D0 that slipped. Runner registration on `eimir-pro` (section 3, step C23), if the runner VM is ready. First nightly regression in `eimir-core`. Hand-over note in the tracker. | G5 | Remaining items listed with owners; phase 4 retirement not before 7 days of healthy operation. |

Ongoing after D+1: Dependabot's first Monday run (December 7, 2026) is checked in both repositories; old public
artifacts are retired one at a time only after the PO's separate approval (Decision 0019, phase 4).

## 3. Cut-over day checklist (D0)

Run the steps in this order. Every step lists the action, who does it, how it is verified and how it is rolled back.
`O` stands for `baerenmarke90`. Write the start and end time and the result of every step into the tracker as you go.
If a step fails and its rollback is not trivial, stop and use section 7.

### Block A: freeze the old repository

**C1. Announce the freeze and stop writers in the old repository.**

- Action (PO, after the go): no further merges to `O/eimir`. Set `EIMIR_TEST_CHANNEL_ENABLED=false` so that no publisher
  run writes `deploy/eimir-test` while the source moves:

  ```sh
  gh variable set EIMIR_TEST_CHANNEL_ENABLED --repo O/eimir --body false
  gh run list --repo O/eimir --status in_progress
  ```

  Wait until no `Publish Immutable Release` or nightly run is in progress (do not cancel another contributor's run).
- Verify: `gh run list --repo O/eimir --status in_progress` is empty; `git ls-remote origin refs/heads/main` returns the
  snapshot revision chosen at G4.
- Rollback: set the variable back to `true`.

**C2. Hand over the secrets rotation list.**

- Action (implementation session `cutover-b-secrets` to the PO): the list of real secrets found by the scan over all
  refs, each with the service, where it is used and the rotation status. Its content is not part of this runbook.
- Verify (PO): every real secret is rotated or explicitly accepted with a reason; the list names the new storage place
  of each value (`eimir-pro` environment, Arcane, operator host). No value appears in an issue, pull request or chat.
- Rollback: none needed; an unrotated real secret is an abort criterion (section 7).

**C3. Back up the complete old history.**

- Action (PO, on the local machine; the Coordinator may run it after the go):

  ```sh
  git clone --mirror https://github.com/O/eimir.git eimir-mirror.git
  cd eimir-mirror.git
  git bundle create ../eimir-archive-2026-12-01.bundle --all
  git bundle verify ../eimir-archive-2026-12-01.bundle
  git for-each-ref | wc -l
  git bundle list-heads ../eimir-archive-2026-12-01.bundle | wc -l
  sha256sum ../eimir-archive-2026-12-01.bundle
  ```

  Also export the work record that Git does not hold, as a second copy next to the archive repository:

  ```sh
  gh issue list --repo O/eimir --state all --limit 5000 \
    --json number,title,state,labels,body,comments,createdAt,closedAt > eimir-issues.json
  gh pr list --repo O/eimir --state all --limit 5000 \
    --json number,title,state,body,headRefName,baseRefName,mergeCommit,createdAt > eimir-pulls.json
  ```

  Keep the bundle, its SHA-256 and the two JSON files in two places the PO controls (for example the encrypted local
  disk and an offline medium). Never upload them to a third-party service.
- Verify: `git bundle verify` reports that the bundle is okay; both ref counts are equal; a test clone
  `git clone eimir-archive-2026-12-01.bundle check` checks out `main` at the snapshot revision.
- Rollback: delete and repeat; nothing remote changed.

### Block B: create the two repositories

**C4. Create the repositories.** `eimir-core` is created **private** first and made public only in step C8, after its
content has been checked. A wrong export pushed to a private repository is not a publication.

- Action (PO, or Coordinator after the go):

  ```sh
  gh repo create O/eimir-core --private --disable-wiki \
    --description "eimir. Core: Web client, Android wrapper, Core backend and deployment"
  gh repo create O/eimir-pro --private --disable-wiki \
    --description "eimir. Pro server package, editorial content and release pipeline (proprietary)"
  ```

- Verify: `gh repo view O/eimir-core --json visibility` and the same for `eimir-pro` show `PRIVATE`; both are empty.
- Rollback: `gh repo delete O/eimir-core --yes` (needs the `delete_repo` scope; PO only). Never create a repository
  named `eimir`: it would break the redirect from the old name.

**C5. Repository settings (both repositories).** Mirror today's settings unless a line says otherwise.

| Setting | `eimir-core` | `eimir-pro` | Command or console path |
| --- | --- | --- | --- |
| Merge options, auto-merge, branch deletion | as today: squash, merge and rebase; auto-merge off; delete branches on merge | same | `gh repo edit O/<repo> --enable-auto-merge=false --delete-branch-on-merge --enable-squash-merge --enable-merge-commit --enable-rebase-merge` |
| Issues, projects, wiki, discussions | issues on; wiki and discussions off | same | `gh repo edit O/<repo> --enable-issues --enable-wiki=false --enable-discussions=false` |
| Immutable releases | on (as today) | on | Settings, General, Releases ("Enable release immutability") |
| Actions allowed | all actions (as today) | all actions | `gh api -X PUT repos/O/<repo>/actions/permissions -F enabled=true -f allowed_actions=all` |
| Default `GITHUB_TOKEN` permission | **read** (recommended; today write), proven in rehearsal; fall back to write only if the rehearsal shows a job that relies on it | **read**, same rule | `gh api -X PUT repos/O/<repo>/actions/permissions/workflow -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false` |
| Fork pull requests | approval for all external contributors (as today) | **no workflows from fork pull requests**; forking off | core: `gh api -X PUT repos/O/eimir-core/actions/permissions/fork-pr-contributor-approval -f approval_policy=all_external_contributors`; pro: Settings, Actions, General, "Fork pull request workflows in private repositories": leave every box unchecked; Settings, General: "Allow forking" off |
| Self-hosted runners | **none, ever** (Decision 0019 addendum); set `EIMIR_PR_RUNNER=github-hosted` until the `eimir-kvm-pr` routing is removed from `ci.yml` | operator runner allowed after step C23, never for signing, publishing or attestation jobs | `gh variable set EIMIR_PR_RUNNER --repo O/eimir-core --body github-hosted` |
| Dependabot | `.github/dependabot.yml` from the snapshot; alerts and security updates **on** | Dependabot file of the Pro pipeline; alerts on | `gh api -X PUT repos/O/<repo>/vulnerability-alerts` and `gh api -X PUT repos/O/<repo>/automated-security-fixes` |
| Secret scanning and push protection | **on** (free for public repositories; recommended although off today) | expected to be unavailable on a personal private repository (check the settings page); the `Secret Scan` job (gitleaks) is the control in any case | Settings, Advanced Security, Secret Protection |
| Code scanning | `codeql.yml` from the snapshot, unchanged | **not available** on a personal private repository, and the CodeQL CLI terms do not cover a non-open-source private codebase; do not run it there (section 8, item D5) | none |
| Private vulnerability reporting | on (public repositories only) | not applicable | Settings, Advanced Security |
| Environments | none | `android-test-release` (deployment branch policy: the Android release branch only) and `production-release`; required reviewers are not available on a personal private repository, so `production-release` relies on the workflow's explicit confirmation input | Settings, Environments |

- Verify: `gh api repos/O/<repo>` and the endpoints above return the values in the table; record them in the tracker.
- Rollback: set the previous value; settings have no side effects while the repositories are empty.

**C6. Push the single-commit snapshots.**

- Action (Coordinator after the go; the export tool's README is the authority for its exact command line): run the
  export tool under `tools/cutover/` on the snapshot revision chosen at G4 for the Core target and for the Pro
  target. It writes the allow-listed tree and the manifest of exported paths and runs its gates (no Pro import in Core,
  Core-only start, no Pro-only package data in Core). Then, for each target directory:

  ```sh
  git init -b main
  git add -A
  git commit -m "Initial snapshot from O/eimir-archive at <full snapshot SHA>"
  git remote add origin https://github.com/O/eimir-core.git   # eimir-pro for the Pro tree
  git push -u origin main
  ```

  Commit as the PO's identity. Do not push any other branch or tag.
- Verify: the export gates passed for this exact revision; `git ls-tree -r --name-only HEAD | wc -l` equals the
  manifest count; `git log --oneline | wc -l` is 1; gitleaks over the new repository is clean
  (`docker run --rm -v "$PWD:/repo" -w /repo zricethezav/gitleaks:v8.24.3 detect --source . --redact --exit-code 1`);
  the Core tree has no `backend/pro/` and no Pro package data (date-idea catalog and images, `daily_sayings.json`).
- Rollback: while `eimir-core` is still private, delete and recreate it, or force-push a corrected snapshot (allowed
  only before the ruleset of C7 exists and before C8).

**C7. Rulesets with the required checks.** Created after the snapshot push, because the initial push is a direct push
to `main`.

- Action (Coordinator after the go): copy today's ruleset and adjust the check list.

  ```sh
  gh api repos/O/eimir/rulesets/21286018 \
    --jq '{name, target, enforcement, conditions, rules, bypass_actors}' > ruleset-main.json
  gh api -X POST repos/O/eimir-core/rulesets --input ruleset-main.json
  ```

  `eimir-core` requires today's ten check names. `eimir-pro` gets the same rule types but only the check names its own
  CI produces (recorded in the rehearsal, section 5.3); a required check that never reports blocks every merge, so
  edit the `required_status_checks` list before posting it.
- Verify: `gh api repos/O/<repo>/rulesets` lists the ruleset as `active`; a direct push to `main` is refused.
- Rollback: `gh api -X DELETE repos/O/<repo>/rulesets/<id>` and repost a corrected file.

**C8. Make `eimir-core` public.**

- Action (PO): only after C6 verification and a green CI run on the snapshot commit while the repository is still
  private (dispatch `ci.yml` on `main`, or open the trivial pull request of C21 early):

  ```sh
  gh repo edit O/eimir-core --visibility public --accept-visibility-change-consequences
  ```

- Verify: an anonymous `git clone https://github.com/O/eimir-core.git` works; `gh repo view O/eimir-core --json
  visibility` shows `PUBLIC`; secret scanning and private vulnerability reporting are on (C5).
- Rollback: a visibility change back to private is possible, but anything public for a moment is published. If Pro
  content became public, treat it as an incident (section 7).

### Block C: work record

**C9. Re-create the open issues.** The PO decided on re-creation. Transfer was considered:

| | Transfer (`gh issue transfer`) | Re-creation (decided) |
| --- | --- | --- |
| Allowed | only between repositories of the same owner; never from a private to a public repository | always |
| Keeps | comments, assignees; labels and milestones only when the target has matching names (milestones: name and due date); the old URL redirects to the new issue | title, body, labels and project membership that the script sets; the old issue stays where it is |
| Loses | the issue disappears from the archive, so the work record there becomes incomplete; repository projects | the comment thread (it stays in the archive and is linked) |
| Numbering | the issue gets the next number in the target repository | the issue gets the next number in the target repository |

Numbers restart in each new repository, and pull requests share the number space with issues. A bare `#N` in a new
repository therefore means a new issue. Links to old items use `O/eimir-archive#N` (before the rename,
`O/eimir#N` redirects there).

- Action:
  1. Before D0 (D-1, PO review): a mapping file lists every open issue with its target (`core`, `pro` or `close`),
     created from `gh issue list --repo O/eimir --state open --limit 500 --json number,title,labels`. Pro feature and
     Pro content issues go to `eimir-pro`; everything else to `eimir-core`. Issues that only concern the cut-over itself
     go to `eimir-pro`.
  2. On D0, copy the labels: `gh label clone O/eimir --repo O/eimir-core` and the same for `eimir-pro`.
  3. Re-create the tracker issue first, then the rest in ascending old number. Each body starts with
     `Re-created from O/eimir-archive#N` and keeps the original body. Example:

     ```sh
     gh issue view N --repo O/eimir --json title,body,labels > issue-N.json
     gh issue create --repo O/eimir-core --title "<title>" --body-file body-N.md --label "<labels>"
     ```

  4. Comment on each old issue with the new link (`Continued in O/eimir-core#M`). Close the old issue as not planned,
     except #2183, #2182, #2202 and #2090, which stay open in the archive with the pointer comment (their scope ends
     with the archive step).
  5. Add each re-created issue to user Project 1 where the old one was there:
     `gh project item-add 1 --owner O --url <new issue URL>`.
- Verify: the number of re-created issues equals the mapping rows marked `core` or `pro`; every old open issue has a
  pointer comment; the mapping file with old and new numbers is attached to the tracker in `eimir-pro`.
- Rollback: re-created issues can be closed or deleted by the PO; old issues can be reopened. Nothing is lost because
  the archive keeps the originals.

**C10. Open pull requests.** Section 4 lists every open pull request with a proposal; the PO decides each one at G4.
"Re-create from patch" means:

```sh
gh pr diff N --repo O/eimir --patch > pr-N.patch
# in a clone of the target repository, on a new branch:
git apply --3way pr-N.patch   # paths may need the export tool's path mapping first
```

The new pull request body starts with `Re-created from O/eimir-archive#N`, fills the target repository's gates and
is a draft until its checks are green. The old pull request is closed with a pointer comment before the archive step.

- Verify: every open pull request of the old repository is closed with a pointer, merged before the snapshot, or
  explicitly left (#1443 until step C17 has moved the release flow).
- Rollback: reopen the old pull request; the patch file stays in the tracker.

### Block D: the old repository

**C11. Set the old repository private, rename it and archive it.** Only after C3 (bundle), C6 and C8 (both new
repositories exist with content), C9 and C10, and after the bridge release of C17 is installed (G4).

- Action (PO):

  ```sh
  gh repo edit O/eimir --visibility private --accept-visibility-change-consequences
  gh repo rename eimir-archive --repo O/eimir --yes
  gh repo archive O/eimir-archive --yes
  ```

  Update local clones and worktrees: `git remote set-url origin https://github.com/O/eimir-core.git` (or `eimir-pro`).
  A push to the archive is refused from now on, which is the intended guard.
- Verify: `gh repo view O/eimir-archive --json visibility,isArchived` shows `PRIVATE` and `true`;
  `https://github.com/O/eimir` redirects to `eimir-archive` for the PO and returns 404 anonymously.
- Rollback: `gh repo unarchive O/eimir-archive --yes`, `gh repo rename eimir --repo O/eimir-archive --yes`, and set it
  public again only if the whole cut-over is abandoned (section 7).

**C12. Packages.**

- Action (PO): for each private package `eimir-cloud-backend`, `eimir-cloud-web`, `eimir-cloud-media`: package
  settings, Manage Actions access, add repository `eimir-pro` with the Write role. Do not change any package's
  visibility. The old public packages `eimir-backend`, `eimir-web`, `eimir-media` stay untouched: no deletion without a
  separate PO approval per package, after at least 7 days of healthy operation on the replacements (Decision 0019,
  phase 4; [Private test channel](PRIVATE-TEST-CHANNEL.md#switch-procedure-for-a-new-package-name-each-step-needs-the-product-owners-approval)).
- Verify: the first `eimir-pro` publisher run (C15) pushes to all three packages and its anonymous privacy check
  reports 401, 403 or 404 for every digest.
- Rollback: remove the repository from the package's Actions access.

### Block E: deployment and release channels

**C13. Seed the deployment branches in `eimir-pro`.** The test instance must see the identical commit after the
switch, so the switch itself redeploys nothing.

- Action (Coordinator after the go), from a clone of the old repository (before C11) or the bundle:

  ```sh
  git push https://github.com/O/eimir-pro.git \
    refs/remotes/origin/deploy/eimir-test:refs/heads/deploy/eimir-test \
    refs/remotes/origin/deploy/eimir-test-rollback:refs/heads/deploy/eimir-test-rollback
  ```

- Verify: `git ls-remote https://github.com/O/eimir-pro.git 'refs/heads/deploy/*'` shows the same SHAs as the old
  repository had.
- Rollback: delete the two branches in `eimir-pro`.

**C14. Re-point Arcane.**

- Action (PO, in Arcane): create an SSH key pair for the Git Sync; add the public key in `eimir-pro`, Settings, Deploy
  keys, **read-only**. In Arcane, Customization, Git Repositories, add `git@github.com:O/eimir-pro.git` with that key.
  In the `eimir-test` Git Sync, select the new repository; branch `deploy/eimir-test`, compose path `compose.yaml`,
  Sync Files off, other options unchanged ([Private test channel](PRIVATE-TEST-CHANNEL.md#connect-arcane-once)).
  The registry credential (classic token with only `read:packages`) is account-wide and stays; check its expiry date.
  Also check whether the instance's `EIMIR_ADMIN_GITHUB_REPOSITORY` points at the old repository and set it to the new
  tracker if support reports are enabled ([Private test channel](PRIVATE-TEST-CHANNEL.md#optional-support-reports)).
- Verify: the next Git Sync reports the same commit as before and recreates no container; the app signs in.
- Rollback: switch Auto Sync off; the instance keeps running on its current images. To go back fully, give the sync
  a read credential for the archive repository and select it again.

**C15. Test-channel promotion source.**

- Action (PO sets the variables in `eimir-pro` after the go): `EIMIR_TEST_CHANNEL_PACKAGE_PREFIX=eimir-cloud`,
  `EIMIR_TEST_CHANNEL_PROMOTE=false` for the first run, then `EIMIR_TEST_CHANNEL_ENABLED=true`. Dispatch the
  publisher in `eimir-pro` on `main` (section 6.1 describes the adapted workflow). When the staged run is green, set
  `EIMIR_TEST_CHANNEL_PROMOTE=true` and dispatch again. The old repository keeps `EIMIR_TEST_CHANNEL_ENABLED=false`.
- Verify: the run is green; the job summary lists three private references; `deploy/eimir-test` in `eimir-pro`
  advanced by one commit whose `channel.json` names the pinned `eimir-core` revision and the `eimir-pro` revision; Arcane
  redeploys; containers are healthy and sign-in works. This is the Decision 0019 gate "the test channel advances the
  test instance from the private repository".
- Rollback: in Arcane switch the sync to `deploy/eimir-test-rollback` (the procedure in
  [Private test channel](PRIVATE-TEST-CHANNEL.md#rollback)), or switch Auto Sync off.

**C16. Workflow secrets and variables in the new repositories.** No secret is ever stored in `eimir-core`.

| Name | Where | Source of the value (PO) |
| --- | --- | --- |
| `EIMIR_RELEASE_KEYSTORE_BASE64`, `EIMIR_RELEASE_KEYSTORE_PASSWORD`, `EIMIR_RELEASE_KEY_ALIAS`, `EIMIR_RELEASE_KEY_PASSWORD` | `eimir-pro`, environment `android-test-release` | the PO's offline copy of the **same** test keystore (signing continuity, C17) |
| `EIMIR_ANDROID_GOOGLE_SERVICES_JSON` | `eimir-pro`, repository secret | download again from the Firebase console |
| Token for publishing the Android test releases to the public update location | `eimir-pro`, environment `android-test-release` | a new fine-grained token limited to that one repository, Contents read and write, about 12 months (section 8, item D1) |
| Play upload key (later, not on D0) | `eimir-pro`, environment `production-release` | created when Play work resumes ([Google Play Billing](operations/google-play-billing.md)); that document's reference to the old repository's environment is updated then |
| `EIMIR_TEST_CHANNEL_ENABLED`, `EIMIR_TEST_CHANNEL_PACKAGE_PREFIX`, `EIMIR_TEST_CHANNEL_PROMOTE` | `eimir-pro`, variables | C15 |
| `EIMIR_PR_RUNNER` | `eimir-core`, variable `github-hosted` | C5 |

- Verify: `gh secret list --repo O/eimir-pro --env android-test-release` lists the four names plus the token;
  `gh secret list --repo O/eimir-core` is empty.
- Rollback: delete the secret; the old repository's secrets stay in the archive until the PO deletes them.

**C17. Android updater location and signing continuity.** This is the one step that cannot be repaired after the old
repository is private: every installed test APK reads the anonymous feed of `O/eimir`. After C11 that feed returns
404, the updater reports that no update was found and the app keeps running, but it never updates again.

- Action, in this order:
  1. Before D0 (D-5 to D-2, implementation session, PO merges): a pull request on the release branch changes the
     update location to the decision of section 8, item D1 (recommended: the releases of the public `eimir-core`),
     in `UpdatePolicy` (`REPOSITORY`, `FEED_URL`), in the marker URL of `scripts/android_test_release.py` and in the
     release plan checker; the allowed host list stays (the hosts are the same for any public GitHub repository).
  2. D-1 (PO asks for it): the **bridge** test release `android-test-v0.2.0-test.<N>` is published from the old
     repository with the [Android test release procedure](../.claude/skills/android-test-release/SKILL.md). Its
     updater already reads the new location. The PO installs it on both phones from the in-app update prompt.
  3. D0 (after C15): the publishing jobs run in `eimir-pro` (section 6.1); test release `<N+1>` is signed there with
     the same keystore on a GitHub-hosted runner and published to the new location.
- Verify: `apksigner verify --print-certs` of the bridge APK and of `<N+1>` prints the same certificate SHA-256 as
  `test.103`; the new release has the four assets `eimir-android-test-v0.2.0-test.<N+1>.apk`,
  `eimir-test-update.json`, `native-acceptance.md` and `SHA256SUMS`; an anonymous request to the new feed returns 200;
  the PO confirms on both phones that `<N+1>` was offered and installed (device acceptance is the PO's).
- Rollback: until C11 the old location still works, so the bridge can be superseded by a further release from the old
  repository. After C11, a phone that missed the bridge needs a manual install of an APK from the new location (same
  package and certificate, so data is kept).

**C18. App Links and `assetlinks.json`.** Nothing changes as long as C17 keeps the certificate.

- Action (PO): none on the hosts. Do not change `assetlinks.json`.
- Verify: `curl -s https://app.eimir.de/.well-known/assetlinks.json` still lists `de.eimir.app` with the certificate
  fingerprint that C17 printed; a sign-in link from an email opens the app (PO, on the phone).
- Rollback: not applicable; a new signing certificate would need a new `assetlinks.json` statement and would break the
  update path, which is why a missing keystore copy is an abort criterion.

**C19. Google Play Console.** Play Console has no link to the repository today. Check the store listing, the privacy
policy and the support URL for links to `github.com/O/eimir`; replace them with the website or a support address. The
upload key goes to `eimir-pro` when Play work resumes (C16). Verify: no Play listing field names the old repository.

### Block F: repository content that names the old repository

**C20. Content checks on the snapshot** (prepared in the pipeline and export pull requests, verified on D0):

| Item | Target state | Verify |
| --- | --- | --- |
| `status_drift` and `docs/IMPLEMENTATION-STATUS.md` | Either `--online` skips references written as `owner/repo#N` and the open-task lines use `O/eimir-archive#N` until they are re-created, or the export rewrites them to the new numbers from the C9 mapping (implementation choice; the required `Reuse Review` check depends on it) | `python3 tools/ci/status_drift.py --online` green in `eimir-core` |
| Hard-coded repository identity (section 1) | `test-checked-main` and `scripts/test_deployment_channel.py` read the publishing repository from configuration and live in `eimir-pro`; the User-Agent contact URLs point at a working public contact (the Nominatim and Photon policies need one); the demo asset path prefix and the Self-Hosted guard build contexts point at `eimir-core` | `grep -rn "baerenmarke90/eimir[^-]"` in each snapshot returns only intended references to the archive |
| `README.md`, `CONTRIBUTING.md`, `CLA.md`, `LICENSE`, `COMMERCIAL-LICENSE.md`, `TRADEMARKS.md` | `eimir-core`: all six, PolyForm Noncommercial 1.0.0 unchanged, README links the archive by full name. `eimir-pro`: an all-rights-reserved `LICENSE`, a README, no CLA, no PolyForm text | `Provenance` check green in `eimir-core`; the `eimir-pro` provenance check uses its own file list |
| `PROVENANCE.md` | Split: the Core file keeps the statement, facts, clean-room scope, disclosure, dependencies and Core assets and points to the archive for history; the Pro sections ("Date-idea catalog and images", "Daily Saying catalog") move to a `PROVENANCE.md` in `eimir-pro` together with those assets | both files present; no Pro asset path in the Core file |
| `SECURITY.md` | `eimir-core`: GitHub private vulnerability reporting; `eimir-pro`: contact only | file |
| Pull request template and gate scripts | present in both repositories, so `Reuse Review` and `Product Design Review` can read pull request bodies | C21 |

**C21. First trivial pull request in each repository.**

- Action (Coordinator after the go): in each repository, a documentation-only pull request (for example a README line
  that links this runbook's successor) with the full pull request body gates.
- Verify: all required checks of the repository's ruleset report and pass; the pull request is mergeable. The PO
  merges it. This is the Decision 0019 gate "a trivial pull request in each repository".
- Rollback: close the pull request; fix the failing check in a follow-up pull request.

**C22. Nightly regression in `eimir-core`.** Dispatch `nightly-regression.yml` once on `main` (PO or Coordinator after
the go). The failure issue it may open lands in `eimir-core`. Verify: every dispatched workflow completes; failures are
triaged as product failures or cut-over failures.

**C23. Register the operator runner on `eimir-pro` (D+1 or later).**

- Action (PO, on the runner VM `gh-runner-01`): one registration per runner with a token from `eimir-pro`, Settings,
  Actions, Runners, New self-hosted runner (or `gh api -X POST repos/O/eimir-pro/actions/runners/registration-token`).
  Use one shared label for up to five runners. Never register a runner on `eimir-core`. Route only non-signing jobs to
  the label; signing, publishing and attestation jobs keep `runs-on: ubuntu-latest`.
- Verify: `gh api repos/O/eimir-pro/actions/runners` lists the runners online; a pull request in `eimir-pro` runs its
  routed jobs there with a dynamic Postgres port and a workspace cleanup step (addendum findings); the publisher jobs
  still run on GitHub-hosted runners.
- Rollback: remove the runners (`config.sh remove`), or set the routing variable back to GitHub-hosted runners.

## 4. Open pull requests

Verified on November 25, 2026: 11 open pull requests. Two belong to this cut-over group and one is the active
Pro-worlds work; those three are expected to merge first. The other eight need a decision. The PO decides each row at
G4; re-list them on D-1 because the list moves ([#2284](https://github.com/baerenmarke90/eimir/pull/2284), Cloud legal
drafts, merged on November 25 while this runbook was written).

| Pull request | State | Proposal | Reason |
| --- | --- | --- | --- |
| [#2286](https://github.com/baerenmarke90/eimir/pull/2286) Decision 0019 addendum | ready, docs | **merge** before the freeze | The runbook and the export rely on its decisions. |
| [#2285](https://github.com/baerenmarke90/eimir/pull/2285) Core lifecycle tests without `eimir-pro` | ready, tests | **merge** before the freeze | Needed for a Core-only snapshot. |
| [#2287](https://github.com/baerenmarke90/eimir/pull/2287) Memory worlds, stage 1 | ready, backend, Web, migration | **merge** before the freeze; its merge (or the PO's call to stop it) starts the freeze of G2 | It appears to be the active Pro-worlds work (it adds a Pro option under `theme.bespoke_packs`); the PO confirms. Later stages go to `eimir-core` (client, contract) and `eimir-pro` (Pro server parts). |
| [#2207](https://github.com/baerenmarke90/eimir/pull/2207) Share PR change detection for Self-Hosted checks | draft, CI | **re-create from patch** in `eimir-core` | Core CI; the workflows change during the split anyway. |
| [#2115](https://github.com/baerenmarke90/eimir/pull/2115) Prepare eimir-dev for the nightly regression | draft, CI, runner | **close**; reuse `tools/runner/` as a patch for `eimir-pro` if wanted | It routes the nightly regression of the public repository to an operator runner, which the addendum forbids for `eimir-core`. |
| [#2053](https://github.com/baerenmarke90/eimir/pull/2053) Wish link and photo, Android share (draft) | draft, 125 files | **re-create from patch** in `eimir-core` | Core feature, not ready; its migration `0165_wish_photo.py` must be renumbered against the current head in any case. |
| [#2047](https://github.com/baerenmarke90/eimir/pull/2047) Daily quote from an operator-run service | ready, backend and Web | **re-create from patch**, split: Core client and contract into `eimir-core`, the quotes service into `eimir-pro`; or close | It changes `backend/src/eimir/quotes/`, which Phase 2 moved to `eimir_pro`; the patch no longer applies as is. |
| [#1901](https://github.com/baerenmarke90/eimir/pull/1901) Refresh the editorial Date Ideas catalog | ready, Pro content | **re-create from patch** in `eimir-pro` (paths mapped to `backend/pro/src/eimir_pro/date_ideas/`) | Editorial Pro content; after the cut-over it must not enter the public Core. |
| [#1596](https://github.com/baerenmarke90/eimir/pull/1596) Hetzner S3 staging preflight (docs) | ready, docs | **re-create from patch** in `eimir-core`, or merge before the freeze if still accurate | Core operations documentation, stale since 2026-11-02. |
| [#1443](https://github.com/baerenmarke90/eimir/pull/1443) Standing Android release pull request | draft, base `release/android-test.85-baseline` | **keep** until C17 step 3 succeeds, then **close** with a pointer | It carries the release branch that publishes the bridge release; never merge it. |
| [#1332](https://github.com/baerenmarke90/eimir/pull/1332) Signed test app with removable updater | open since 2026-10-17 | **close** with a pointer | Superseded by the release-branch flow; history stays in the archive. |

## 5. Rehearsal plan (D-4 to D-2)

### 5.1 Setup

Throwaway private repositories under the PO's account: `eimir-rehearsal-core` and `eimir-rehearsal-pro` (names are
examples; anything with `rehearsal` that is never reused). The Android update path additionally needs an anonymously
readable feed, which a private repository cannot provide; see 5.2, item 6.

- Created and configured exactly as in C4, C5 and C7 (private, settings table, rulesets after the push).
- Secrets: the same four test keystore secrets from the PO's offline copy in the rehearsal Pro repository's
  `android-test-release` environment. Entering them proves the copy is complete. No production or store secret is used.
- Packages: rehearsal images go to throwaway names (for example prefix `eimir-rehearsal`); the publisher's anonymous
  check must answer 401, 403 or 404. The rehearsal records whether a package first published from a private
  repository is private by default (the public-repository case was not; see
  [Private test channel](PRIVATE-TEST-CHANNEL.md#new-packages-start-public-here-set-them-to-private-mandatory)).
  If one is public, set it to Private at once: it contains Pro code.
- Billed minutes: both repositories are private, so their runs are billed against the account's included minutes;
  keep to one full run per rehearsal and record the minutes used.

### 5.2 What is built and checked

1. **Export:** the export tool produces both trees from current `main`; its gates pass; the Core tree contains no Pro
   module or Pro package data; gitleaks is clean on both trees.
2. **Core CI:** a trivial pull request in the rehearsal Core repository runs every required check; `status_drift
   --online` passes (C20).
3. **Pro CI:** the Pro tests pass against the pinned rehearsal Core revision; the check names are recorded for the
   `eimir-pro` ruleset (C7).
4. **Official image:** the publisher in the rehearsal Pro repository builds the backend, Web and media images from the
   pinned Core revision plus Pro, with Release Evidence (archives, hashes, SPDX SBOMs). Attestation and CodeQL steps
   behave as decided in section 8, item D5 and section 6.1, and the evidence records that state instead of skipping
   silently.
5. **Test channel:** with `EIMIR_TEST_CHANNEL_PROMOTE=false` the publisher stages the images and produces the three
   generated files; with promotion on, it writes a rehearsal deployment branch (for example `deploy/eimir-rehearsal`)
   and not `deploy/eimir-test`. A separate staging project in Arcane (PO) syncs that branch through a read-only deploy
   key and pulls the private images with the existing registry credential; it starts with a fresh database and
   fictional data only, and is removed after the rehearsal.
6. **Signed test APK and update path:** the rehearsal Pro repository builds and signs a test APK on a GitHub-hosted
   runner with the test keystore. Checks: `apksigner verify --print-certs` prints the same certificate SHA-256 as
   `test.103`; the four release assets are produced; the release plan checker and the marker point to the chosen
   location (section 8, item D1); the Java updater tests (`UpdatePolicyTest`, `UpdateCatalogTest`) pass with the new
   location. The rehearsal does **not** install anything on the phones and does not publish to the real update
   location: a rehearsal APK with a higher version code would consume the test numbering. The anonymous feed is
   proven with a throwaway public repository that holds only a README and one rehearsal release (no source), deleted
   afterwards. The real device acceptance is the bridge release of C17.
7. **Settings:** default `GITHUB_TOKEN` permission read; fork pull request workflows off in the Pro repository; the
   immutable releases setting; the environment deployment branch policy.
8. **Rollback drills:** Arcane staging sync switched back to its previous branch; a ruleset deleted and recreated.

### 5.3 Green before the real day (G3)

All of these in one rehearsal run, recorded with run links in #2183:

- export gates, gitleaks and the manifest count for both trees;
- every required check green on a trivial pull request in each rehearsal repository, and the Pro check names recorded;
- the publisher green from the pinned Core revision, with three private package references and the anonymous check
  answering 401, 403 or 404;
- the staging Arcane project synced through a deploy key and healthy (ready endpoint, sign-in with a fictional account);
- the signed rehearsal APK with the unchanged certificate, the four assets and an anonymous 200 from the throwaway feed;
- every setting of 5.2 item 7 as intended;
- the rehearsal repositories, packages and the Arcane staging project deleted afterwards by the PO. The 7-day rule of
  phase 4 applies to the old public packages, not to these throwaway rehearsal packages; each deletion is still the
  PO's action.

## 6. Work items before the day

### 6.1 Pipeline adaptations (implementation sessions, merged by the PO before G3)

- The test-channel and release workflows run in `eimir-pro`: the repository condition of `test-checked-main` and the
  `REPOSITORY` constant of `scripts/test_deployment_channel.py` read the publishing repository instead of a fixed name;
  the Core source is checked out at a pinned `eimir-core` revision; `channel.json` binds both revisions.
- How `eimir-pro` learns of a new `eimir-core` `main` revision (section 8, item D2).
- Artifact attestations are not available on a personal private repository, and CodeQL is not run there; the
  attestation and CodeQL requirements of the publisher and Release Evidence get an explicit, tested "not available on
  this repository" state that the evidence records, never a silently skipped check (section 8, item D5).
- The Android publishing jobs move with the release branch into `eimir-pro` and publish to the location of item D1.
- `status_drift` and the identity references of C20.
- The `eimir-kvm-pr` routing in `ci.yml` is removed from the Core snapshot (the operator runner never serves
  `eimir-core`).

### 6.2 Export tool (implementation session `cutover-a-export`)

Built under `tools/cutover/`: allow-list input, path mapping for Pro paths, the three export gates of Decision 0019
phase 1, the manifest, and the README with the exact command line used in C6. This runbook does not duplicate it.

### 6.3 Secret scan (implementation session `cutover-b-secrets`)

Scan over all refs of the old repository and the rotation list of C2. Findings are handed to the PO, not committed.

## 7. Rollback per phase and abort criteria

| Phase | Rollback | Point of no return |
| --- | --- | --- |
| Before D0 (export, rehearsal, bridge pull request) | Revert the pull requests; delete the rehearsal repositories. Nothing public changed. | none |
| Bridge release (D-1) | Publish a further release from the old repository with the old location if the bridge misbehaves. | none while the old repository is public |
| Block A (freeze, bundle) | Set `EIMIR_TEST_CHANNEL_ENABLED=true` in the old repository; continue there. | none |
| Block B before C8 | Delete `eimir-core` and `eimir-pro`; nothing was published. | C8 publishes the Core tree |
| Block B after C8 | Keep `eimir-core` public if its content is correct; fix forward. If Pro content was published, set it private at once, delete it if needed (PO), and treat it as an incident under #2183; copies may already exist. | publication cannot be recalled |
| Block C (issues, pull requests) | Close or delete re-created items; reopen old items. | none (the archive keeps the originals) |
| Block D (private, rename, archive) | Unarchive, rename back to `eimir`, set public only if the cut-over is abandoned; re-enable the test channel variable. Decision 0019: "Re-enable the old repository's workflows and keep developing there". | phones without the bridge lose updates while the old repository is private |
| Block E (Arcane, test channel, Android) | Arcane Auto Sync off or the rollback branch; the old public packages stay as the image rollback; a manual APK install for a stranded phone. | a new signing certificate (never planned) |
| Phase 4 (retiring old public packages and releases) | Packages are restorable for 30 days; immutable releases cannot be restored and their tags never reused. | each deletion, separately approved |

**Abort criteria (stop before C8 and keep developing in the old repository):**

- G3 not green, or any export gate red on the snapshot revision.
- A real secret from the scan is not rotated and not accepted by the PO.
- No offline copy of the Android test keystore and its passwords (the update path and App Links would break).
- The bridge release is not installed on both phones and the PO does not accept a manual reinstall.
- The publisher cannot produce private images from `eimir-pro` (privacy check not 401, 403 or 404).
- The first trivial pull request in `eimir-core` cannot get its required checks green on D0 and the buffer day does
  not fix it: then do not archive the old repository; keep both new repositories private and repeat on a new date.

## 8. Decisions needed from the Product Owner

Only items that are open after the November 25, 2026 decisions. Each has a recommendation; G0 accepts it unless the PO
decides otherwise.

| # | Decision | Options | Recommendation |
| --- | --- | --- | --- |
| D1 | Where the Android test releases live after the cut-over (Decision 0019 open point) | (a) the Releases of the public `eimir-core`, published by the `eimir-pro` pipeline with a token limited to `eimir-core`; (b) a separate public binary-only repository such as `eimir-updates`; (c) the operator's own host | **(a)**: no third repository, the updater needs only a new repository name, the APK holds only Core client code that is public anyway, and a stray APK cannot replace the installed app because the updater requires the same signer. Choose (b) if the PO wants the publishing token to have no access to Core source. |
| D2 | How `eimir-pro` follows `eimir-core` `main` for the test channel | (a) a scheduled job in `eimir-pro` (for example every 30 minutes) that advances the pinned Core revision when Pro tests pass and then publishes; (b) a pin-bump pull request per Core change; (c) manual dispatch only | **(a)**: keeps "every Core merge reaches the test instance" within about half an hour without a secret in the public repository and without a pull request per change. |
| D3 | Old issues after re-creation | (a) close as not planned with a pointer comment, except the cut-over trackers; (b) leave them open in the archive | **(a)**: the archive then shows where each item continues. |
| D4 | Default `GITHUB_TOKEN` permission in the new repositories | (a) read, proven in the rehearsal; (b) write as today | **(a)**, falling back to write only for a job the rehearsal shows to need it. |
| D5 | Code scanning and attestations for the private `eimir-pro` | (a) accept no CodeQL and no GitHub attestations there at the cut-over, recorded in the evidence, with a follow-up for a free Python security linter (for example Bandit) and key-based image signing before Self-Hosted; (b) pay for an organization with the security products | **(a)**: `eimir-core` keeps CodeQL and attestations for free; the Pro images are consumed only by the operator's own deployment for now. |
| D6 | Secret scanning and push protection in `eimir-core` | (a) on; (b) off as today | **(a)**: free for a public repository and complements the gitleaks check. |

## 9. What this runbook could not verify

- The visibility and repository link of the private `eimir-cloud-*` packages (needs a `read:packages` token).
- Whether a package first published from a private repository starts private (rehearsal item).
- Exact behaviour of immutable releases, the environment branch policy and the release-asset download on a private
  repository under the PO's plan (rehearsal item).
- Whether the PO holds an offline copy of the Android test keystore (G1).
- Where `assetlinks.json` is hosted and its current content (operator hosts, not in the repository).
- The export tool's final command line and the issue re-creation script (implementation sessions).
- The capacity of the operator runner VM and whether it is ready on D+1.

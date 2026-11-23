# Decision 0019: Repository split and the cut-over day

**Status:** Proposed; becomes accepted when the Product Owner merges the pull request  
**Date:** November 22, 2026  
**Owning issue:** [#2183](https://github.com/baerenmarke90/eimir/issues/2183)  
**Builds on:** [Decision 0017](0017-pro-plugin-seam.md) (Pro plugin seam),
[Decision 0018](0018-cloud-first-self-hosted-later.md) (Cloud first, Self-Hosted later),
[`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md) and the Actions cost decision of
[#2096](https://github.com/baerenmarke90/eimir/issues/2096)  
**Reverses:** decision 7 of Decision 0017 ("one private development repository")  
**Related issues:** [#2082](https://github.com/baerenmarke90/eimir/issues/2082) (seam, Phase 1, closed),
[#2182](https://github.com/baerenmarke90/eimir/issues/2182) (Phase 2 relocation),
[#2148](https://github.com/baerenmarke90/eimir/issues/2148) (deferred seam items),
[#2090](https://github.com/baerenmarke90/eimir/issues/2090) (repository visibility),
[#2180](https://github.com/baerenmarke90/eimir/issues/2180) (Pro capabilities for v2.0)

## Context

Decision 0017 assumed one private development repository holding Core and Pro, with the public Core produced from
it by an export. The Product Owner's later constraints change the trade-off:

- Development stays very active, and GitHub Actions minutes on a private repository are billed. At the volume
  measured before the tiered CI of #2096 the cost would be far beyond what the project can carry (the planning
  estimate for a private monorepo is roughly 200 to 1,100 USD per month on GitHub-hosted runners). Public
  repositories run standard hosted runners at no charge.
- The next milestones are an `eimir-prod` environment with S3 object storage and the Google Play launch, both of
  which need a stable build, sign and publish pipeline. Building that pipeline twice (once in a monorepo and again
  after a split) would put a migration into the first production weeks.
- The Pro server code, the Pro screens and the editorial catalogs have been public since August 2026. That cannot be
  recalled (Decision 0017, "What this does not protect"). What can still be protected is future Pro code and every
  image built from now on.
- The Pro work that is not built yet (six capabilities) is postponed to v2.0 ([#2180](https://github.com/baerenmarke90/eimir/issues/2180)),
  so there is little new Pro code to protect before the structure is ready.

The planning session of November 22, 2026 compared four structures: (A) a private monorepo, (B) a public Core
repository plus a small private Pro and release repository, (C) the monorepo with all heavy suites on a self-hosted
runner, and (D) "make the old repository private first, then port Core and Pro". The comparison and the verified
dependencies are summarised below; the full working notes are in the planning session's private notes and in
[#2183](https://github.com/baerenmarke90/eimir/issues/2183).

## Decision

The Product Owner decided on November 22, 2026:

1. **The repository stays public until the split is ready.** Nothing is made private now. Images built from now on
   are published under **new private package names** and pulled with a read-only credential. Public GHCR packages
   cannot be made private again, so the existing public package names are retired later, not converted.
2. **End state: a public Core repository with fresh history, plus a small private Pro and release repository.** This
   reverses decision 7 of Decision 0017. The public Core repository holds the Web client, the Android wrapper, the
   Core backend, the deployment files, the documentation that is safe to publish and the Core CI. The private
   repository holds the Pro server package, the editorial Pro content, the signing material and the official build
   and release pipeline. The official Cloud image is built there from a pinned public Core revision plus Pro.
3. **History is not rewritten in the old repository.** The new repositories start from one fresh snapshot commit
   each. On the cut-over day the old repository is set private and archived (not deleted): it remains the
   provenance and work record. A local `git bundle` of the complete old history is taken first. A further history
   reset in the new repositories before v1.0 is allowed. Open issues are re-created in the new repositories and open
   pull requests are re-created from patches; references, attestations and releases of the old repository are not
   carried over during this development phase.
4. **The public Core may show the schema of the existing Pro tables.** Existing tables stay visible through the
   Core migration chain and the manifest (Decision 0017, decision 6); tables of future Pro features live only in the
   private plugin environment. No new manifest hook is added for this, and the Core baseline squash stays deferred.
5. **Phase 2 of Decision 0017 runs first in the current public repository** ([#2182](https://github.com/baerenmarke90/eimir/issues/2182)):
   the Pro modules move into a separate distribution (`backend/pro/`, package `eimir_pro`), and an extraction
   dry-run job in CI proves that the allow-listed Core tree builds and starts without Pro. No second repository is
   created for the relocation itself.
6. **Items 3 and 4 of [#2148](https://github.com/baerenmarke90/eimir/issues/2148) wait for Self-Hosted.** Items 1
   (plugin migration environment, needed with the first new Pro table) and 2 (the `validate` hook) are part of
   Phase 2 with seam version 6. Whether a Core-only server announces missing Pro features and a ServerAdmin view of
   dormant data are not needed while the Cloud is the only product.

### Cut-over order

The end state is the one the Product Owner proposed; the order keeps the repository public and free until the
structure is ready, so the pipeline is built once.

| Phase | What | Minutes billed | Go/no-go | Rollback |
| --- | --- | --- | --- | --- |
| 0 | Stay public. No new Pro code (v2.0 is postponed). Scan all refs for secrets and rotate real ones. Choose names for the new repositories and packages. | 0 | Decisions above | n/a |
| 0b | Publish new images only under new private package names; the test host pulls with a read-only credential. | 0 extra | The test instance deploys from the private images | Point the deployment back to the old digests |
| 1 | Phase 2 relocation in the public repository; allow-list export with its gates (no plugin import, Core-only start, no Pro-only package data); decide how the OpenAPI contract and clients are exported. | 0 (public) | Core-only start and no-plugin-import checks green on the export tree | Revert; nothing visible has changed |
| 2 | Rehearsal in throwaway private repositories: build the official image from a pinned Core revision plus Pro, publish a test channel to a staging project, build a signed test APK, test the update path. | Small | One full dry run including the Android update location and the deployment tool | Delete the rehearsal repositories |
| 3 | **Cut-over day:** the public Core repository receives the snapshot (new package names, licences, CLA); the private Pro and release repository goes live; the old repository is set private and archived after the `git bundle` backup; the deployment tool and the update location switch. | Core 0 | A trivial pull request in each repository; the test channel advances the test instance from the private repository | Re-enable the old repository's workflows and keep developing there |
| 4 | After the Product Owner approves each item: retire old public artifacts (packages, releases). | 0 | The replacements have been in use for at least 7 days | Packages are restorable for 30 days; immutable releases are not |

The cut-over happens before the first Play **production** rollout. Until then the test channel stays on the current
pipeline.

### What changes for development after the cut-over

- **Core changes** (Web, Android, Core backend, deployment, Core documentation) are made in the public Core
  repository with free CI.
- **Pro server changes** (the `eimir_pro` package, Pro content, Pro tests) are made in the private repository. Its
  tests pin a Core revision, and the nightly integration build proves that the pair works.
- **Pro screens** stay in the public Core clients, as decided in [#2086](https://github.com/baerenmarke90/eimir/issues/2086)
  (one client bundle; the server enforces every Pro route). Whether the clients are split later is open together
  with Self-Hosted.
- **Contract changes** that touch both sides need a pull request in each repository, Core first. This is the cost
  that Decision 0017 rejected for a Core-private workflow; it is accepted here because the free CI for Core
  outweighs it, and because Pro changes are expected to be rare until v2.0.
- **Adjustments to the Pro functions that exist today** are made in the public repository until the freeze window
  before the snapshot, and in the private repository afterwards.

## Alternatives considered

| Alternative | Why it was not chosen |
| --- | --- |
| A: private monorepo on GitHub-hosted runners (Decision 0017 as written) | Does not fit the budget at the project's development pace, and the fixes for private-repository limits would still be needed. |
| C: private monorepo with all heavy suites on a self-hosted runner | Cheaper than A but depends on one machine with unmeasured capacity, runs untrusted pull request code on the operator's server, and keeps all development in a private repository. |
| D as proposed: make the old repository private first | Costs A-level minutes for the 4 to 8 weeks the relocation needs, and the repository fixes for privacy would be built for a repository that is archived. The chosen order reaches the same end state. |
| Delete the old repository | It is the provenance and work record (Clean-Room evidence, issue and pull request history). It is archived privately instead. |
| Rewrite the history of the old repository | Cannot recall what was already public (copies, forks and caches remain) and would damage the provenance record. New repositories start fresh instead. |

## What this does not protect

- **Pro code that is already public stays public.** The cut-over protects future Pro code and new images, not
  published history, forks, local clones, cached views or the existing public images and releases.
- **The Pro schema is visible** in the public Core chain (decision 4) and the Pro screens are visible in the public
  clients (Decision 0017, #2086).
- **Self-Hosted operators of already published images** keep a working Pro plugin, and a ServerAdmin can grant
  Premium to a Space. The revenue risk is low while Self-Hosted is not offered (Decision 0018); it is solved only by
  shipping Core-only public images and Pro only privately, plus the licence delivery of #2087, when Self-Hosted
  starts.
- **A wrong export publishes Pro again.** The allow-list input and the export checks reduce the risk; every export
  is a publication and needs the same review as a release.

## Business and freemium review

**No business/freemium impact.** No capability changes its Free, Premium or Mixed classification, no entitlement
rule changes, and Cloud quotas are untouched. The decision changes repository structure and delivery order only. It
is consistent with Decision 0018 (Cloud first) and pulls Phases 2 and 3 of Decision 0017 forward only as far as the
repository split needs them; Self-Hosted offering and licensing (#2087) stay deferred.

## Cross-cutting consequences

- **Security and secrets:** signing keys, store credentials and the official build secrets live only in the private
  repository; a public repository never receives them. A secret scan over all refs runs before the snapshot, and real
  secrets found are rotated. Pull-request code never runs on a self-hosted runner under this decision.
- **Privacy and provenance:** the old repository is archived, not deleted, because it carries the Clean-Room and
  licensing evidence. `PROVENANCE.md` assets are split between the public and the private repository before the
  snapshot. The legal question on the copyright of AI-assisted code stays with its own issue.
- **Data lifecycle and migrations:** no migration changes by this decision. Phase 2 keeps the existing Core
  migration chain unchanged.
- **API and contracts:** the OpenAPI contract of the clients must stay checkable in the public repository. How
  (full contract checked in, or a Core-only contract plus a private check) is decided in Phase 1 before the export
  is written.
- **Operations:** the deployment tool pulls the official image from a private package with a read-only credential.
  The work record moves: issue and pull request numbers restart in the new repositories, and links to the archive use
  the full `owner/repo#number` form. Status tooling that reads issue numbers (`status_drift`, the implementation
  status document) is parametrised for the new tracker or kept out of the public repository.
- **Release channel:** the Android update channel and the test channel change their source location at cut-over; the
  rehearsal proves both before the day.
- **Testing:** each phase has a gate in the table above; the cut-over is not done without a successful rehearsal.
- **Not affected:** user-facing text, accessibility, localisation and performance.

## Consequences

- Decision 0017 decision 7 and open decision 0 are superseded by this decision; Decision 0017 remains valid for the
  seam itself.
- [#2182](https://github.com/baerenmarke90/eimir/issues/2182) (Phase 2) becomes the first implementation step;
  its flip pull request, which changes the default plugin loading, needs the Product Owner's go.
- [#2090](https://github.com/baerenmarke90/eimir/issues/2090) (make the repository private) is replaced by the
  cut-over of this decision; it stays open until the old repository is archived.
- A cut-over checklist and the quick win of phase 0b are planned in follow-up work items under #2183.

## Open points

- Names of the new repositories and packages.
- Whether the Core repository carries a full or a Core-only OpenAPI contract (decided in phase 1).
- The location of the Android update channel after the cut-over, and how long the sideload channel lives after the
  first Play internal test.
- The licence of the private repository (open decision 6 of Decision 0017).

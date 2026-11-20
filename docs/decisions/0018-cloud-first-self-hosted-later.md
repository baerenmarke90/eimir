# Decision 0018: Cloud first, Self-Hosted later

**Status:** Proposed; becomes accepted when the Product Owner merges the pull request  
**Date:** November 20, 2026  
**Owning issue:** [#2088](https://github.com/baerenmarke90/eimir/issues/2088)  
**Builds on:** [Decision 0017](0017-pro-plugin-seam.md) (Pro plugin seam), [`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md),
[`PREMIUM-BILLING-STRATEGY.md`](../PREMIUM-BILLING-STRATEGY.md) and [`SELF-HOSTING.md`](../SELF-HOSTING.md)

## Context

[`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md) describes Self-Hosted and Cloud as two operating models of one product, with
the same Pro reference price and an offline-verifiable signed license for Self-Hosted Pro. Decision 0017 and the
follow-up issues (#2082, #2084 to #2087) were opened to make that possible while keeping the Pro code private: a
plugin seam, a public Core, a private Pro image, a credentialed registry and a signed license.

On November 20, 2026 the Product Owner decided to put the eimir. Cloud first and to follow with Self-Hosted much
later. The reasoning that matters for the work:

- Without an operator-delivered Core or Pro image, the Pro server code never leaves the eimir. servers, and the
  server decides every Pro route. The protection problem of a delivered Pro image (a paying operator can read and
  change the code, see #2087) does not arise at launch.
- The relocation, export and delivery work of Decision 0017 (Phases 2 and 3) and the licensing work of #2087 serve
  only an operator-delivered product.

## Decision

1. **The Cloud is the launch product.** eimir. Cloud is operated, sold and supported first. Self-Hosted is not
   offered, advertised or supported as a product at launch.
2. **Self-Hosted follows much later**, on its own timeline and its own decision. When it starts, the rules already
   in `BUSINESS-MODEL.md` and `PREMIUM-BILLING-STRATEGY.md` apply as written: a real noncommercial product, no
   artificial degradation of Core functionality, and Pro through an offline-verifiable license. Which parts of
   Decision 0017 and #2087 are then needed (public Core only, or Core plus Pro image) is decided at that time.
3. **No capability changes its Free, Premium or Mixed classification.** This decision changes sequencing, not
   product tiers.
4. **Decision 0017 stays valid.** The seam, its manifest and its failure policy remain the design for a later
   split. Phase 1 (#2082) continues only as far as the Product Owner confirms; Phases 2 and 3 wait until
   Self-Hosted work starts.

## Consequences for the planned work

| Item | Before | Now |
| --- | --- | --- |
| #2082 Phase 1 (seam, manifest) | Prerequisite for a public Core | Valuable on its own (manifest keeps deletion and encryption independent of the plugin); not launch-blocking; scope confirmed by the Product Owner |
| Decision 0017, Phases 2 and 3 | Before go-live | Deferred until Self-Hosted work starts |
| #2084 gate-only capabilities, #2085 video, insights, recap composition | Needed before the public Core | Not launch-blocking; each route still needs a server check (the Cloud server enforces) |
| #2086 client Pro code | Needed before the public export | Reduced to the Cloud question: web and Android bundles reach every user, so Pro screens and assets are visible; decide whether Pro parts load after an entitlement check |
| #2087 private image and licensing | Needed before Phase 3 | Deferred with Self-Hosted |
| Self-Hosted guards in CI | Required checks | Unchanged; they keep the later offer working |

## What this does not change, and what stays exposed

- **Already published artifacts.** The repository, its releases and the GHCR images were publicly reachable on
  November 19, 2026 and contain the Pro code (Decision 0017, Context). Copies already downloaded or forked stay
  usable under the license they were published with. Making the repository and packages private stops further
  downloads from publisher-controlled locations; it is the launch-relevant step under this decision and is tracked
  with the cleanup path of Decision 0017, not in this document.
- **Client bundles.** Pro screens and design assets in the Web and Android clients are readable by every user of the
  Cloud. The server must still enforce every Pro action.
- **The license.** The public license of already distributed versions is unchanged.

## Business/freemium consistency

**Business/freemium impact reviewed.** No tier and no matrix row changes. The sequencing of the Self-Hosted offer
and its Pro license changes: `BUSINESS-MODEL.md` and `PREMIUM-BILLING-STRATEGY.md` currently describe Self-Hosted
and Cloud Pro as parallel. They gain a short launch-sequence statement; the Self-Hosted rules in them remain valid
for the later offer. Cloud pricing and entitlement ownership (Space-scoped) are unchanged. Nothing Core is removed
from a Self-Hosted offer that does not yet exist, so there is no artificial degradation.

## Cross-cutting quality

- **Security and privacy:** server-side enforcement remains the control; the exposure of published artifacts and
  client bundles is stated above.
- **Operations:** before making packages or the repository private, verify whether and how the Cloud environment
  pulls the published images and which credentials it would need, and check the release asset downloads used for Android test
  builds, GitHub Actions minutes, and the availability of code scanning on a private repository. Each is checked
  before it is acted on, in the follow-up for the repository change.
- **Documentation:** `SELF-HOSTING.md` stays as the operator runbook for the later offer and is not advertised at
  launch.

## Follow-ups

- The repository and package visibility change and the retirement of public artifacts (separate issue, after the
  checks above and the Product Owner's go).
- Re-scoping comments on #2082, #2084, #2085, #2086 and #2087.

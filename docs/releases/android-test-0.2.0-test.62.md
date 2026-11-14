# Android test.62: upload, composer and gallery continuity

The Product Owner requests merge of #1721, #1722 and #1723 followed by creation
and publication of a new Android test release. Continue the standing delivery
record in #1443. Preserve published test.61 and the existing signed update channel.

## Source and delivery contract

Integrate actual main `a9051247a63cc598378ced649a831063b3dacdb9`, containing the
three requested merges and the preceding #1720 composer/upload polish, into the
established Android distribution overlay. Record the frozen source and tree in
#1443. Keep the plan on published test.61 while this source is checked. Only after
every publisher-required exact-source check succeeds, select test.62 / code 62
with predecessor test.61 through one plan-only orchestration commit. These notes
and the release notes belong to the candidate before signing.

The sole integration conflict is in the native picker test's action helper.
Use #1721's enabled-control readiness and fresh accessibility action there.
Preserve the distribution overlay's existing trusted touchscreen sequence,
WebView-window ownership check and video-play trust assertion. They protect a
separate coordinate-touch contract. No timeout, retry or assertion is weakened.

Reuse the sole protected publisher, package de.eimir.app, canonical certificate,
eimir-production Firebase client, persistent origin, strict dependencies,
clean-source identity, unsigned sideload preflight and native policy/catalog
tests. Preserve predecessor verification and complete draft-first/marker-last
publication with anonymous byte verification. No secret, branch allowlist,
protection, required check or published asset changes.

## Product, reuse and model consistency

#1720 owns upload progress/layout, compact shared actions, safe composer exit
and the subtle title/text divider. #1722 owns gallery navigation/resize resource
ownership. #1723 owns readable audience/feeling reflow. Their Product Reference
and Mobile Interaction Contracts, generated preflight where relevant, runtime
images and complete native-control/browser journeys remain the product evidence.
#1721 changes native acceptance tests only. Packaging adds no composition or
interaction; the established updater retains its #1331 contract.

Reuse existing task, native form, gallery and resource owners. No business/freemium
impact: Core client access, capability tiers, permissions, couple/private
ownership, quotas, retained-data rights, downgrade, Cloud/Self-Hosted behavior
and costs remain intact. No provider, dependency, backend/API/schema or deployment
change is introduced by this packaging work.

## Acceptance and limits

Require all exact-source checks admitted by the existing publisher, then unsigned
assembly/lint/native tests, protected signer verification, signed assembly and
complete public verification. Independently verify the published APK, embedded
source, package, increasing version, signer, digest, checksum, update marker and
bounded public catalog. Record the successful publishing run and observed results
in #1443.

Automated checks do not establish physical-device installation/login,
session/Space/data continuity, OS installer/App Links, actual gestures or
accessibility acceptance. This test release does not certify store or production
readiness. Existing video/media server contracts remain unchanged.

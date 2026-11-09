# Android test.58: bounded native update discovery

The Product Owner reports that App-Updates remains on its checking status
for minutes after publication of test.57. Continue the standing delivery
record in PR #1443. Baseline: delivery head
`2e1ca34b3e7087d55c7bb58ba56d639ccfc0c9e6`, incorporating current main
`ec309e23c86f3a7e6c79b81d2eb5422bfeb93db2`. Preserve published test.57
and its immutable assets. The existing plan remains on test.57 until this
new source has passed all publisher-required named gates.

## Root cause and existing contracts

The native catalog read every historical marker sequentially and returned
its best offer only after the full scan. Each metadata read restarted its
own 60-second budget. Old browser-download failures could therefore delay
or reject a valid current offer, and the complete search was unbounded.

Align the consumer with the protected producer's existing strict version
contract: the positive test suffix is the monotonically increasing Android
versionCode. Reject a selected manifest that disagrees with its tag and
reject ambiguous catalog codes. Sort candidates numerically before network
reads, retain final-marker and draft admission, and return the first fully
validated SDK-compatible offer. A higher-SDK publication may fall back to
the next candidate; invalid selected metadata must fail rather than being
silently bypassed. The explicit package migration at test.39 means the
retired package's test.1-38 entries are not installation candidates for
de.eimir.app and need no network reads.

An unselected historical manifest is no longer a prerequisite for admitting
a newer offer. The replaced historical-corruption assertion checked unused
content rather than the proposed installation. All selected metadata,
package, exact advertised URL, size, SDK, digest, installed signer and
install-time checks remain enforced. New ordering tests use producer-valid
version/code pairs instead of the previously accepted mismatched fixture.

Use GitHub's documented public release-asset binary endpoint for the
selected marker and APK. Asset IDs must be positive JSON integers from
the exact catalog release. Advertised browser URLs still have to match
the exact release. The existing HTTPS host/redirect allowlist, byte limits,
APK checksum and installation verification remain intact. No credentials,
new provider, dependency or product information are added to public reads.

## Lifecycle and user result

All metadata reads in one admitted search share a 20-second monotonic
deadline. Socket timeouts use the remaining budget; a scheduled deadline
disconnects the specific owned connection. It cannot abort a later request.
Completed/redirected requests cancel their deadline tasks. Plugin destruction
closes the transport and its timer executor. Explicit retry resets the
budget; user cancellation retains its existing cancellation semantics.
The existing localized error/retry state ends a timed-out check. The separate
bounded APK download and actual signature/package verification are retained.

This repairs the existing App-Updates interaction and changes no Web UI
composition, localization, permission, data store or backend. Reuse the
original #1331 settings/updater reference and existing loading, offer,
error/retry and installer states. There is no new visual feature.
No business/freemium impact: private distribution maintenance only, with
unchanged entitlements and Cloud/Self-Hosted behavior.

## Validation and publication acceptance

Local native JVM validation uses the same existing SHA-256-allowlisted
JSON-java/JUnit/Hamcrest dependencies and verified official JDK 21.
The actual production catalog, policy and transport pass 21 focused tests:
full 30-entry catalog with unreachable old markers and only two requests;
unsorted/SDK fallback; strict selected identity and IDs; package migration;
duplicate codes; shared deadline and retry reset; real blocked-read abort;
cancellation/resource ownership; and byte/digest checks.

A live public lookup through the actual old native classes made 30 requests
and returned test.57 after 23,862 ms. The corrected native classes made two
requests and returned the same test.57 after 10,314 ms. These are individual
cloud JVM observations, not a device latency guarantee. No mocked reader
supplied the live catalog or marker. The inherited HTTPS proxy and trusted
system Java CA store were used without disabling certificate validation.
Android compilation/Lint, sideload JVM and existing API 28/36/37.1 gates
remain hosted checks; physical device installation remains separate.

Freeze this source only after all named source checks succeed, then select
version 0.2.0-test.58 / code 58 with predecessor test.57 in a plan-only
orchestration commit. Reuse the sole protected publisher, canonical signer,
unsigned preflight, predecessor comparison, signed identity/Firebase checks,
complete draft/marker-last publication and anonymous public-byte readback.
Install the repair once directly over the existing app, because an APK
update is required to replace the installed native updater. No uninstall,
data reset, asset rewrite or protection change is part of this repair.

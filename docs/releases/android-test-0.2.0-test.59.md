# Android test.59: merged Plan links, photo gestures and video quality

The Product Owner explicitly authorizes merging #1709 and #1711 when ready and
publishing one new test release from their combined main (2026-11-09). Continue
the standing Android delivery record in PR #1443. Preserve published test.58,
its immutable assets, bounded updater and the existing signed test channel.

## Source and delivery contract

Both approved PRs are merged: #1709 at
`0f1034eae11148cdb48f66b9a2c19cd8f705ace2` and #1711 at
`719cbd267e02e1c135fa2cdd63f8702eeb417cac`. Each final PR head passed all of its
applicable checks; #1711 was retargeted and updated onto merged #1709 before its
final checks and merge. Integrate that exact combined main revision
`719cbd267e02e1c135fa2cdd63f8702eeb417cac` into the existing test-channel source,
retaining its established distribution overlay. Keep the
publication plan on test.58 until every required named check has passed on the
new immutable source. Then select test.59 / code 59, predecessor test.58, through
one plan-only orchestration commit. The notes must already exist in the frozen
source that the protected publisher builds.

Release-helper preflight passed locally: 20 immutable release-plan/publication
tests and eight native launcher/adaptive-icon identity tests. The final-source
hosted checks remain mandatory and are not replaced by these helper results.

Reuse the sole protected publisher, same canonical certificate/package, FCM-only
client, persistent API origin, strict clean-source checks, sideload tests, pinned
APK verifier, predecessor comparison and complete draft/marker-last publication
with anonymous public-byte readback. Do not rewrite an existing release, remove
the installed app, clear data, change a secret or relax a protection.

## Product, reuse and model consistency

The actual changes and product evidence belong to #1709/#1705 and #1711/#1710:
read before Edit, bidirectional original-content links, image-local controls and
the measured server codec correction. Packaging introduces no new UI composition
or interaction requiring another visual reference. Preserve the accepted Compact,
Expanded, theme, accessibility, privacy, reduced-motion and draft-safety behavior.

Reuse the approved distribution overlay rather than introducing another updater,
signer, release mechanism or provider. No business/freemium impact from delivery:
the underlying source reviews retain Free/Core Plan/image behavior and Premium
video intake with Core retained reads. Existing quotas, ownership, downgrade,
export and hosting parity remain authoritative. No new dependency or provider is
introduced by packaging.

## Acceptance and limits

Source checks must include the combined backend/API/migration contracts, browser
regression, actual restricted media processing and the existing native launcher
matrices. The protected preflight also verifies unsigned sideload assembly,
native tests/lint and every required named source check before signed assembly.
Verify the published APK, marker, checksums, source identity, certificate,
monotonic version and complete public asset set. Bind the actual merged main,
source and orchestration SHAs, workflow and release URL in this delivery record.

The matching test-server backend and restricted media image must also contain
the merged fixes. Existing processed videos are not reconstructed; the corrected
HDR/detail processing requires a new original upload. Automated publication does
not establish physical-device installation, session/Space/data continuity, OS
App Links, actual-device photo gestures, the supplied recording's appearance or
store readiness. These remain explicit device acceptance.

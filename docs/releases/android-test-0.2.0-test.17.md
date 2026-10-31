# Android test.17 — personal Pro photo sources

The Product Owner authorized this test publication on 2026-10-27. Integrate main
`3b6d51d06f91a030b0cf51c2e7ff4ecff374b82d` into the existing allowlisted channel
without merging its draft foundation into main. Retain the existing updater,
package `de.sidebyside.app`, persistent origin `https://demo.eimir.ur-cloud.de`,
original certificate `b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
regular mode, Demo/reset disabled and the user's existing account/data.

Publish **0.2.0-test.17 / versionCode 17** after exact candidate gates pass, with
published immutable test.16 as predecessor. Keep the release plan on test.16
until that point. Notes are source-bound in
[the release notes](android-test-0.2.0-test.17-notes.txt). The only manual merge
resolution combines the existing app-update translations with the new context
and photo-source translations; neither capability is removed.

This delivers merged #1460/#1461/#1462/#1463: owner-bound asynchronous selection,
scoped local recovery, personal Immich and Google Picker imports through normal
attachment validation/READY/Save. Both external sources require Pro; local/system
selection stays Free/Core. Preserve every imported copy on downgrade/disconnect.
No new runtime UI is authored for release packaging; inherited design and
cross-cutting decisions/evidence remain in the
[photo-source delivery contract](../product/integrations/1444-photo-source-delivery.md).
The #1445 viewport isolation fix is already inherited from main; its separate
operational/test status must be reported truthfully.

Reuse the existing sole publisher, exact allowlisted branch, all 29 named source
gates, protected original-certificate signing, actual unsigned build/lint/JVM
checks, predecessor/current APK inspection, draft-first marker-last publication
and anonymous byte verification. Do not alter permissions, approvals, identities,
fixed endpoints or acceptance criteria. A build number is never reused after
signed distribution; all old releases remain immutable.

No business/freemium change is introduced by packaging. The previously accepted
photo-source Pro classification, per-Account credential ownership, shared-Space
eligibility, normal quotas and non-paywalled retained-history/export/deletion
contracts remain. Cloud and Self-Hosted retain the same source security boundary.

Google additionally requires the test server's approved OAuth app and exact HTTPS
callback from the delivery runbook. Immich requires an encrypted HTTPS backend
and a personally linked reachable public HTTPS root service with read permissions.
Neither signing/publication nor fixture tests establish live provider approval,
installed-device continuity, real OS App Links or public/store readiness. Those
acceptance tests occur in the running deployment per the owner's instruction.
Private Web/API image promotion and Arcane rollout remain distinct from APK
publication and are verified independently without resetting data or keys.

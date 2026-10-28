# Android test.21 — readable photo places and sensitive-media controls

Deliver the accepted main revision `624458354c651b39c19f97a82f04eda1a93a5314`, including #1478/#1480 photo-place address resolution and direct map links, #1477/#1479 sensitive-media controls, and #1481 CI improvements, through the existing private Android channel. Preserve the existing test-only updater foundation; never merge that foundation into main.

Prepare an immutable integrated source containing these notes and the source-bound [update notes](android-test-0.2.0-test.21-notes.txt). Keep the plan on immutable test.20 until all 29 required named checks succeed on that exact integrated source, including native launcher acceptance and actual sideload lint/policy/catalog tests. Then select `0.2.0-test.21` / versionCode `21`, with immutable test.20 as the predecessor. No previously shared build number may be reused.

Preserve package `de.sidebyside.app`, original certificate `b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, regular persistent origin `https://demo.eimir.ur-cloud.de`, existing accounts/data/keys, Demo/reset disabled, and every publisher protection. Retain the sole existing protected publisher, exact-source checks, unsigned validation, predecessor compatibility, complete draft comparison, marker-last publication, and anonymous verification of all four immutable release assets.

Resolve the release-foundation/main workflow merge by retaining the Android-only allowlisted push trigger and its protected jobs alongside main's completion-based private Cloud publisher and preserved publication queue. Keep both workflow-contract test sets. No broader branch, signing or environment authority is introduced.

The Cloud API and worker need the matching main deployment for photo-place enrichment and sensitive-media projections. The existing main publisher and Arcane Git Sync remain the only promotion route; do not reset/bootstrap the installation. Verify the deployed source and public readiness separately from APK publication.

Business/freemium impact reviewed: this delivery changes no entitlement or pricing decision. Automatic selected-photo Places remain Free/Core, and existing private/shared authorization, provider preference, manual corrections, export/restore and retention boundaries remain authoritative. The accepted Photon coordinate-only reverse lookup and sensitive-media policy are documented by their owning implementation issues and versioned product documentation.

Physical-device installation continuity, OEM/provider-specific selection, App Links and store readiness require device acceptance; CI and anonymous asset verification do not establish those claims.

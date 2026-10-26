# Android test.16 — shared diary

Owner request: publish a new Android test release to exercise the diary in the installed app, 2026-10-26. Related: #1457 / #1458 and the existing #1331 / #1332 test channel.

## Source and delivery

Merge the accepted diary main revision `fe59df8c41848d156c4dd8367ae5b2f1c6d423b2` into the existing test-channel source. Preserve the previously distributed sideload updater and its native source set; this release does not merge that draft foundation into main. The main integration merges cleanly without a manual product-code adaptation.

Publish **0.2.0-test.16 / versionCode 16**, with immutable test.15 as predecessor. Build 15 is already distributed and must not be reused. Preserve package `de.sidebyside.app`, original certificate `b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`, persistent origin `https://demo.eimir.ur-cloud.de`, regular mode, Demo/reset disabled, and the existing updater.

The source-bound [release notes](android-test-0.2.0-test.16-notes.txt) describe the writing/reading composition and seven-day local draft recovery. Normative product direction and representative evidence are retained under [the diary preflight](../product/design/references/1457/README.md) and [its evidence](../product/design/references/1457/evidence/README.md). No new product composition or native capability is authored in this delivery step.

## Publication sequence

1. Commit this clean source with the release plan still selecting published test.15. The existing unprivileged publisher must verify that immutable publication and skip signing.
2. Require all 29 named source checks on the exact candidate revision, including browser/axe, native launcher jobs, integration shards, evidence and release contracts.
3. Only after those checks succeed, commit a test.16 plan naming the exact checked source, versionCode 16, test.15 predecessor, and notes already present in that source.
4. Reuse the sole writer workflow on its existing exact allowlisted branch. Do not change Environment approval, branch permissions, signing custody, original certificate checks, timeouts or publication guards.
5. Require unsigned sideload assembly, lint and actual policy/catalog JVM tests, original-certificate signing, actual predecessor/current APK verification, draft-first/marker-last publication, and anonymous verification of all four immutable public assets.

The plan and final release assets are the authoritative exact-source and APK identities. Historical test.15 and diary evidence remain tied to their recorded sources; they do not replace this candidate's required checks.

## Reuse, business and acceptance

Reuse the established Capacitor/Gradle client, test plan validator, GitHub Environment, original signer, immutable-release lifecycle and native updater. No dependency, provider, permission, server schema, API or entitlement is added. Official client maintenance and Memory CRUD remain Free/Core; relationship ownership, quotas, export, retention, downgrade and Cloud/Self-Hosted boundaries are unchanged.

Automated source/build/signature/publication checks do not establish physical-device in-place installation, session/Space/data continuity, OS App Links, launcher appearance or live-backend acceptance. Those remain practical checks on the installed Build 16. This request authorizes test APK publication; it does not change the separate private Web/API deployment or production/store release contracts.

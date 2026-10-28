# Android test.22 — deliver the current persistent test installation

Integrate accepted main revision `5e19e8b8f522be6b59737b15a40e6c8bbbceb806`
into the existing private Android channel. This includes the accepted moment
photo metadata, photo reactions and detail presentation, and Google authorization
binding and draft recovery fixes. Preserve the test-only updater foundation and
keep it out of main. This delivery adds no native capability or product design.

## Missing update diagnosis

Deployment commit `6bca3172cdadc4fffc6df250761145e584089986` on
`deploy/eimir-test` selects the main revision above. Its successful publisher
run `40714893724` builds the Web/API pair with `include_android: false`.
It neither builds an APK nor advances the Android release plan.

The separate Android plan still selected published test.21 at
`ef88513a223fbf4c4d2445c9f5b69f4e44f058bc`. Anonymous public catalog bytes,
processed by that release's unmodified native catalog parser, selected code 21:
an installation already on code 21 correctly reports itself current. No newer
signed APK or updater marker existed for the deployed main revision. The
catalog was within its 30-release bound and its eligible markers were valid.

## Release procedure

Commit the integrated source and these source-bound
[localized update notes](android-test-0.2.0-test.22-notes.txt) first, leaving the
existing plan unchanged. Require all 29 named checks on that exact source to
succeed. Then select `0.2.0-test.22`, code `22`, with immutable test.21 as the
predecessor in a separate plan commit on the existing allowlisted branch
`release/android-test.14-20261026`.

Reuse the sole protected publisher and existing `android-test-release`
Environment. Preserve package `de.sidebyside.app`, original certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
regular persistent origin `https://demo.eimir.ur-cloud.de`, Demo/reset disabled,
same-key upgrade checks, and all source/build/lint/policy/publication gates.
No signing material or credentials belong in source or release assets.

Stage all four immutable assets as a draft, compare their downloaded bytes,
upload the marker last, and publish atomically. Verify all four anonymous assets,
the embedded source identity, and actual native catalog selection above installed
code 21. Publication and feed verification do not establish physical-device
installation, data continuity, App Links or store acceptance.

## Reviews

Reuse: retain the existing GitHub Actions, protected test signing, Capacitor
packaging, release-plan helper, Android installer and native catalog. A new
publisher, backend endpoint, service or dependency is unnecessary. Existing
GitHub build/storage costs and public distribution metadata remain the same.

No business/freemium impact: this release selection introduces no new pricing,
entitlement, quota, ownership, provider or retention decision. Accepted main
features retain their owning Free/Core or Mixed classifications and versioned
reviews. No additional product UI/UX change is introduced by release preparation;
the accepted main design evidence remains authoritative.

Cross-cutting review: preserve signing identity, package/version monotonicity,
source binding, authenticated partner data, draft safety, existing API contracts,
and immutable marker/checksum verification. The private Cloud deployment remains
independent; do not change its data, secrets, bootstrap or recovery settings.

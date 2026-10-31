# Android test.23 — deliver the Wir and app-navigation experience

The owner reports that test.22 still feels like opening a website and lacks the
updated Wir page. Test.22 packages source `f9e06a0ba08843bbb4ab66b64cb25641ada841af`;
the separate Cloud image deployment cannot update its bundled Web assets.

Integrate accepted main containing #1488 (photo-led Wir), #1490 (viewport-fixed
bottom navigation) and #1492 (safe primary-root context and native tab history)
into the existing draft test channel #1443. Keep that channel out of main.
The generated navigation reference, Mobile Interaction Contract, source review
and production-consumer evidence live in
[the navigation preflight](../product/design/references/app-navigation/README.md).
The owning recovery/delivery issue is #1491.

## Product and implementation

Wir leads with larger overlapping portraits and centered names/duration without
the redundant dated masthead. Existing photo actions, invitation, presence and
Energy remain available. Primary navigation stays reachable while scrolling.
Root switches restore the safe view/scope, loaded range, Planning mode and
meaningful position; reselect scrolls to the top. Native root-to-root changes
replace history; browser history and nested draft/task Back remain ordinary.
No independent native product UI, hidden screens or durable content store.

The existing Account/Space-scoped task-origin bound, expiry and invalidation
remain authoritative. Private/detail/editor/search routes are not automatically
resumed as primary roots. Touch feedback uses existing semantic roles; reduced
motion retains equivalent behavior. Product Reference v1 R2/R3/R4/R5, existing
shared components and localized content remain authoritative.

## Release procedure

Commit integrated source and these source-bound
[localized notes](android-test-0.2.0-test.23-notes.txt) first with the published
test.22 plan unchanged. Wait for all 29 named checks on that exact source. Then
select version `0.2.0-test.23`, code `23`, previous `0.2.0-test.22` in a separate
plan commit on the existing allowlisted `release/android-test.14-20261026`.

Reuse the sole authorized protected publisher and `android-test-release`
Environment. Preserve `de.sidebyside.app`, certificate
`b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472`,
`https://demo.eimir.ur-cloud.de`, regular mode, disabled Demo/reset behavior
and the existing updater. Do not change secrets, audience, data or Cloud
deployment configuration. Published earlier releases remain immutable.

Verify actual package/source/version/signer and strict upgrade from test.22;
assemble all four draft assets, compare downloaded bytes, upload the marker
last and publish atomically. Independently check anonymous catalog/assets and
APK embedded identity. Inspect the actual packaged CSS for the new Wir hero
and fixed navigation, as an extra delivery check against the reported omission.
Exercise the unmodified native catalog and offer policy above installed Build22.

## Reviews and acceptance

Reuse: existing React Router/task-origin and CSS capabilities for the shared UI,
existing Capacitor packaging, Android installer, protected signer and GitHub
Actions/Releases publisher. No additional component, dependency, provider,
configuration, recipient, license, managed resource or tester setup.

No business/freemium impact: secure navigation and relationship identity remain
Free/Core in Cloud and Self-Hosted. Existing photo-source Pro boundaries, data
rights, ownership, quotas, retention, downgrade and export contracts are unchanged.

Cross-cutting: preserve authorization/scope invalidation, transient bounded
state, draft and partial-failure safety, accessible labeled links, modifier
clicks, reduced motion, narrow/large-text behavior and existing offline no-write
semantics. No API/backend/schema change. No sensitive data or credentials enter
Git, history metadata, diagnostics or release evidence.

Automated/browser evidence establishes the shared UI and release identity;
installed-device Back, TalkBack, IME/OEM behavior, App Links and same-key in-place
upgrade/session/data continuity remain device acceptance. Publication is not
physical-device or public/store acceptance.

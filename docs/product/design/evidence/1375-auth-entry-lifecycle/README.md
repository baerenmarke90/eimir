# Passwordless entry compatibility and running-client intake (#1375)

Baseline: `3f850e4e312576148d608e61947d0835216f1c0b`.

## Evidence and bounded conclusions

The operator supplied live diagnostics: no Account for the address, one
`magic_link` request in 15 minutes, zero `signup_request` reservations, no signup
proof, and zero auth-mail transport warnings in 20 minutes. The public instance
status advertised Cloud self-service signup. The existing-account-only request
therefore explains this missing mail. It does not establish an SMTP failure or
prove which installed client/version submitted the request.

A PostgreSQL HTTP regression reproduces that result before the server change:
`202` and no mail for an unknown address. Cloud now delegates this legacy entry
to the existing signup-proof flow for known and unknown addresses. Self-Hosted
keeps its existing-account-only behavior. Both Cloud routes share proof
generation and address/network budgets. Old magic tokens keep their original
consumer and proof-type isolation; admission rules still apply at redemption.
An older client cannot recover an invitation it never supplied.

Separately, the application read identity-entry tokens only at mount. Browser
regressions fail on baseline for a router-delivered callback (zero redemptions)
and a running PWA launch (no registered consumer). One memory-only intake now
uses React Router, the browser LaunchQueue, and existing Capacitor delivery APIs.
External inputs must match the deployment's exact HTTP(S) origin. Repeated
platform delivery does not redeem twice, stale cold-start lookup cannot replace
a newer warm entry, and listener cleanup prevents post-unmount updates.
The identity flow takes precedence over an already signed-in shell; an older
session failure cannot discard an incoming mailbox proof.

## Product review and visual evidence

Product Reference v1 completion/context continuity and Authentication and
Invitation (Screen Template 10) apply. IdentityEntry, neutral mail confirmation,
loading/error states, the product shell, session persistence and authorized Space
selection are reused. This corrects an existing flow and reuses its existing composition. A conflicting
active-account callback uses the existing localized error/action presentation;
links received during a protected draft use the shared Snackbar. No new layout,
style, motion or token is introduced. The owning
issue records the preflight before implementation; no generated composition
is applicable to this correction.

Current-build screenshots were inspected after a real local API/installed-PWA
journey with fictional data:

- [Compact, 390 x 844](installed-pwa-compact.png)
- [Expanded, 1280 x 900](installed-pwa-expanded.png)

The journey used an isolated PostgreSQL database, the real request unit of work,
a local collecting MailSender instead of SMTP, Vite behind a real reverse proxy,
and full Chromium's PWA install/launch APIs. API responses were not mocked.
A founder used the legacy request to obtain a mailbox proof and created a
Space/invitation. The partner already had an Account and an own Space, signed
into the installed PWA through the legacy request, then opened the founder's
invitation in the browser and requested the actual bound mailbox proof. Launching
that actual callback in the installed PWA selected the shared Space, displayed
both partners, retained the own Space and caused zero additional Space creates.
The installed page reported standalone display. Chromium opened a new app page;
this test does not prove reuse of an existing PWA page. Running-page delivery is
covered separately by the browser regression and lifecycle tests.

The desktop harness needed page-scoped PWA installation and a CDP attachment to
the separate app target, plus a reverse proxy instead of Playwright-only request
interception. Assertions wait for the actual asynchronous heading; repeated
harness setup exhausted the isolated network budget, which was reset only in
the explicitly checked local dummy database before the final complete run.
No product limit, assertion or production state was relaxed.

The following safeguards reuse the current error and Snackbar composition:

- [Active-account protection, Compact](active-account-compact.png)
- [Active-account protection, Expanded](active-account-expanded.png)

Screenshots are from a running-client callback with a different Account. The
existing Account/session remains stored, the newly issued session is signed out,
and the return action restores the existing shell. The initial stored session is
also restored before cold-entry consumption. External links wait in memory until
all shared document-leave guards release; unsaved drafts and in-flight saves are
not interrupted. The guard consolidates the existing task-editor and Quiet Hours
beforeunload ownership; there is no timer or automatic draft discard.

## Validation

- 127 PostgreSQL Cloud onboarding/auth/policy/action-token tests pass, including
  known/unknown legacy requests, admission gates, generation, shared address
  and actual-client-network budgets, Self-Hosted preservation, and legacy token
  isolation. The final added network test also passes in the seven-test alias run.
- 19 adjacent account-deletion/history/offboarding-policy/invitation tests pass.
- Backend unit run: 812 pass, 24 database-dependent skips.
- Full Web unit run after the shared draft guard: 1910 pass, one existing skip.
  Focused entry/component checks after account protection: 42 pass.
- 16 onboarding/session/reload browser journeys pass with retries disabled,
  including running and cold callbacks with a different active Account.
- Ruff, mypy (296 source files), Web typecheck/build/format and OpenAPI checks
  pass. Web lint passes with pre-existing unrelated warnings.
- The generated client uses official OpenAPI Generator 7.24.0, matching the
  repository version. Only generated endpoint documentation changes.

No real recipient delivery or Android-device handoff was observed at this PR's
Web/backend checkpoint. Published Android test.6 uses source `1ffa9153` on
`codex/android-test-homescreen-icons`, with an additional sideload App Links
manifest. Its independent `nativeEntryLinks` drops delivered callbacks when a
session exists and rejects pre-upgrade invitation fragments. That test-channel
listener must be replaced by this shared intake, not run alongside it. The public
Digital Asset Links file matches the existing test signing certificate. Old
bundled APKs do not update with Web/backend deployment. Delivered-URL handling
does not itself prove OS verification or package rollout. The complete user-reported journey remains
unverified until those actual installation and delivery boundaries are observed.

## Account and relationship boundaries

Account deletion is not onboarding recovery. Ending a Membership history-locks
that Space against ordinary future invitations. A new Account with the same
mailbox does not inherit the deleted identity or restore its membership. This is
now explicit in the ServerAdmin operational documentation. No automatic
reassignment, history removal, deleted-account reactivation, or admin membership
shortcut is introduced.

No business/freemium impact: essential identity and partner entry retain their
existing tier/authorization semantics, with no new provider, quota, storage,
retention, paid capability or deployment-policy change.

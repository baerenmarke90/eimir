# App authentication completion ownership (#1390)

Baseline: main `2756260384ae9ea8d4a2f7f5686679e4b12f7f39`.
The previous distributed APK is test.12 at
`d3809305f010fdfec062c308970da6d9a766e26b`.

## Reproduced defects and correction

Seven new regression cases fail on the unchanged baseline: five late identity
completion/error cases, lost refresh scheduling after another token rotation,
and a definitively forbidden refresh being retried. The StrictMode success and
unmount/timer cleanup controls already pass on baseline.

IdentityEntry now uses the existing `useTaskActivation` contract for password,
mailbox, recovery, registration and verification feedback. Replacing or leaving
an entry invalidates its callbacks. Newly issued, unaccepted sessions are signed
out best-effort; the accepted current login and its known previous credential
generation are protected from that cleanup. Duplicate immediate submissions are
admitted once. Automatic one-use proof requests start in a microtask after
StrictMode activation replay, and still run once.

Failed password/legacy-mail invitation acceptance disposes of its unused session
without replacing the original invitation error. No invitation or Space is
automatically reassigned, and no existing account data is removed.

Session renewal schedules against the owning login's current tokens and rearms
when a foreground callback finds another already-completed rotation. The same
existing refresh buffer governs timing and validity. Refresh 401/403 clears the
current durable session; temporary failures retain credentials and retry.
Ordinary resource permission errors are unchanged.

## Product and reuse review

This is a nonvisual continuity/privacy correction to Authentication and
Invitation, Screen Template 10, under Product Reference v1. The entry, loading,
error, mail-confirmation, account-conflict and return compositions are reused.
No control, copy, token, layout, breakpoint, focus rule or animation is added.
Compact remains normative and Expanded uses the same product. No generated
composition is applicable. Existing representative Compact/Expanded views are
linked in [the unchanged entry evidence](1375-auth-entry-lifecycle/README.md).
Those historical captures document composition, not a new device acceptance.

Reuse: existing task activation, session owner/refresh facade and generated auth
sign-out endpoint. React's [effect ownership guidance](https://react.dev/learn/synchronizing-with-effects#fetching-data)
was reviewed. There is no new dependency, provider, credential store, polling
service or API. Security, privacy, tenant boundaries, localization, accessibility,
Cloud/Self-Hosted behavior and existing-data retention are preserved.

No business/freemium impact: authentication and safe access remain
non-paywallable under the feature matrix. No tier, entitlement, quota, provider,
pricing or managed-resource contract changes.

## Validation and limits

- 79 focused identity, session, generated-client and native-persistence bridge
  tests pass, including stale success/error, replacement proof, unmount,
  StrictMode, duplicate submit, failed invitation cleanup, accepted-session
  protection across rotation and definitive refresh rejection.
- The full Web suite before the final accepted-generation guard passed 2,015
  tests with one existing skip. Final-source full results are recorded in the PR.
- TypeScript, production build, token/PWA checks and formatting pass. Changed
  files lint without warnings; the full tree retains unrelated existing warnings.
- Local Playwright execution is unavailable in this workspace: Chromium exits
  before creating any page because its process-singleton socket syscall returns
  `Operation not permitted`. All 22 attempted journeys fail at browser launch,
  without reaching product assertions. No test, timeout, security gate or
  assertion was weakened to mask this environment limit. Hosted Browser QA must
  provide the browser acceptance before regular merge.

This record does not certify physical Android installation, OEM email dispatch,
Keystore behavior or the full final product audit. #1271, #1332 and #946 keep
their existing acceptance boundaries. The private test release uses the original
test signing identity and a higher versionCode; a Web merge alone does not
update an installed APK.

# Cloud invitation proof binding (#1373)

Baseline: `ca91790823d5e57ccd3a375cb9c8658315331938`.

The earlier continuation relied on a URL fragment that an app had to interpret.
The user reports a browser-to-app handoff, with the fragment present in the mail.
That report does not establish which component drops or ignores it. The
reproduced server failure is precise: redeeming only the mailed proof creates
or signs into the Account without joining the invited Space.

The invitation is now bound to the short-lived proof as a hash and accepted in
the same transaction before session issuance. The successful response carries
the joined Space ID through the existing session/context contract. Membership
loading validates that destination before product content renders. A previously
created own Space and its data remain intact. Pre-upgrade fragment links keep
their existing authenticated acceptance path.

## Product review

Product Reference v1 completion/context continuity and Screen Template 10
(Authentication and Invitation) apply. Existing IdentityEntry, neutral mailbox
status, FirstSpaceGate, App shell, session persistence and authorized-Space
resolver are reused. No new view, control, copy, style, token, native bridge or
material visual composition is introduced. The issue records the nonvisual
correction and Mobile Interaction review before implementation.

Current-build screenshots show the unchanged email confirmation using fictional
test state and mocked API responses:

- [Compact, 390 x 844](mail-confirmation-compact.png)
- [Expanded, 1280 x 900](mail-confirmation-expanded.png)

Both were visually inspected. No real recipient, proof or invitation appears.
Theme, motion, keyboard, focus and responsive contracts remain unchanged. The
browser journey checks focus, WCAG violations, overflow and the completed
shared-Space handoff; screenshots alone do not establish acceptance.

## Validation

- The new proof-only PostgreSQL regression fails against the baseline for both
  a new Account and an existing Account with an own Space: the invited
  Membership is missing.
- 76 PostgreSQL onboarding, invitation and migration tests pass after the fix,
  including both regressions, retained own Space, invalid/revoked/expired/used/
  full/ended invitations, rollback and concurrent proof redemption.
- 66 adjacent PostgreSQL Cloud auth, OIDC onboarding, action-token generation
  and Space offboarding tests pass. The isolated database uses UTC, matching CI.
- Full backend non-integration run: 812 passed, 24 database-dependent skips.
- Full Web run: 1879 passed, one existing skip. The final server-bound versus
  legacy-fragment guard and session/context consumers also pass a focused run.
- Seven onboarding browser journeys pass without retries, including a proof-only
  app-style callback, legacy fragment and two-Membership destination selection.
  Five existing session retention/reload journeys also pass without retries.
- Complete Alembic upgrade through 0086 and schema-drift check pass on a fresh
  isolated PostgreSQL database. The migration test verifies legacy-proof
  preservation and downgrade revocation of pending bound proofs.
- Build, typecheck, Ruff, mypy, Web lint/format and OpenAPI checks pass. Generated
  clients come from official OpenAPI Generator 7.24.0, matching the repository
  version; CI retains its pinned-container generation check.

No real mail was sent. Browser API responses are mocked; actual authorization,
persistence, rollback and concurrency are established by the PostgreSQL HTTP
tests using the real request unit of work. An installed-device handoff and real
recipient delivery were not observed. New server binding applies to newly
requested email links; a deployed build alone does not prove that user journey.

## Administration boundary

The requested unrestricted ServerAdmin Account-to-Space assignment is not added.
The existing ServerAdmin contract separates operations from Membership and
private product access, and exposes only a read-only Space lifecycle projection.
The canonical invitation remains the authority for linking partners. Existing
Accounts/Spaces are not deleted, merged or reassigned as a workaround.

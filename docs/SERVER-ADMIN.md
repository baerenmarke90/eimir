# Server Administration

## Purpose

ServerAdmin is an instance-wide operational capability for administering a
eimir. installation. It is separate from partner-facing Space membership
and does not grant access to private product content.

The Web administration surface uses the dedicated `/server-admin` route. The
backend remains authoritative: hiding or showing the route in a client is only
presentation assistance and does not replace endpoint authorization.

## Operator-managed authorization

ServerAdmin identities are configured in the deployment environment:

```dotenv
EIMIR_SERVER_ADMIN_EMAILS=["operator@example.com"]
```

The value is a JSON array. Multiple operators may be configured. Addresses are
normalized to lower case and duplicates are ignored.

An authenticated account receives ServerAdmin only when at least one of its
stored `AccountEmail` rows:

1. is verified; and
2. exactly matches an address in `EIMIR_SERVER_ADMIN_EMAILS`.

The safe default is:

```dotenv
EIMIR_SERVER_ADMIN_EMAILS=[]
```

which grants ServerAdmin to nobody. Space roles, Space ownership, the first
bootstrap registration, and unverified email addresses do not implicitly grant
ServerAdmin.

The API process loads this setting from its environment. After changing the
allowlist, recreate/restart the API process through the normal deployment
workflow so the new configuration is loaded.

## Deployment plumbing

ServerAdmin uses the single repository-root `compose.yaml` deployment contract.
Complete checkouts and Arcane both use the `self-hosted` profile; Arcane changes
only the Backend/Web build contexts through environment configuration.

`.env.example` and `deploy/persistent-development.env.example` both document the
setting. Development, Demo, and Production installations manage their own
allowlists and must not share environment files as a convenience.

## Authorization contract

The authenticated client may read `/api/v1/auth/capabilities` to decide whether
to present the ServerAdmin entry point. This response is not an authorization
source.

Every `/api/v1/server-admin/...` endpoint independently requires the
server-side ServerAdmin guard. An ordinary authenticated account receives a
stable forbidden response even if it manually navigates to the route or calls
the API directly.

## Operational overview

`GET /api/v1/server-admin/overview` exposes a privacy-safe application-level
projection including available signals for:

- API/database state;
- deployment and environment;
- build revision and API process start time;
- safe public/runtime configuration state;
- total, active, and suspended Account counts;
- verified and unverified primary-email counts;
- 24-hour, 7-day, and 30-day Account-registration counts;
- aggregate active-session and authentication-method counts;
- configured vs. currently resolved ServerAdmin allowlist entries;
- aggregate active-Space counts;
- READY media object count and aggregate stored bytes;
- background-job state, oldest pending job, and recent failed-job technical
  metadata;
- privacy-safe warning codes for actionable configuration/runtime conditions.

Where no authoritative runtime primitive exists yet, the API reports that the
signal is not available instead of fabricating health. In particular, the
current worker model has no heartbeat primitive and the media adapters do not
expose a generic health probe.

The overview does not expose:

- passwords, tokens, private keys, DSNs, provider credentials, or secrets;
- private Memories, Notes, messages, media content, or other product payloads;
- background-job payloads;
- raw background-job exception text;
- relationship-quality, engagement, Vibe/Energy, intimacy, or OWNER_ONLY
  analytics;
- shell, SQL, filesystem, or container execution capabilities.

## Account administration

The ServerAdmin Web console includes a paginated Account directory and focused
Account detail view. These surfaces expose only identity, authentication, and
coarse lifecycle metadata required for instance operation, for example:

- Account ID, display name, creation and disabled timestamps;
- primary email and verification state;
- configured authentication methods and passkey count;
- active session count and last available session activity;
- active/historical Membership counts without Space content.

Private relationship content is deliberately not queried by these read models.

The corresponding ServerAdmin API supports:

- `GET /api/v1/server-admin/accounts`;
- `GET /api/v1/server-admin/accounts/{accountId}`;
- `PUT /api/v1/server-admin/accounts/{accountId}/suspension`;
- `POST /api/v1/server-admin/accounts/{accountId}/sessions/revoke`;
- `POST /api/v1/server-admin/accounts/{accountId}/email-verification/request`;
- `POST /api/v1/server-admin/accounts/{accountId}/emails/{accountEmailId}/verify`;
- `POST /api/v1/server-admin/accounts/{accountId}/recovery/email`;
- `POST /api/v1/server-admin/accounts/{accountId}/recovery/operator`;
- `GET /api/v1/server-admin/activity/actions`.

### Suspension and session revocation

Account suspension reuses the authoritative `Account.disabled_at` state. It is
not a parallel ban flag. Suspending an Account:

- disables future authentication;
- revokes all active `DeviceSession` families;
- leaves Account and relationship data intact;
- records a content-free privileged audit event.

The currently authenticated ServerAdmin cannot suspend their own Account.
ServerAdmin rows involved in lockout protection are locked transactionally so
concurrent administrative changes cannot intentionally bypass the safeguard.

Unsuspending an Account restores authentication eligibility only. It does not
recreate deleted credentials or sessions.

The explicit revoke-sessions action invalidates all current session families
without suspending the Account.

### Normal email verification resend

For an active Account whose primary email is still unverified, ServerAdmin may
request the ordinary verification message. This calls the same
`EmailVerificationToken` issuance, supersession, rate-limit, expiry and mail
delivery path used by authenticated self-service. The operator never receives
the token or verification URL.

If the primary address is already verified, the request is an idempotent no-op.
If mail is not configured, the endpoint reports the existing
`MAIL_TRANSPORT_UNAVAILABLE` capability error. This normal resend is deliberately
separate from operator-assisted verification below: sending a proof to the
mailbox does not assert that the operator has verified the person's identity.

### Operator-assisted email verification

When an operator has verified an Account email through an appropriate
out-of-band process, ServerAdmin may mark that existing `AccountEmail` as
verified. The operation requires typing the exact target email address and is
audited. It does not create an email address, create an Account, or grant
ServerAdmin by itself.

This path exists primarily for Self-Hosted installations that intentionally run
with `EIMIR_MAIL_TRANSPORT=none`. It must not be exposed to ordinary clients as a
way to bypass normal verification.

### Password recovery

A ServerAdmin never reads or sets a user's plaintext password.

If mail delivery is configured, the Account detail surface can request the
normal password-recovery email. This reuses the same Account recovery service as
the public recovery flow.

For a Self-Hosted installation without mail delivery, ServerAdmin may issue an
operator-assisted recovery proof for an active local-password Account. This
also reuses the normal `AccountRecoveryToken` lifecycle:

- any previous open recovery proof for the target Account is revoked;
- only a token hash is persisted;
- the returned recovery URL is sent with `Cache-Control: no-store`;
- the plaintext proof is not written to audit history or logs;
- the Account owner chooses their own replacement password through the normal
  recovery-consume endpoint;
- the proof remains single-use and expires according to the normal recovery
  token policy.

The operator is responsible for handing the one-time URL to the Account owner
through an appropriate out-of-band channel.

## Self-Hosted break-glass email verification

A dashboard cannot repair the initial state where no verified allowlisted
ServerAdmin can enter it. For that narrow bootstrap/recovery case, a local
operator may run inside the backend environment:

```bash
python -m scripts.server_admin verify-email operator@example.com
```

The command:

- only matches an already existing `AccountEmail`;
- only sets its `verified_at` assertion;
- never creates an Account;
- never changes `EIMIR_SERVER_ADMIN_EMAILS`;
- never grants ServerAdmin independently of the normal allowlist check;
- does not print authentication secrets;
- records a system-attributed privileged audit event when it changes state.

After verification, the deployment still needs the exact address in
`EIMIR_SERVER_ADMIN_EMAILS` and the normal API restart/recreate semantics apply to
allowlist changes.

## Account deletion boundary

ServerAdmin account deletion is intentionally **not** a direct row/table
deletion. Issue #520 owns the authoritative Account deletion and retention
lifecycle, including credentials, sessions, OWNER_ONLY data, shared history,
media references, jobs, backups, and restore reconciliation.

The ServerAdmin danger zone invokes that same lifecycle behind recent
authentication, impact confirmation and exact typed target confirmation. The
privileged audit records the operator request and projects the authoritative
lifecycle outcomes as `account_deletion_completed` or
`account_deletion_failed`. These outcome entries are an immutable operational
projection only: `AccountDeletion` remains the source of truth, retries cannot
create duplicate logical outcomes, and self-service deletions do not become
ServerAdmin audit events. Failure entries retain no exception prose or private
payload.

## Privileged action audit

Account administration actions use a separate narrow audit projection from the
boolean settings history. `InstanceAdministrationActionEvent` records only:

- actor Account ID, or system attribution for local break-glass work;
- target Account ID where applicable;
- typed action identifier;
- optional technical effect count such as revoked sessions;
- timestamp.

It never stores passwords, recovery proofs, free-form reasons, request bodies,
private relationship payloads, IP-history profiling, or provider secrets.

## Registration and maintenance controls

Registration policy and maintenance mode are persisted as application state,
not deployment-environment feature flags. `registration_enabled` records the
operator's registration policy; the effective registration state additionally
requires maintenance mode to be off. This keeps the stored operator choice
intact when maintenance is entered and left.

Clients can read the minimal unauthenticated `GET /api/v1/instance/status`
projection. It exposes only maintenance state, effective registration
availability, and the non-sensitive reason `administrator` or `maintenance`
when registration is unavailable. Web and Android treat connectivity failure
as a separate state and fail closed for advertising new-account creation.

An authenticated ServerAdmin can use:

- `GET /api/v1/server-admin/settings`;
- `PUT /api/v1/server-admin/settings/registration`;
- `PUT /api/v1/server-admin/settings/maintenance`;
- `GET /api/v1/server-admin/activity`.

Each mutation is authorized server-side and records a narrow audit event with
the actor, setting name, previous/new boolean value, and timestamp. The audit
record contains no product content, credentials, job payloads, or other private
data.

Maintenance mode rejects ordinary product API traffic, while health,
authentication/recovery, public instance status, and ServerAdmin endpoints stay
reachable. Background workers continue to run. This boundary deliberately
lets an operator sign in and leave maintenance mode without requiring shell or
database access.

Disabling registration blocks all supported new invited-account onboarding
paths, including local-password and OIDC onboarding. Existing accounts can
still authenticate and accept invitations. Initial bootstrap remains an
explicit lockout-recovery exception so a fresh Self-Hosted instance cannot be
made permanently inaccessible before its first operator account exists.

## Business model

Core ServerAdmin operations required to run a Self-Hosted eimir.
installation are operational administration and are not Premium-paywalled.
Hosted-service-specific capabilities must continue to use the authoritative
deployment and entitlement model rather than hardcoded client branching.

## Space lifecycle directory

`GET /api/v1/server-admin/spaces` and `GET /api/v1/server-admin/spaces/{spaceId}`
expose a deliberately narrow, read-only lifecycle projection derived from `Space` and
`Membership` state. The projection contains IDs, creation/lifecycle timestamps,
Membership status counts and coarse anomaly codes only.

It does **not** expose Account identity correlation, Space profile/relationship dates,
Memories, Notes, messages, media, OWNER_ONLY state or behavioral/engagement analytics.
Space termination, partner removal and reactivation remain outside this operator surface
until the authoritative lifecycle decisions in #518 are complete.

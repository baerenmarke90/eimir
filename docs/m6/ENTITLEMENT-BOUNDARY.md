# M6 Entitlement Boundary

**Workstream:** M6-F  
**Product/architecture decision owner:** #262 (Finalized via ADR 0006 and `FREEMIUM-FEATURE-MATRIX.md` v1.1)  
**Runtime owner:** #523  
**Provider adapters:** one focused follow-up per selected launch source

This document records the **runtime boundary** and technical architecture defined under ADR 0006 following the resolution of issue #262.

## 1. Current decision state

The repository has frozen these commercial and architectural principles:

- eimir. uses a genuine freemium model;
- Commercial entitlements are Space/couple-scoped (one partner purchases, both benefit);
- Self-Hosted vs. Cloud/Managed is an operating-model axis separate from Free vs. Premium;
- Essential Security, Privacy, Accessibility, Account/data deletion and portability are non-paywallable;
- Downgrade is strictly non-destructive: existing content is never deleted or hidden;
- Domain code checks normalized capabilities (e.g. `recap.pdf_yearbook`), not external store SKUs;
- Self-Hosted is 100% offline-resilient with Ed25519 offline license key validation;
- The backend remains authoritative for all capability evaluations.

## 2. Decisions #262 must freeze before #523

At minimum:

1. versioned capability/feature matrix;
2. relationship/couple vs. purchaser/account ownership;
3. exact lifecycle states to support;
4. whether a trial exists and its semantics, if any;
5. grace/grandfathering/refund/revocation behavior, if any;
6. read/create/edit/regenerate/export behavior under downgrade;
7. migration treatment for capabilities that existed before monetization;
8. shared-data behavior under expiry/separation;
9. Self-Hosted licensing/validation/offline behavior;
10. restore and source-conflict/reconciliation behavior;
11. launch commercial channels/sources;
12. Development/test/Demo entitlement behavior.

Until these are decided, no broad Premium-gating runtime is allowed.

## 3. Required architecture regardless of #262 outcome

The application boundary is:

```text
provider / store / license / promotion evidence
                  |
                  v
          source adapter boundary
                  |
                  v
         normalized Entitlement state
                  |
                  v
          Capability evaluation
                  |
      +-----------+-----------+
      |                       |
      v                       v
backend enforcement      safe client read model
      |                       |
      v                       v
Domain operation          Web / Android UX
```

Domain feature code asks a stable question such as “is capability X effective for
this authorized scope?” It does **not** ask “does this user have Google Play SKU Y?”

## 4. Authorization and entitlement are separate

The order of reasoning for protected server work remains:

1. authenticate caller;
2. establish Account/Space context;
3. enforce membership/ownership/Privacy/Tenant rules;
4. evaluate the required commercial capability if the accepted matrix requires it;
5. perform the Domain operation.

Premium is never authorization. An entitlement cannot make partner `OWNER_ONLY`
content readable or grant access to another Space.

Client presentation state never replaces server authorization/capability checks.

## 5. Normalized Entitlement core (#523)

#523 implements the accepted #262 model with:

- explicit owner/scope;
- stable capability identifiers;
- lifecycle/effective-time metadata only for states #262 accepts;
- trusted server-time evaluation;
- deterministic source reconciliation;
- idempotent grant/update/revocation processing;
- backend-authoritative capability evaluation;
- safe OpenAPI read model for clients;
- deterministic test/Development/Demo fixtures;
- restore/migration/reconciliation behavior;
- Audit/observability without provider secrets.

Do not implement unused speculative lifecycle states merely because they are easy to
add to an enum.

## 6. Source adapter boundary

After #262 selects the launch channels and #523 exists, create one focused adapter
issue/branch/PR per source.

A source adapter may own provider-specific concerns such as:

- SDK/API integration;
- SKU/product mapping;
- purchase/license verification;
- webhook/signature validation;
- restore/refresh;
- expiry/refund/revocation;
- idempotency/replay;
- provider outage/backoff;
- sandbox/test evidence.

It outputs only normalized source evidence/grants accepted by #523.

Provider-specific values must not enter:

- Domain feature models;
- general Account/Space authorization;
- unrelated OpenAPI models;
- ordinary user logs;
- client-side authority decisions.

## 7. Potential launch sources are examples, not decisions

The architecture supports sources such as:

- Google Play;
- a hosted subscription/billing provider;
- a Self-Hosted commercial license;
- promotional/grandfathered/manual operator grants;
- future stores.

This list is not a requirement that every source exists at G5. #262 must name the
sources needed by the declared first launch channels. #525 may mark an unselected
source `NOT_APPLICABLE` only when the launch scope makes that honest.

Do not create one omnibus multi-provider PR.

### 7.1 Declared first launch channel

Resolved (2026-09-05): **the first launch uses `ADMIN_GRANT` only.** No real
payment/store provider is part of the initial launch target.

- **`ADMIN_GRANT`** — required and implemented. A ServerAdmin-authorized
  manual grant/revoke surface
  (`POST/GET /server-admin/spaces/{spaceId}/entitlement...`) reuses the
  existing normalized `record_grant`/`revoke_grant` source-update interface
  from `#523` unchanged. This is the only entitlement source a launch actually
  needs before a real commercial channel is selected: it lets an operator
  extend Premium to a specific Space (beta testers, support cases, promotions)
  without inventing a second grant-mutation path.
- **`GOOGLE_PLAY`** — `NOT_APPLICABLE` for this launch. No Play Console
  access, product IDs, or server-side purchase-verification service account
  exist yet, and none are required for the declared first launch scope. Not
  implemented; no Play Billing SDK dependency was added.
- **`CLOUD_STRIPE`** — `NOT_APPLICABLE` for this launch. No Stripe account,
  product/price IDs, or webhook secret exist yet, and none are required for
  the declared first launch scope. Not implemented; no Stripe SDK dependency
  was added.
- **`SELF_HOSTED_KEY`** — `NOT_APPLICABLE` for this launch, despite the Ed25519
  offline-license verifier already existing
  (`backend/src/eimir/entitlements/offline_license.py`, unit-tested in
  isolation). That verifier is intentionally not wired into `record_grant`,
  configuration, or any endpoint: #523 explicitly scoped "Self-Hosted license
  issuer/adapter implementation" out, and no accepted decision requires it for
  the first launch.
- **`TEST_FIXTURE`** — unchanged: deterministic Development/Demo-only fixture
  path, already rejected in Production by
  `entitlements/service.py::_ensure_source_allowed`.

A future real commercial channel remains a separate, focused
issue/branch/PR when the product actually needs one — this decision does not
close that door, it only states what launch actually requires today.

## 8. Couple / relationship ownership

#262 must decide the ownership model, but M6 enforces these invariants regardless:

- entitlement scope is explicit and stable;
- no grant leaks between unrelated relationships/Spaces;
- a new partner does not inherit an old relationship grant by accident;
- relationship dissolution/offboarding behavior coordinates with #518;
- Account deletion coordinates with #520;
- shared history/data rights do not disappear destructively on commercial expiry;
- purchase-source identity and data-access identity remain separable concepts.

If one purchaser funds a relationship-level grant, the adapter/core must retain the
minimum information required to restore/reconcile it without giving the purchaser
extra content authorization.

## 9. Downgrade and non-paywallable capabilities

Global invariants:

- expiry/downgrade never deletes user content;
- essential export remains available;
- Account deletion remains available;
- Security/Privacy/accessibility protections remain available;
- existing shared history is not hidden merely to create conversion pressure;
- read vs. create/edit/regenerate may differ only according to the accepted #262
  matrix;
- downgrade is deterministic, explainable and testable.

A provider outage must not corrupt content or cause destructive state transitions.

## 10. Self-Hosted resilience

The Self-Hosted product must remain usable for Core/non-paywallable capabilities
when a commercial validation service is unreachable.

#262 decides whether Self-Hosted Premium uses a license/token or another source and
what bounded cached/grace behavior exists. #523/provider adapter then implements it
with server-side trusted time and explicit validity.

Do not create a permanent hard dependency where a healthy local instance becomes
completely unusable solely because a remote licensing endpoint is down.

Source-code license rights and runtime Premium entitlement are separate concerns.

## 11. Cloud/Managed behavior

Cloud/Managed may have centrally available subscription evidence and resource
accounting. That operational convenience does not change capability meaning.

The same normalized capability identifiers and Domain checks apply. Hosted resource
limits/quotas, if #262 accepts them, are modeled at the appropriate capability/
resource-accounting boundary rather than as arbitrary `if cloud` feature branches.

## 12. Restore and reconciliation

M6 must cover:

- reinstall/device change;
- purchase/license restore;
- provider replay/outage;
- stale cached entitlement state;
- refund/revocation;
- database restore from older entitlement state;
- Self-Hosted instance migration;
- relationship change/offboarding;
- Account deletion;
- incorrect/manipulated client clock.

After an application/database restore, normalized entitlement state is reconciled
from accepted source evidence according to #262. User data is never deleted merely
because commercial state is temporarily stale.

## 13. Development and Demo

Tests and authorized Development/Demo need deterministic entitlement states without
real payment.

The fixture path must:

- use the same normalized #523 evaluation path as production;
- be explicit and test-only/environment-bound;
- be impossible to activate as an ordinary Production “unlock everything” switch;
- respect the versioned capability matrix;
- let #524 exercise expiry/outage/downgrade/restore behavior reproducibly.

The public Demo from #304 is not allowed to bypass entitlement logic with a special
Domain branch.

## 14. Privacy, security and observability

Never expose/log:

- payment instrument data;
- full purchase receipts;
- license private/signing secrets;
- webhook secrets;
- provider credentials;
- bearer/session tokens;
- ProtectedPayload/`OWNER_ONLY` content.

Safe logs/audit may use provider-independent source type, normalized state change,
capability key, owner/scope identifier where appropriate and technical correlation
IDs, subject to normal privacy minimization.

## 15. G5 evidence

#524 must prove for every selected launch source and accepted lifecycle state:

- grant activation;
- server-side enforcement;
- no cross-Space leakage;
- restore/reconciliation;
- expiry/downgrade without data loss;
- outage/stale state behavior;
- refund/revocation where applicable;
- Self-Hosted offline behavior where applicable;
- deterministic Demo/Development state;
- non-paywallable controls remain available;
- no provider secrets/private content leak through diagnostics.

#525 passes the commercial-runtime portion of G5 only when #262, #523 and all
selected launch-source adapters have traceable evidence.

## 16. Explicit non-goals

M6-S0 does not:

- choose final prices;
- classify features instead of #262;
- choose a billing provider by implication;
- implement custom payment processing;
- assume every possible commercial channel ships at G5;
- allow client-only entitlement authority;
- make source-code secrecy the Premium enforcement mechanism.

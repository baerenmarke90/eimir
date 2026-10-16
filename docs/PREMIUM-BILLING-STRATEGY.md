# eimir. - Premium Billing Strategy

**Status:** authoritative commercial packaging baseline  
**Version:** 1.0  
**Decision date:** 2026-09-10  
**Owning product decision:** #876  
**Freemium strategy:** [FREEMIUM-FEATURE-MATRIX.md](./FREEMIUM-FEATURE-MATRIX.md)  
**Business model:** [BUSINESS-MODEL.md](./BUSINESS-MODEL.md)  
**Entitlement architecture:** [ADR 0006](m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md)

## Purpose and authority

This document defines the commercial packaging and billing strategy for eimir. / eimir. It translates the existing business/freemium model into a concrete consumer price and provider-integration direction without creating a second entitlement architecture.

Authority is intentionally split by concern:

1. Security, Privacy, Tenant Isolation, data rights, Accessibility, and Clean-Room requirements cannot be weakened by monetization.
2. [`BUSINESS-MODEL.md`](./BUSINESS-MODEL.md) defines the operating-model and commercial-license structure.
3. [`FREEMIUM-FEATURE-MATRIX.md`](./FREEMIUM-FEATURE-MATRIX.md) is authoritative for Free/Core, Premium, Mixed, and Non-paywallable capability classification.
4. [ADR 0006](m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md) and #523 define the provider-neutral runtime entitlement architecture.
5. This document owns customer-facing consumer packaging, reference pricing, provider-adapter direction, downgrade/grandfathering interpretation, and the interaction between billing and Self-Hosted licensing.

If this document appears to reclassify a feature differently from the authoritative feature matrix, the feature matrix wins and this document must be corrected.

---

## Commercial principles

The billing model follows these invariants:

- **The relationship Core stays meaningful without payment.** Premium adds value; it does not hold ordinary relationship history hostage.
- **One relationship, one consumer entitlement.** A purchase applies to the shared Space, not separately to each partner.
- **No artificial record-count paywalls.** Memories, Wishes, Plans, Places, Notes, and comparable core relationship entities are not limited by arbitrary commercial counts.
- **Managed resource costs may be bounded.** Cloud media byte volume, rendering, external providers, compute, and comparable real operating costs may have transparent limits or Premium boundaries.
- **Privacy, Security, Accessibility, deletion, and essential data portability are never Premium leverage.**
- **Downgrade is non-destructive.** Losing Premium never deletes relationship history.
- **Operating model and product tier stay separate.** Cloud/Self-Hosted answers who operates infrastructure; Free/Premium answers which commercially eligible product capabilities are active.
- **Commercial third-party use remains a separate license axis.** Consumer Premium does not grant SaaS/OEM/white-label rights.
- **Billing providers are adapters, not domain truth.** Product code consumes normalized capabilities only.
- **Self-Hosted remains offline-resilient.** Premium license verification must not require mandatory phone-home behavior.

---

## Consumer packaging

The initial consumer offer has two product tiers:

| Customer-facing tier | Internal entitlement concept | Purpose |
| --- | --- | --- |
| **Free** | `FREE` / Core capabilities | Complete meaningful relationship Core |
| **eimir. Pro** | `PREMIUM` | Richer relationship experiences, presentation, automation, insights, personalization, integrations, and managed-resource capabilities |

`eimir. Pro` is the customer-facing product name. `PREMIUM` remains the stable technical tier/capability concept used by the entitlement architecture.

### No Family tier in v1

A separate `Family` consumer tier is not part of the initial commercial model. Multi-Space/family packaging may be revisited only when the product has a concrete relationship-space use case that cannot be represented cleanly by the current model.

Do not pre-build Family billing, family-specific entitlement types, or a tier ladder solely for hypothetical future packaging.

---

## Reference pricing

Initial EUR reference pricing is defined **per relationship/Space**:

| Billing period | Reference price |
| --- | ---: |
| Monthly | **EUR 5.99** |
| Annual | **EUR 49.99** |

Twelve monthly payments equal EUR 71.88. The annual plan therefore saves EUR 21.89, approximately **30.5%** relative to twelve monthly payments.

### Space-level purchase semantics

A purchase by either current partner activates the corresponding Premium capabilities for the shared Space according to the entitlement semantics from #262 and ADR 0006.

The product must not require both partners to buy separate subscriptions for the same relationship Space.

The purchaser remains the billing owner/sponsor for provider renewal, invoice, cancellation, and restore/reconciliation purposes. Product authorization inside the Space still follows normal Membership and content-privacy rules.

### Currency and tax presentation

EUR is the initial reference price frozen by #876.

This document does not freeze independent USD or other regional price points. Provider/store catalogs may localize currency, tax display, and regional pricing where legally or commercially required, but those values belong to the commercial adapter/catalog boundary rather than the domain entitlement model.

---

## Cloud and Self-Hosted pricing

The initial consumer product direction uses the same EUR Pro reference price for both operating models:

> **eimir. Pro: EUR 5.99/month or EUR 49.99/year per Space, whether the Space is Cloud/Managed or Self-Hosted.**

This does not make the operating models technically identical.

### eimir. Cloud / Managed

Cloud provides managed operational value, including infrastructure, deployment, updates, backups, security maintenance, monitoring, managed email/push where applicable, and managed storage.

Cloud may impose transparent managed-resource limits because those resources create recurring operator cost. Storage quota values are governed by the current business/freemium documentation and remain working hypotheses until separately validated/frozen if that documentation says so.

### eimir. Self-Hosted

Self-Hosted users operate their own infrastructure and storage. Personal/noncommercial Free/Core remains fully usable under the repository's licensing model.

Premium can be unlocked through an offline-verifiable commercial entitlement without mandatory phone-home behavior. Self-Hosted must not be artificially degraded solely to make Cloud more attractive.

### Why equal consumer pricing is acceptable

The consumer purchase buys access to the eimir. Pro product experience. Cloud additionally bundles managed operation, while Self-Hosted gives technically capable users control over their own infrastructure.

The equal launch reference price is therefore a packaging decision, not a claim that the underlying operating costs are identical. Managed-resource quotas and future packaging can be reassessed using measured cost data without changing the entitlement architecture.

---

## Feature boundary

This document does not duplicate the complete feature matrix. [`FREEMIUM-FEATURE-MATRIX.md`](./FREEMIUM-FEATURE-MATRIX.md) remains authoritative.

The following interpretations are commercially important:

### Free/Core remains meaningful

Free/Core includes ordinary relationship-history ownership and use according to the matrix. There is no `200 Memories` limit or equivalent record-count gate.

Managed Cloud storage may still have a byte quota because storage and bandwidth create real ongoing cost.

### Privacy and security are not Premium benefits

The product must never frame privacy or security as a reason to upgrade. `OWNER_ONLY` enforcement, authentication security, account protection, tenant isolation, deletion rights, and comparable trust boundaries remain available independent of payment.

Premium automation may operate around a private feature, but the underlying privacy guarantee itself cannot be gated.

### Essential data portability remains Free/non-paywallable

Users must retain an essential machine-readable path to export their own authorized data and media according to the authoritative transfer/export contract.

Premium may add value-added output formats such as:

- designed printable chronicles;
- yearbooks;
- curated recap artifacts;
- high-resolution narrative layouts;
- other computationally expensive presentation/rendering outputs.

These richer artifacts are distinct from essential portability.

### Search remains Core unless explicitly reclassified

The existing authorized Search and multi-criteria filtering capability remains Free/Core under the current matrix.

A future semantic/vector/AI discovery capability may receive a separate classification if it creates materially different product value or ongoing compute/provider cost. It must not be silently folded into the current Search row to create an accidental paywall.

### `Gemeinsam spielen` is one Premium relationship capability

The `Gemeinsam spielen` product area defined by #866 is Premium and uses one relationship-scoped capability boundary for its game catalog.

Do not introduce:

- per-game purchases;
- game credits;
- per-round payments;
- separate Premium tiers for individual games.

Free users may receive transparent discoverability/preview UX, but starting Premium gameplay requires the normalized relationship-level capability.

Underlying source data used by a game retains its normal domain classification and authorization. Premium never grants access to private or otherwise unauthorized content.

### Automation boundary

A meaningful reminder/date-alert baseline remains Free where the matrix says so. Premium can provide advanced multi-step rules, custom triggers, automated recaps, and similar higher-value/background-compute features.

Do not move baseline attention/privacy controls behind Premium merely because the advanced automation system is monetized.

---

## Commercial third-party licensing is a separate axis

Consumer product entitlement and third-party commercial-use permission answer different questions:

```text
Consumer product tier
FREE / PREMIUM

Commercial third-party use right
NO / YES

Support / service contract
NONE / STANDARD / SLA / custom
```

A future Partner/Enterprise commercial offer may bundle several of these dimensions for convenience, but the underlying concepts must remain separable.

Examples:

- a private couple may have Premium without any third-party commercial-use right;
- a commercial operator may require a commercial license even if its required feature set is otherwise modest;
- an enterprise/partner agreement may bundle Premium, commercial rights, SSO/deployment services, and support without creating a new authorization model for ordinary relationship content.

The authoritative third-party commercial-use policy remains [`COMMERCIAL-LICENSE.md`](../COMMERCIAL-LICENSE.md).

---

## Provider-neutral billing architecture

ADR 0006 and #523 remain authoritative. Billing must feed the existing entitlement system rather than bypassing it.

```text
Stripe / App Store / Play / Offline License / Admin Grant
                         |
                         v
              Provider-specific adapter
                         |
                         v
                EntitlementGrant
                         |
                         v
           Central EntitlementService
                         |
                         v
              Stable capability keys
                         |
                         v
                 Product features
```

### Provider evidence stays at the adapter boundary

Store/provider identifiers such as:

- Stripe Product IDs / Price IDs / subscription IDs;
- Google Play product IDs / purchase tokens;
- App Store product IDs / transaction identifiers;
- offline-license serials or signed payload identifiers;

must not become general feature checks in product/domain code.

They may be persisted where needed for provider reconciliation, audit, restore, and idempotency, but they must be normalized into the central entitlement model before feature authorization is evaluated.

### No second entitlement registry

Do not introduce a second billing-owned `entitlements.yaml`, SKU-to-feature table, or parallel feature-flag truth that can diverge from the versioned feature matrix and central capability catalog.

Provider catalogs map commercial products to normalized grants/capabilities; they do not redefine the product taxonomy.

---

## Initial provider direction

### Direct Cloud/Web billing: Stripe first

Stripe is the initial provider direction for direct hosted/web billing because it can handle subscription checkout, recurring billing, invoices, webhooks, refunds, and customer billing management without requiring a custom payment processor.

The Stripe adapter must remain replaceable. Stripe-specific events are translated into normalized entitlement lifecycle changes.

Conceptually:

```text
Stripe Checkout / Billing Portal / Webhook
                 |
                 v
          Stripe billing adapter
                 |
                 v
        normalized EntitlementGrant
```

Before runtime implementation, perform the repository's normal reuse/provider review, including current API/SDK choice, licensing/terms, privacy/data flow, webhook verification, failure handling, cost, Self-Hosted impact, and operational fallback.

### App stores later

Google Play Billing and Apple App Store billing are added only when the corresponding distribution path requires them. They must map to the same normalized entitlement model and restore/reconciliation semantics.

Do not make app-store billing a prerequisite for the initial direct billing architecture.

---

## Self-Hosted Premium license strategy

The Self-Hosted Premium path follows ADR 0006:

- cryptographically signed license material;
- local verification using an embedded/project-controlled public verification key;
- no mandatory license-server phone-home for normal use;
- no relationship content transmitted for validation;
- deterministic mapping into normalized entitlement grants and capability keys;
- explicit expiry/revocation semantics where the signed license contract supports them.

The precise signed payload/schema belongs to the implementation/ADR boundary and should not be duplicated here.

### License and commercial-use rights are not the same concept

A Self-Hosted Premium consumer license unlocks Premium product capabilities for the licensed relationship/Space under the applicable terms.

It does not automatically grant the right to resell eimir. as SaaS, OEM, white-label, or another commercial third-party service. Those rights remain controlled by the separate commercial-license policy.

---

## Subscription and entitlement lifecycle

The canonical lifecycle states and technical transitions are defined by ADR 0006 and the feature matrix. This strategy adds commercial interpretation only.

### Active

An active, successfully reconciled paid subscription/license exposes the current normalized Premium capabilities for the entitled Space.

### Trial

The architecture supports `TRIAL`, but #876 does **not** freeze a final launch trial duration or whether payment details are required at trial start.

Trial packaging must be confirmed separately before commercial launch against current provider/store constraints and the desired conversion UX.

There is no feature-specific or game-specific trial subsystem.

### Grace period

The current authoritative entitlement documentation defines the grace behavior. Provider payment failures should map into that normalized state rather than creating provider-specific grace logic inside features.

### Expired / revoked

When a grant expires or is revoked, the Space loses the corresponding Premium capability for new Premium-only actions according to the non-destructive downgrade contract.

Authorization and privacy boundaries continue to apply independently of entitlement state.

---

## Non-destructive downgrade contract

Downgrade or license expiry must never become a deletion event.

Required behavior:

- existing relationship data remains intact;
- ordinary authorized reading remains available;
- essential data export remains available;
- existing generated Premium artifacts remain downloadable/readable where their normal retention contract permits;
- new Premium-only creation/regeneration/advanced processing may be disabled;
- losing Premium does not change `OWNER_ONLY`, Space Membership, or any other content-authorization class;
- Cloud storage over the Free managed-resource quota does not trigger deletion; it may pause new uploads until usage is reduced or Premium is restored.

A feature with unusual downgrade semantics must document them explicitly in the authoritative feature matrix/product decision before implementation.

---

## Grandfathering strategy

Default grandfathering is **commercial-price grandfathering**, not a frozen historical feature snapshot.

Example:

```text
Customer subscribed at EUR 5.99/month
Public price later changes
=> billing policy may preserve EUR 5.99/month for that existing subscription
```

An active normal Premium customer receives the current normalized Premium capability set unless an explicit product/migration decision defines a legacy exception.

Do not create a versioned permanent capability snapshot for every subscription purchase.

The existing `GRANDFATHERED`/legacy grant concept remains useful for explicit cases such as:

- migration from an older commercial model;
- founder/promotional/lifetime grants;
- administrator-issued compatibility grants;
- a deliberately retired capability that must remain available to a defined existing cohort.

Those cases require explicit grant semantics and should remain exceptional.

---

## Restore and reconciliation

Restore/reconciliation is a first-class commercial requirement because the entitlement belongs to a Space while provider purchase ownership belongs to an Account.

Provider adapters must support idempotent reconciliation so that replaying valid evidence does not duplicate entitlements or corrupt state.

A restore flow may re-bind an eligible active purchase to a valid Space according to the authoritative offboarding/relationship rules. It must never:

- leak Premium into unrelated Spaces;
- grant access to content outside normal Membership authorization;
- treat possession of a provider receipt/license as content authorization;
- duplicate paid subscriptions silently.

The exact re-binding rules must be implemented consistently with #518 and ADR 0006.

---

## Paywall and subscription UX

Monetization must remain transparent and low-pressure.

Required principles:

- clear price and billing period before external purchase confirmation;
- no fake scarcity, countdowns, or manipulative urgency;
- no modal spam across ordinary Core flows;
- explain what Premium adds rather than implying that existing data is at risk;
- explicitly reassure users that downgrade does not delete their memories/history;
- Free users may see contextual Premium previews where useful, but Core functionality must not be repeatedly interrupted;
- cancellation/renewal state must be understandable without provider terminology leaking into ordinary relationship UI;
- subscription management must use provider-supported secure flows where appropriate instead of collecting payment credentials directly in eimir.

User-facing copy remains localization-driven.

---

## Security and privacy boundary

Billing is an account/commerce subsystem and must not gain access to relationship payloads merely because it manages entitlements.

Provider integrations should receive only the data necessary for billing and reconciliation. Do not send Memories, HeartMoments, Notes, photos, partner mood/check-in data, relationship analytics, or other protected product payloads to a billing provider.

At minimum, provider implementations must define:

- webhook signature/authenticity verification;
- idempotency and replay behavior;
- mapping from external customer/purchase identity to internal billing owner without account enumeration;
- secret storage/rotation;
- safe logs and audit metadata;
- refund/chargeback/revocation behavior;
- retry/outage behavior;
- deletion/retention interaction;
- exact provider personal-data footprint.

Billing provider failure must not weaken content authorization or privacy checks.

---

## Initial implementation slicing

Do not implement billing as one cross-provider mega-PR.

Recommended order after #876 documentation is accepted:

### Slice 1 - direct hosted Stripe adapter

- provider-specific customer/subscription mapping;
- checkout/session creation through provider-supported primitives;
- webhook verification and idempotent event handling;
- normalized `EntitlementGrant` reconciliation;
- cancellation/renewal/failure mapping;
- provider-neutral API projection to clients;
- tests for replay, out-of-order events, refund/chargeback, and cross-Space isolation.

### Slice 2 - Self-Hosted signed-license adapter

- signed-license verification;
- safe installation/import flow;
- normalized grant creation/update;
- expiry/legacy behavior;
- offline operation and clock/tamper boundary according to ADR 0006;
- no phone-home dependency.

### Slice 3 - restore and account subscription management

- restore/re-bind contract;
- current billing owner/provider state presentation;
- secure link into provider billing management where applicable;
- non-destructive downgrade UX;
- entitlement refresh/reconciliation behavior.

### Slice 4 - app-store adapters when distribution requires them

- Google Play and/or App Store provider evidence;
- server-side verification where required;
- same normalized grant model;
- store-compliant restore/cancellation semantics;
- no app-store identifiers in feature/domain checks.

---

## Explicit non-goals

This strategy does not:

- introduce a Family tier;
- define a separate per-game SKU catalog;
- introduce credits or consumable relationship features;
- freeze final non-EUR regional prices;
- freeze final Cloud storage quotas or SLA commitments;
- freeze final trial duration/payment-detail policy;
- grant third-party commercial-use rights through consumer Premium;
- replace ADR 0006;
- replace the authoritative feature matrix;
- introduce a parallel entitlement registry;
- make Stripe mandatory for Self-Hosted;
- require license-server phone-home;
- permit billing state to override content authorization or privacy.

---

## Decision record

As of 2026-09-10 / #876:

1. Consumer packaging is **Free + eimir. Pro**.
2. `eimir. Pro` maps to the internal `PREMIUM` entitlement tier/capability set.
3. Price is **EUR 5.99/month** or **EUR 49.99/year** per Space.
4. Annual pricing represents approximately **30.5%** savings versus twelve monthly payments.
5. One current relationship Space requires one consumer Premium entitlement, not one subscription per partner.
6. No Family tier is introduced for v1.
7. No artificial count limit is introduced for Memories or other core relationship entities.
8. Privacy, Security, Accessibility, deletion, and essential data portability remain non-paywallable.
9. `Gemeinsam spielen` is a single relationship-scoped Premium capability under #866; no per-game purchases.
10. Existing Search remains Core; future materially different AI/semantic discovery requires separate classification.
11. Initial EUR Pro pricing is the same for Cloud and Self-Hosted while operating-model responsibilities remain distinct.
12. Third-party commercial-use licensing remains a separate axis from consumer Premium.
13. Stripe is the initial direct hosted billing provider direction, implemented only behind a provider adapter.
14. Self-Hosted Premium uses offline-verifiable signed license material without mandatory phone-home.
15. Default grandfathering preserves commercial price where applicable; it does not freeze the historical Premium feature set for every customer.
16. Trial duration and non-EUR regional price points remain separate pre-launch decisions.

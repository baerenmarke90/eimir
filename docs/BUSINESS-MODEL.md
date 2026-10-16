# eimir. – Product and Business Model

## Goal

eimir. is intended to combine two models:

1. technically proficient private users can operate the application themselves;
2. private users who do not want to administer their own server can use the officially operated eimir. Cloud service.

Cloud monetization is based on operations, convenience, and service — not on artificially degrading the functionality of the Self-Hosted build.

## Operating models

### eimir. Self-Hosted

eimir. Self-Hosted is intended for private users who want to install and operate eimir. themselves.

Personal and other noncommercial use is governed by the [PolyForm Noncommercial License 1.0.0](../LICENSE).

Self-Hosted users are responsible in particular for:

- installation and updates;
- server and database operations;
- TLS, domain, and reverse proxy;
- backups and recovery;
- monitoring and availability;
- email and push infrastructure where those functions require external infrastructure;
- storage and operating costs.

Self-Hosted should use the shared Application Core and must not be artificially stripped of Core functionality solely to promote the Cloud. Differences may result from the operating model, for example managed infrastructure, available integrations, storage, or service offerings.

### eimir. Cloud

eimir. Cloud is the officially operated Managed Service for users who want to use eimir. without administering infrastructure themselves.

Users primarily pay for operations and the associated services, for example:

- provisioned and maintained infrastructure;
- automatic updates and migrations;
- backups and recovery processes;
- monitoring and availability;
- security maintenance;
- managed storage;
- email, push, and comparable operational services;
- an immediately usable Web and app experience without self-administered servers.

The Cloud may be offered with managed-resource limits or additional service packages, for example based on storage, service scope, or operational support. Consumer Pro reference pricing is now defined below and in [`PREMIUM-BILLING-STRATEGY.md`](./PREMIUM-BILLING-STRATEGY.md); final storage limits, add-ons, and SLA commitments still require cost/market validation before commercial launch.

## Product tiers

The operating model and the product tier are separate axes.

- **Self-Hosted vs. Cloud/Managed** answers who operates the infrastructure, storage, backups, updates, monitoring, and comparable services.
- **Free vs. Premium** answers which product capabilities are commercially eligible.

The customer-facing paid consumer product is named **eimir. Pro**. It maps to the existing internal `PREMIUM` entitlement tier/capability model; technical authorization must continue to use stable capability concepts rather than the marketing name.

The authoritative classification of capabilities across the entire roadmap (M0–M8) is recorded in [`FREEMIUM-FEATURE-MATRIX.md`](./FREEMIUM-FEATURE-MATRIX.md) (Version 1.2) and architecturally specified in [ADR 0006](m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md).

The baseline deliberately keeps the relationship Core available as Free/Core or as the Free side of a Mixed capability. Premium adds richer presentation, automation, advanced organization, insights, personalization, integrations, relationship-native Premium experiences, and managed-resource services rather than revoking access to users' existing relationship history.

Entitlements are owned at the couple/Space level: when one partner purchases Premium, both partners in the Space receive full Premium capabilities immediately. Downgrades are strictly non-destructive: existing content is never deleted or made unexportable.

A separate `Family` consumer tier is not part of the initial commercial model. It may be revisited only when a concrete multi-Space/family product requirement justifies a distinct package.

## Consumer Pro pricing

Product Owner decision #876 freezes the initial EUR consumer reference price per relationship/Space:

| Billing period | eimir. Pro reference price |
| --- | ---: |
| Monthly | **EUR 5.99** |
| Annual | **EUR 49.99** |

Twelve monthly payments equal EUR 71.88. The annual plan therefore saves EUR 21.89, approximately **30.5%** compared with twelve monthly payments.

One current relationship Space needs one consumer Premium entitlement. The purchasing Account remains the commercial sponsor/billing owner, but both current partners receive the active Space-level Premium capabilities under the normal Membership and privacy boundaries.

EUR is the initial reference price. Independent USD or other regional price points, tax display, and store/provider localization are not frozen by this document and belong at the commercial provider/catalog boundary.

The initial product direction uses the same EUR consumer Pro reference price for **Cloud/Managed and Self-Hosted**. This is a packaging decision, not a claim that their operating costs are identical:

- Cloud bundles managed operation and may use transparent managed-resource quotas;
- Self-Hosted users provide and operate their own infrastructure;
- Self-Hosted Core remains a real noncommercial product and is not artificially degraded to sell Cloud.

The detailed packaging, provider-adapter, downgrade, restore, Self-Hosted license, and grandfathering rules are recorded in [`PREMIUM-BILLING-STRATEGY.md`](./PREMIUM-BILLING-STRATEGY.md).

## Official apps and clients

Official Web, Android, and potentially additional clients are part of the eimir. product.

The commercial value of the official Cloud does not come from technically excluding Self-Hosted users from the official clients, but from the convenience of a fully operated service. Where technically and securely appropriate, the official clients should therefore be able to work with both eimir. Cloud and compatible Self-Hosted instances.

App-store publication, signing, update channels, push infrastructure, and other distribution or platform services provided by the project operator may be tied separately to the official operation where this is required for technical, security, or economic reasons.

## Commercial use by third parties

Publishing the source code does not grant general permission for commercial use.

Third parties require a separate commercial license in particular for:

- a paid eimir. hosting or SaaS service;
- integration into a commercial product;
- White-Label or OEM offerings;
- commercial redistribution or marketing.

The authoritative project policy is documented in [COMMERCIAL-LICENSE.md](../COMMERCIAL-LICENSE.md).

Commercial-use rights remain a **separate licensing axis** from consumer Free/Premium entitlement. A future Partner/Enterprise offer may bundle Premium capabilities, commercial-use rights, support/SLA, SSO, deployment, or other services for convenience, but consumer Premium alone does not grant third-party SaaS/OEM/white-label rights.

## Community contributions

Community forks and Pull Requests are explicitly welcome. Changes may be merged into the main branch after review when they fit the project functionally, technically, and strategically.

The Maintainers decide whether to accept a contribution. Contributions are governed by [CONTRIBUTING.md](../CONTRIBUTING.md) and the [Contributor License Agreement](../CLA.md), so accepted Contributions can be reused with legal clarity both in the noncommercial model and under later commercial licensing.

## Development consistency rule

This business model is an active development constraint, not only a commercialization or launch document.

Every human- or AI-assisted development change must review its consistency with this model and the current [`FREEMIUM-FEATURE-MATRIX.md`](./FREEMIUM-FEATURE-MATRIX.md) before implementation and record the result in the pull request. The review may conclude that a change has no business/freemium impact, but that conclusion requires a short rationale.

The review must be revisited before merge if implementation decisions changed any of the following:

- Free/Premium/Mixed/non-paywallable feature classification;
- entitlement or capability boundaries;
- relationship/couple ownership of commercial entitlements;
- Self-Hosted versus eimir. Cloud/Managed behavior;
- managed storage, compute, rendering, provider/API, inference, email/push, support, or comparable ongoing cost;
- quotas, storage limits, fair-use rules, retention, or other managed-resource behavior;
- trial, grandfathering, downgrade, restore, export, or existing-data semantics;
- customer-facing commercial packaging or provider/catalog mapping.

A change must not silently introduce a business-model contradiction. If a development decision requires changing this model or the authoritative Free/Premium feature matrix, the product decision and documentation change must be explicit and traceable before merge.

[`FREEMIUM-FEATURE-MATRIX.md`](./FREEMIUM-FEATURE-MATRIX.md) (Version 1.2) is authoritative for all product capabilities across M0–M8. [`PREMIUM-BILLING-STRATEGY.md`](./PREMIUM-BILLING-STRATEGY.md) is authoritative for the approved consumer packaging/reference price and billing-provider integration strategy; it does not override feature classification or ADR 0006.

The concrete implementation and pull-request rules are defined in [`AGENTS.md`](../AGENTS.md).

## Product principles

The business model follows these principles:

- **Self-Hosting remains a real product.** It is not merely a demo for the Cloud.
- **The Cloud sells convenience and operations.** Its added value is a managed service.
- **Product tier and operating model are separate.** Cloud does not mean Premium, and Self-Hosted does not automatically mean Free.
- **One shared Application Core.** Cloud and Self-Hosted should not diverge unnecessarily.
- **No artificial degradation.** Core functionality is not removed from Self-Hosted solely for monetization.
- **No artificial core-data count limits.** Managed-resource quotas may limit Cloud byte/storage/compute usage, but ordinary relationship entities are not rationed to manufacture an upgrade trigger.
- **Privacy, Security, Accessibility, deletion, and essential data portability remain non-paywallable.** Commercial packaging must not weaken trust or data rights.
- **Consumer Premium is Space-scoped.** One purchase benefits both current partners in the relationship Space.
- **Commercial use remains controlled.** Third parties require a separate license for it.
- **Community contributions can flow back.** The Maintainers decide whether they are accepted into `main`.
- **Privacy remains a product characteristic.** Monetization must not rely on advertising, selling personal data, or unnecessary tracking.
- **Business-model consistency is checked during development.** Product, entitlement, Cloud/Self-Hosted, managed-resource, and downgrade assumptions must remain traceable as the implementation evolves.

## Positioning

Future communication may explain the operating model along these lines:

> You can self-host eimir. for personal, noncommercial use. If you do not want to operate your own server, install updates, or manage backups, you can instead use eimir. Cloud as a fully operated service.

A compatible product-tier message is:

> Free lets a couple meaningfully use eimir. eimir. Pro helps them turn their shared data into richer experiences through presentation, automation, insights, personalization, integrations, and relationship-native Premium experiences.

A compatible consumer price message is:

> eimir. Pro costs EUR 5.99 per month or EUR 49.99 per year for the relationship Space — one purchase for both partners.

## Not yet defined

The initial consumer plan name and EUR reference price are now defined by #876. The following commercial details remain intentionally open until pre-launch validation or the relevant distribution path requires them:

- final Cloud storage quotas and paid storage add-ons;
- SLA/support commitments and any partner/enterprise packaging;
- final trial duration and whether payment details are required at trial start;
- independent non-EUR regional price points and app-store price tiers;
- taxes/fees presentation details required by each provider/store.

The 5 GB Cloud Free / 50 GB Cloud Premium values currently discussed in #262 and the feature matrix remain working hypotheses until cost/market validation is complete; they are not runtime constants or final commercial commitments in this document.

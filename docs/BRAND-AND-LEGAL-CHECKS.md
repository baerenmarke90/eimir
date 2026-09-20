# eimir. Brand and Launch Verification

**Status:** Repository-side audit and external launch ledger for Issue #639  
**Effective Date:** September 20, 2026  
**Canonical Brand:** `eimir.`  
**Primary Claim:** "Euer gemeinsamer Ort."

---

## 1. Purpose and evidence boundary

This document records the repository-side brand migration state for **eimir.** and separates it from checks that require external systems, legal review, or launch operations.

It is authoritative only for facts that can be verified from the repository and linked project decisions. It does **not** claim trademark clearance, domain ownership, store-name availability, social-handle ownership, or legal risk classification unless that evidence is explicitly attached from the relevant external source.

The document records:

1. the canonical `eimir.` brand decision and the evaluated `Lomu` alternative;
2. preliminary trademark-class candidates that still require external/legal confirmation;
3. domain, store, and social targets without claiming availability;
4. the audit matrix for Issue #639;
5. the remaining external/manual launch tasks.

---

## 2. Naming and brand decision

### Canonical brand: `eimir.`

- **Styling:** lowercase with terminal dot: `eimir.`.
- **Accented dot:** display lockups use the established brand accent tokens.
- **Machine identifiers:** code, namespaces, repositories, and environment variables use `eimir` without the terminal dot where punctuation is not appropriate or compatible.
- **Legacy compatibility identifiers:** retained identifiers are documented in `docs/PROJECT-IDENTITY-MIGRATION.md`.

### Evaluated alternative: `Lomu`

`Lomu` remains recorded as an evaluated alternative from the naming exploration. The product decision is now `eimir.`; the repository should not maintain two competing public brands.

The selection rationale is product/brand positioning, not a trademark-clearance conclusion. Trademark distinctiveness and collision risk require an external register search and, before filing, appropriate legal review.

---

## 3. Trademark classification: preliminary candidates only

The repository audit identifies the following **candidate** Nice classes from the product capabilities. These are not a final filing recommendation and do not replace a current DPMA/EUIPO/WIPO classification and collision review.

| Candidate class | Product capability that may be relevant | Status |
| --- | --- | --- |
| **9** | Downloadable software / mobile application packaging | Candidate; confirm goods wording before filing |
| **38** | Communications / transmission functionality where the offered service falls within telecommunications scope | Candidate; legal/classification review required |
| **42** | SaaS, hosted software, cloud storage, software maintenance | Candidate; confirm services wording before filing |
| **45** | Relationship-oriented personal/social service aspects, only if the concrete offered service falls within this class | Candidate; legal/classification review required |

### External clearance still required

The repository does not contain sufficient evidence to make a legal collision-risk statement. Before public filing or relying on the name commercially, complete and retain a dated external search covering at least:

- DPMAregister for Germany;
- EUIPO/TMview for EU-relevant marks;
- WIPO Global Brand Database for relevant international registrations;
- identical, similar, and phonetically similar marks;
- the goods/services actually intended for filing.

Record the search date, query variants, relevant hits, classes/goods/services, and the resulting filing decision. Do not translate absence of an obvious identical hit into a legal "low risk" conclusion without that review.

---

## 4. Domain, store, and public-presence targets

### Domains

- **Candidate public application domain:** `eimir.app`.
- **Additional candidate domain:** `eimir.de`.
- **Repository example domain:** `demo.eimir.example`.
- **Current compatibility demo origin:** `demo.sbs.ur-cloud.de` until an explicit DNS cutover is performed.

Repository documentation of a target domain does not prove registration, ownership, DNS readiness, or certificate issuance.

### Mobile app stores

- **Visible app title target:** `eimir.`.
- **Claim:** "Euer gemeinsamer Ort."
- **Android application ID:** `de.sidebyside.app` remains a compatibility identifier where required by the existing Capacitor packaging/store continuity contract.
- **Android code namespace:** `de.eimir.app`.

Store-name availability, listing ownership, signing configuration, and publication state remain external checks. Android/store delivery is not automatically part of the first Web/Self-Hosted launch channel.

### Social and public handles

- **GitHub:** `baerenmarke90/eimir`.
- **Candidate handles:** `@eimirapp` / `@eimir.app`.

Availability or reservation of those handles has not been established by this repository audit.

---

## 5. Audit matrix for Issue #639

| #639 checklist item | Classification | Current state / evidence |
| --- | --- | --- |
| **1. Naming / brand decision** | | |
| Document `eimir.` as preferred brand | ALREADY_RESOLVED | Brand guidelines, identity migration, and Product Reference use `eimir.` as canonical brand. |
| Document `Lomu` as explicit alternative | RESOLVED_HERE | Section 2 records the evaluated alternative without keeping it as an active public brand. |
| In-depth DPMA / EUIPO / WIPO clearance check | EXTERNAL_LAUNCH_STEP | Not completed by this repository audit; Section 3 defines the evidence still required. |
| Determine final Nice classes / goods and services | EXTERNAL_LAUNCH_STEP | Candidate classes are documented; final legal/classification selection remains external. |
| Verify domain availability / ownership | EXTERNAL_LAUNCH_STEP | Candidate domains are documented; availability and ownership remain external. |
| Review Google Play / App Store availability | EXTERNAL_LAUNCH_STEP | Store identity targets are documented; availability/publication remains external. |
| Review social-media handles | EXTERNAL_LAUNCH_STEP | Candidate handles are documented; reservation remains external. |
| **2. Brand foundation** | | |
| Finalize wordmark `eimir.` | ALREADY_RESOLVED | Established in `docs/eimir-brand-guidelines.md` and `web/src/components/Brand.tsx`. |
| Confirm claim "Euer gemeinsamer Ort." | ALREADY_RESOLVED | Established in Web/PWA and brand documentation. |
| Define color tokens | ALREADY_RESOLVED | Authoritative tokens live in `design/tokens.json`. |
| Define typography mapping | ALREADY_RESOLVED | Brand guidelines and self-hosted Web fonts define the mapping. |
| Define radius, surface, and shadow tokens | ALREADY_RESOLVED | Defined in design tokens and consumed by the Web UI. |
| Define icon and illustration principles | ALREADY_RESOLVED | Brand/design-system guidance exists. |
| Support light and dark theme | ALREADY_RESOLVED | Implemented and covered by theme tests. |
| Preserve contrast requirements | ALREADY_RESOLVED | Automated contrast coverage remains in the Web test suite. |
| **3. Logo system** | | |
| Document legacy two-ring motif as foundation | ALREADY_RESOLVED | Brand guidelines document the evolved two-ring motif. |
| Create `eimir.` variant | ALREADY_RESOLVED | Brand component and favicon exist. |
| Create monochrome variant | RESOLVED_HERE | Existing Capacitor monochrome launcher vector geometry is corrected; PWA maskable artwork already exists. |
| Create small-size variant | ALREADY_RESOLVED | Compact brand mark and favicon assets exist. |
| Android app icon | ALREADY_RESOLVED | Existing Capacitor wrapper contains adaptive launcher assets. |
| iOS App Store icon/package | EXTERNAL_LAUNCH_STEP | The Web apple-touch icon is not proof of an App Store-ready iOS asset/catalog; validate when iOS packaging enters launch scope. |
| Web favicon | ALREADY_RESOLVED | Canonical vector favicon exists. |
| Header brand lockup | ALREADY_RESOLVED | Shared brand components exist. |
| Store / marketing artwork | ALREADY_RESOLVED | Existing Play-store artwork is present; actual store acceptance remains external. |
| **4. Web rebrand** | | |
| App shell and header | ALREADY_RESOLVED | Canonical Product Reference implementation uses `eimir.`. |
| Desktop navigation / shell | ALREADY_RESOLVED | Current Web reference implementation accepted. |
| Mobile navigation | ALREADY_RESOLVED | Current Web reference implementation accepted. |
| Today / Wir | ALREADY_RESOLVED | Product Reference implementation accepted. |
| Momente / Discover | ALREADY_RESOLVED | Product Reference implementation accepted. |
| Momente / Timeline | ALREADY_RESOLVED | Product Reference implementation accepted. |
| Planning | ALREADY_RESOLVED | Product Reference implementation accepted. |
| More / utility area | ALREADY_RESOLVED | Product Reference implementation accepted. |
| Profile and settings | ALREADY_RESOLVED | Current implementation uses canonical identity. |
| Notifications | ALREADY_RESOLVED | Current implementation uses canonical identity. |
| Quick Create | ALREADY_RESOLVED | Product Reference implementation accepted. |
| Dialogs and forms | ALREADY_RESOLVED | Shared token-based Web patterns are in place. |
| Empty / loading / error / offline states | ALREADY_RESOLVED | Current Web/PWA states are in place. |
| **5. Android rebrand** | | |
| Native Android screen-theme alignment | CONSCIOUSLY_OBSOLETE | ADR 0011 makes the Web UI canonical; duplicate Compose screens are retired. |
| Android logo / app icon | ALREADY_RESOLVED | Existing Capacitor wrapper assets use the current brand. |
| Android splash / launch packaging | ALREADY_RESOLVED | Existing Capacitor wrapper packaging is present. |
| Native top/bottom navigation | CONSCIOUSLY_OBSOLETE | Canonical navigation is rendered by the shared Web UI. |
| Screen-by-screen native parity | CONSCIOUSLY_OBSOLETE | No duplicate native screen implementation is maintained. |
| **6. Technical migration** | | |
| Migrate technical namespaces and repository | ALREADY_RESOLVED | Repository and active project identity migration completed through #953/#954. |

---

## 6. External and manual launch checklist

These tasks require external systems, operator access, or legal review and must not be marked complete from repository state alone.

- [ ] **Trademark clearance and filing decision**
  - perform dated DPMA/EUIPO/TMview/WIPO searches;
  - confirm the goods/services wording and final Nice classes;
  - obtain appropriate legal review before relying on a clearance conclusion;
  - decide the filing strategy (for example German and/or EU protection) from that evidence.

- [ ] **Domain and TLS**
  - verify registration/ownership of the selected production domain;
  - configure DNS and TLS;
  - record the canonical public origin used by release/deployment configuration.

- [ ] **Demo DNS cutover**
  - move the compatibility demo origin only after the production/demo hostname is selected;
  - update reverse-proxy, allowed-host, and CORS configuration;
  - verify the public Demo isolation contract after cutover.

- [ ] **Store setup when a native store channel enters launch scope**
  - verify listing-name availability and account ownership;
  - validate signing/package identities and required artwork;
  - provide the public privacy-policy URL;
  - do not treat the presence of Capacitor assets as a published store release.

- [ ] **Social handles**
  - check and secure the selected public/support handles on the platforms actually used.

- [ ] **Public metadata finalization**
  - once the canonical public origin and share artwork are frozen, add absolute canonical/preview URLs where required by external crawlers.

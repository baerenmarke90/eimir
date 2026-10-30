# eimir. - Freemium Feature Matrix

**Status:** authoritative product-tier and roadmap baseline  
**Version:** 1.9

**Audit date:** 2026-09-21  
**Revision:** 2026-10-30 — Plan photo galleries (#1514, Free/Core); PO-approved special-Plan countdown (#504, Free/Core) and automatic relationship recap artifacts (#497, #1528); shared Wish selection (#1535, Free/Core)

**Audited `main` baseline:** `dfc87cd`  
**Strategic decisions:** #262 (Finalized), #876 (consumer packaging/pricing), #1151 (Today Pro Foundation)  
**Entitlement architecture:** [ADR 0006](m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md)  
**Billing strategy:** [PREMIUM-BILLING-STRATEGY.md](./PREMIUM-BILLING-STRATEGY.md)

## Purpose and authority

This document records the authoritative repository-wide business/freemium classification for all current (M0–M3) and planned (M4–M8) capabilities of eimir. following the resolution of issue #262 and the commercial packaging reconciliation in #876.

It defines the commercial boundaries, entitlement ownership semantics, downgrade guarantees, and licensing rules across both the **eimir. Self-Hosted** and **eimir. Cloud** operating models.

When sources appear to conflict:

1. Security, Privacy, Tenant Isolation, data rights, and Clean-Room requirements cannot be weakened by monetization.
2. `specification/CLEAN-ROOM-MASTER-SPEC.md` and `specification/PRODUCT-SPEC.md` remain binding for product and technical requirements.
3. `docs/BUSINESS-MODEL.md` defines the operating and commercial model.
4. This matrix defines the authoritative product-tier classification.
5. `docs/m6/ADR-0006-ENTITLEMENT-ARCHITECTURE.md` defines the technical entitlement and licensing architecture.
6. `docs/PREMIUM-BILLING-STRATEGY.md` defines the approved consumer packaging/reference price and provider-adapter billing strategy without overriding classifications in this matrix.

Any future change to an existing classification requires an explicit, versioned matrix revision before runtime gating changes are implemented.

---

## Executive summary & commercial pillars

eimir. adheres strictly to a genuine **freemium model**:

> **Free lets a couple meaningfully use eimir. as their complete relationship home. Premium enriches that foundation through advanced presentation, automation, longitudinal insights, relationship-native experiences, third-party integrations, and managed cloud resources — without ever holding existing shared history hostage.**

### Core principles

1. **Couple/Space-level entitlement ownership:** eimir. is a shared couple product. A commercial purchase by either partner applies to the entire shared Space. Both partners immediately benefit from Premium capabilities within that Space.
2. **Strict non-destructive downgrade:** Downgrading or license expiry **never deletes or hides user data**. All existing memories, chapters, photos, and answers remain 100% readable and exportable. Only the creation of new Premium-tier items or regeneration of heavy artifacts is paused.
3. **Self-Hosted independence:** The Self-Hosted build is a complete, first-class product under the [PolyForm Noncommercial License 1.0.0](../LICENSE). It functions fully offline without any forced phone-home connection. Optional commercial Self-Hosted licenses use cryptographically signed offline tokens.
4. **No micro-limits on core data:** There are no artificial paywalls on the number of memories, wishes, plans, places, notes, or list items. Cloud storage limits apply transparently to durable media byte volume, not domain entity counts.
5. **Privacy and trust are non-paywallable:** Security, authentication, passkeys, owner-only private entries (`PrivateNote`, `GiftIdea`), account deletion (#520), space offboarding (#518), and accessibility features can never be gated behind Premium.
6. **Essential data portability is non-paywallable:** Users must always retain a machine-readable path to export their own authorized relationship/account data and media. Premium may sell richer presentation artifacts, not the basic right to leave with one's data.
7. **Consumer packaging remains simple:** The customer-facing paid tier is `eimir. Pro`, mapped to the internal `PREMIUM` entitlement concept. A separate Family tier is not part of v1.
8. **Commercial third-party use is a separate axis:** Consumer Premium entitlement does not grant SaaS/OEM/white-label or other third-party commercial-use rights.

---

## Classification vocabulary

### Free/Core
A core capability available to all users without payment. Standard use of the capability is unlimited by entity count.

### Premium
An advanced capability accessible only under an active Premium entitlement (e.g. relationship-native Premium games, printable book generation, annual video recaps, deep analytical mirrors, external tool integrations).

### Mixed
A capability with a functional Free baseline and clearly demarcated Premium extensions. The boundary between the Free baseline and Premium extension is explicitly defined in this matrix.

### Non-paywallable
Capabilities essential for Security, Privacy, Accessibility, Tenant Isolation, account protection, deletion, or fundamental data portability. These must never be paywalled.

---

## Authoritative feature & capability matrix (M0–M8)

| Capability / Surface | Milestone | Classification | Gating boundary | Operating model impact | Strategic rationale |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Account identity & registration** | M1 | **Free/Core** | Whole feature Free | Identical across Cloud and Self-Hosted | Every user must be able to create an account and access the product. |
| **Authentication security, Passkeys & Session protection** | M1 | **Non-paywallable** | Non-paywallable | Identical | Account protection and authentication security are fundamental trust requirements. |
| **Self-Hosted authentication mechanisms (Password, OIDC)** | M1 | **Free/Core** | Whole feature Free | Self-Hosted specific | Authentication standards are infrastructure mechanisms, not commercial content integrations. |
| **Space creation, Membership & Partner invitations** | M1 | **Free/Core** | Whole feature Free | Identical | The couple Space is the core product entry point. |
| **Tenant isolation & Authorization boundary** | M1 | **Non-paywallable** | Non-paywallable | Identical | Isolation between tenants is a non-negotiable security invariant. |
| **SpaceProfile & Relationship context** | M1 | **Free/Core** | Whole feature Free | Identical | Basic couple anniversary and relationship context are core baseline. |
| **PartnerProfile & ProfilePreferences** | M1 | **Free/Core** | Whole feature Free | Identical | Managing personal and shared preferences is part of the basic product. |
| **RelatedPerson & ImportantDate management** | M1, M5 | **Mixed** | **Free:** Basic CRUD & standard date tracking.<br>**Premium:** Multi-condition occasion automation & recurring reminders. | Identical | Storing friends/family is basic utility; automated complex workflows are Premium. |
| **Memory CRUD & Timeline history** | M2, M5 | **Free/Core** | Whole feature Free (no count limit) | Identical | Memories are the emotional heart of eimir. |
| **Image attachment upload & storage** | M2, M5 | **Free/Core** | Functional feature Free | **Self-Hosted:** Unmetered (operator storage).<br>**Cloud:** Subject to Space storage quota. | Image uploading is core to memories; Cloud storage has operational byte costs. |
| **Shared photo gallery (#601)** | M2, M5 | **Free/Core** | Browse existing shared images, fullscreen viewing and canonical moment links | Identical | Another read view of shared relationship history; no new entitlement or upload quota. |
| **Cloud storage quota** | M2, M6 | **Mixed** | **Current planning hypothesis, not final launch commitment:** Free 5 GB per Space; Premium 50 GB per Space, potentially expandable via add-ons. | Cloud only (Self-Hosted is unmetered) | Managed storage and bandwidth create real recurring infrastructure cost; final quotas/add-ons require cost validation. |
| **Media privacy & attachment validation** | M2 | **Non-paywallable** | Non-paywallable | Identical | Security checks, media validation, per-attachment sensitive classification and accessible blur/reveal must execute identically for all users (#1477). |
| **HeartMoments & Shared emotional reactions** | M2, M5 | **Free/Core** | Whole feature Free | Identical | Everyday emotional connection must remain frictionless. |
| **Authored Memory / HeartMoment tags (#1290)** | M2, M5 | **Free/Core** | Create, remove and edit custom context labels on existing moments | Identical | Labels are part of the protected parent content; eight labels of forty Unicode codepoints are validation bounds, not history quotas. Existing tags and export remain available without entitlement changes. |
| **HeartMoment `PRIVATE` / `OWNER_ONLY` enforcement** | M2 | **Non-paywallable** | Non-paywallable | Identical | Partner privacy can never depend on commercial tier. |
| **Milestone tracking** | M2, M5 | **Free/Core** | Whole feature Free | Identical | Shared couple milestones belong to the core baseline history. |
| **Comments on shared entries** | M2, M5 | **Free/Core** | Whole feature Free | Identical | In-app communication around shared memories is basic functionality. |
| **Preset reactions on Memory photos (#1485)** | M2, M5 | **Free/Core** | One changeable/removable preset reaction per account and bound photo | Identical | Basic shared Memory communication, protected with its parent; no provider, entitlement or media-processing cost. Export and existing-data access remain available. |
| **Wish & Plan lifecycle** | M3, M5 | **Free/Core** | Whole feature Free | Identical | Shared bucket list and couple planning are everyday core tools. |
| **Shared Wish selection (#1535)** | M3, M5 | **Free/Core** | Current two-to-five-Wish round, private favorites, explicit intersection sharing and canonical Plan continuation. | Identical | PO-approved 2026-10-30 extension of everyday planning. One current round is temporary decision state, not an entity-count paywall. Original Wishes/Plans remain unlimited; personal choices remain owner-only, exportable and removable independently of any commercial tier. |
| **Special-Plan anticipation countdown (#504)** | M5, M7 | **Free/Core** | Deliberate special-event flag on existing Plans; one server-selected next event in the existing Today upcoming module. Timed Plans count down locally to seconds; date-only Plans retain calendar-day precision (PO follow-up, 2026-10-29). | Identical | Basic shared anticipation is Core. No second calendar, notification series or automatic Memory. No extra polling. The flag participates in existing export/restore. |
| **Relationship passport and automatic recaps (#497, #1528)** | M5, M7 | **Premium composition / Free retained artifacts** | Automatic monthly/yearly composition, local AI wording, manual selection/variants and new editions require Space capability `relationship.passport`. Live lifetime counters and composed rediscovery remain Pro. Existing duration, ordinary Dashboard counts, source history, basic chapters and essential machine-readable export remain Free. | Identical; optional local inference, complete rules fallback | Explicit PO approval 2026-10-30 supersedes the earlier read-only/no-snapshot contract. One Space grant serves both partners. All created editions and existing reflections remain readable after expiry; own existing unsaved reflections may be edited and own shared words withdrawn without Pro. Source deletion/privacy continues to control derived presentation, including saved editions. Private drafts never enter shared composition or another member's export. Shared text is an explicit write. Saved editorial selections/text are immutable except author withdrawal and source lifecycle. Lifetime counters remain personal device opt-in, off by default, including the independent Wir opt-in from #1508. No new provider fee or artificial Self-Hosted degradation; host compute/storage still apply. |
| **Place CRUD & Coordinates** | M3, M5 | **Mixed** | **Free:** Place CRUD, pin locations, content links.<br>**Premium:** Interactive journey routes, clustering, heatmaps. | Identical | Storing places is basic utility; advanced geospatial analytics are Premium. |
| **Automatic selected-photo places (#1459)** | M2, M3, M5 | **Free/Core** | Account-wide default-on setting; valid selected-photo GPS creates basic canonical Places and shared moment links at save. Manual choices win; OFF affects future work and preserves history. Private HeartMoments never create shared Places. | Identical | Basic asynchronous name/address lookup and direct coordinate maps are Free/Core (#1478, Product Owner 2026-10-28), including untouched historical photo Places. A replaceable backend Photon adapter supplies OSM attribution; public-service requests are bounded and operators may replace/disable it. No tracking, inference, paid mandatory API or advanced spatial analytics. Google/Immich source selection keeps its separate Premium integration boundary. |
| **Chapters & Story grouping** | M3, M5 | **Mixed** | **Free:** Chapter CRUD, grouping, typed relations.<br>**Premium:** Bespoke magazine layouts, custom covers, narrative export. | Identical | Grouping content is organizational; high-end curation & design are Premium. |
| **Shared Collections & Checklists** | M3, M5 | **Free/Core** | Whole feature Free | Identical | Packing lists and shared couple checklists are core utility. |
| **Private Area (Notes & Gift Ideas)** | M3, M5 | **Free/Core** | Whole feature Free | Identical | A safe private individual space is necessary for authentic relationship use. |
| **Private Area owner-only isolation** | M3 | **Non-paywallable** | Non-paywallable | Identical | Strict cryptographic/authorization boundary for individual entries. |
| **Search & Multi-criteria filtering** | M4 | **Free/Core** | Whole current feature Free | Identical | Users must always be able to search and locate their own history. Future materially different semantic/AI discovery requires an explicit new classification rather than silently changing this row. |
| **Zero-Decision Dashboard & Activity** | M4, M7 | **Free/Core** | Whole feature Free | Identical | The primary daily landing experience is part of the core product. |
| **Partner Quick Actions / support gestures (#1206)** | M4, M7 | **Mixed** | **Free/Core:** “Thinking of you” remains fully available with its existing server-authoritative pacing.<br>**Premium (`partner.quick_actions.extended`):** bounded extended gestures “Send a kiss” and “How are you?”; the latter is only a content-free check-in prompt and never reveals Vibe, Presence, Last Seen, or partner check-in state. The shared `supportGesturesEnabled` Space module switch remains Free/Core and cannot grant the Premium capability. | Identical | A basic spontaneous emotional ping remains relationship core. A small optional set of additional relationship-native gestures is additive Pro value; Premium never expands Privacy visibility or creates a second notification pipeline. |
| **Notification Policy, Digest & Quiet Hours** | M4, M5 | **Free/Core** | Whole feature Free | Identical | Respecting partner attention and preventing notification fatigue is core quality. |
| **Automation Rules & Custom Triggers** | M4, M7 | **Mixed** | **Free:** Standard date alerts & digests.<br>**Premium:** Multi-step rules, custom triggers, automated recaps. | Identical | Advanced automation consumes background compute resources and provides higher-value workflow depth. |
| **Essential data portability / Transfer Bundle & account export** | M5, M6 | **Non-paywallable** | Essential machine-readable export of the user's authorized account/Space data and own media remains available independent of Premium. Value-added narrative/print/rendered artifacts are classified separately. | Identical | Data ownership and the right to leave with one's authorized data cannot depend on a paid tier. |
| **Official Web & Android client access** | M5 | **Free/Core** | Whole client access Free | Identical | Accessing the application via official native clients is never paywalled. |
| **Standard Light/Dark/System appearance and baseline app icon** | M5 | **Free/Core** | Whole feature Free | Identical | Standard platform accessibility, dark mode and the default app identity are basic expectations. |
| **Bespoke Themes, Covers & UI Personalization** | M5, M7 | **Premium** | Optional presentation choices; includes alternative app icons (#1307) and personal Wir designs (#1494), using `theme.bespoke_packs` | Identical | Artistic color palettes, custom card styles, bespoke widgets and optional app-icon choices. The default icon, Geborgen (`warm`) Wir design and automatic Light/Dark adaptation remain Free/Core. Klar & modern (`modern`) and Klassisch (`classic`, the previous composition) are optional Pro selections. All underlying Today content/actions and module preferences remain Free/Core. New alternative selections require Pro; an already saved personal icon or Wir design remains readable and effective after expiry. Returning to the default is always Free. Wir designs are personal to the Account within its Space and participate in personal export; untrusted imports do not activate paid cosmetics. |
| **Accessibility essentials & i18n localization** | M1–M5 | **Non-paywallable** | Non-paywallable | Identical | Inclusive accessibility and locale support are baseline engineering standards. |
| **Short Audio / Voice Notes** | M7 | **Free/Core** | Whole feature Free (storage applies in Cloud) | Identical | Voice snippets add emotional intimacy to memories (#512). |
| **Daily Questions & Shared Answers** | M7 | **Mixed** | **Free:** Daily questions & basic answer history.<br>**Premium:** 5-Year Reflection Mirror (#516), deep category packs, cross-year comparison. | Identical | Daily bonding is free; long-term analytical mirroring is Premium. |
| **Shared Achievements / Celebrations (#430)** | M7 | **Free/Core** | Basic recognition of qualifying authoritative shared completions and the standard in-context celebration are Free. Future cosmetic celebration packs or presentation variants require a separate explicit Premium classification and may not gate completion or existing data. | Identical | Acknowledging something a couple accomplished together is relationship-core feedback, not a reward loop or monetization boundary. |
| **Vibe Check (#429, #1151)** | M7 | **Mixed** | **Free:** Set/update own today's vibe; view own today's vibe; view partner today's vibe under existing Mutual Reveal / Privacy rules; empty/no-check-in states; accessibility and error semantics.<br>**Premium (`daily.insights`):** Longitudinal weekly/monthly/yearly recaps, comparative timeframes, recurring vibe patterns, combined vibe & energy insights, cautious trend presentation. Space module toggling under #432 remains Free/Core. | Identical | Everyday partner emotional connection remains a frictionless, genuine couple ritual; relationship depth, patterns, and long-term reflection form the Pro value. |
| **Daily Energy Check-in (#431, #1151)** | M7 | **Mixed** | **Free:** Set/update own today's energy level (10–100); view own today's energy; view partner today's energy under existing Mutual Reveal / Privacy rules; battery indicators on avatars; empty/no-check-in states.<br>**Premium (`daily.insights`):** Longitudinal trends, weekly/monthly energy patterns, combined vibe & energy correlation insights, comparative period analysis. Space module toggling under #432 remains Free/Core. | Identical | Everyday battery/energy check-in is core everyday bonding; longitudinal pattern recognition and combined energy/vibe narratives form the Pro differentiation. |
| **Daily Quote (#1151)** | M7 | **Premium** | Premium only (`daily.quote`). Shared Space-level Pro entitlement, with personal Account-scoped source and category preferences. Curated, legally traceable Public Domain / licensed quote catalog. Stable deterministic daily resolution; graceful fallbacks; no functional Free baseline; quiet Pro discovery for Free spaces. | Identical | High-value daily inspiration moment tailored to individual personal interests; purely additive Pro feature without gating existing relationship history. |
| **Gemeinsam spielen / relationship-native couple games** | M7 | **Premium** | One relationship-scoped Premium capability for the Games area and its catalog under #866. Free may show transparent discovery/preview UX; starting Premium gameplay requires the capability. No per-game purchase, credits, or round limits. | Identical | Games provide a distinct optional relationship experience over existing authorized data. Underlying Memories/Wishes/etc. retain their normal Core/privacy classification; Premium never expands content authorization. |
| **Printable PDF Chronicle / Yearbook** | M7 | **Premium** | Premium only (#517) | Identical | Computationally intensive high-resolution book rendering artifact. Essential machine-readable export remains non-paywallable. |
| **Annual Video Montage & Relive** | M7 | **Premium** | Premium only | Identical | Heavy video transcoding and licensed music catalog delivery. |
| **Surprise Mode (Timed-reveal Vault)** | M7 | **Premium** | Premium interaction/reveal experience only (#514); underlying privacy/authorization guarantees remain non-paywallable. | Identical | Specialized emotional reveal experience for anniversaries and gifts; monetization must never weaken the underlying privacy boundary. |
| **Server Admin & System Health Dashboard** | M6 | **Free/Core** | Whole feature Free | Self-Hosted / Operator focused | System operators must be able to administer instances without paywalls. |
| **Backup, Restore & Instance Migration** | M6 | **Free/Core** | Whole feature Free | Self-Hosted focused | Data ownership and recovery are foundational for Self-Hosted users. |
| **Account Deletion & Space Offboarding** | M6 | **Non-paywallable** | Non-paywallable (#518, #520) | Identical | GDPR compliance and data sovereignty can never be gated. |
| **Observability, Structured Logging & Redaction** | M6 | **Non-paywallable** | Non-paywallable (#189) | Identical | Operational diagnostics and privacy scrubbing are core infrastructure. |
| **External Integrations (Immich, Google Photos Picker, Dawarich, CalSync)** | M8 | **Premium** | Premium only | Identical | Maintained third-party platform integrations and sync pipelines. #1444 selected-photo sources use `integration.external_sync`; Immich is personally linked to the user's own HTTPS service (Product Owner, 2026-10-27). Ordinary local/system photo selection remains Free/Core. Downgrade preserves imported photos and permits disconnect. |

---

## Consumer packaging reference

The customer-facing consumer offer is deliberately simpler than the internal capability matrix:

```text
Free

or

eimir. Pro
  -> internal PREMIUM entitlement/capability set
```

The initial EUR reference price is defined by #876 and [`PREMIUM-BILLING-STRATEGY.md`](./PREMIUM-BILLING-STRATEGY.md):

- **EUR 5.99/month per Space**;
- **EUR 49.99/year per Space**.

One current relationship Space requires one consumer Premium entitlement, not one subscription per partner.

A separate Family consumer tier is not part of v1. Third-party commercial-use rights are also not represented as another consumer tier; they remain a separate licensing axis governed by [`COMMERCIAL-LICENSE.md`](../COMMERCIAL-LICENSE.md).

---

## Entitlement ownership & couple semantics

eimir. is explicitly modeled around the couple unit. Commercial entitlements reflect this reality:

```text
[ Purchaser Account (Anna) ] ----( purchases )----> [ Space Entitlement Grant ]
                                                            |
                       +------------------------------------+------------------------------------+
                       |                                                                         |
                       v                                                                         v
             [ Member A (Anna) ]                                                       [ Member B (Ben) ]
             Full Premium in Space                                                     Full Premium in Space
```

1. **Space-Level Entitlement Scope:** The entitlement is bound to the `SpaceId`. Any active member authorized in that Space inherits the active Premium capabilities.
2. **Purchaser Sponsorship:** The purchasing account (`AccountId`) is recorded as the billing owner/sponsor for invoice, renewal, and store restore purposes.
3. **No Cross-Space Leakage:** If a user is a member of multiple spaces (e.g. testing or migration), Premium does not leak to unrelated spaces.
4. **Relationship Dissolution / Offboarding (#518):** If a partner leaves a Space or the Space is deleted, the Space entitlement expires with the Space. The purchasing partner may re-bind their active subscription to a new Space via "Restore Purchase", but the abandoned Space immediately drops back to Free.
5. **No Privacy Override:** An entitlement grant never gives a partner access to `OWNER_ONLY` items (`PrivateNote`, `GiftIdea`, private HeartMoments) created by the other partner.

---

## Subscription & license lifecycle state machine

Commercial entitlement states follow a strict, deterministic state machine:

```text
       +---------------------------------------------+
       |                                             |
       v                                             |
  [ ACTIVE ] <-----( payment / grant / key )---------+
       |                                             |
       +--( payment failure / renewal pending )-----> [ GRACE_PERIOD (14 days) ]
       |                                                    |
       +--( period end / expired / offline timeout )-------> [ EXPIRED ]
       |                                                    |
       +--( refund / chargeback / revoked key )------------> [ REVOKED ]
```

### Lifecycle states

* **`ACTIVE`:** Paid subscription, valid offline license key, or another currently valid paid/admin grant. Full normalized capability set is available.
* **`TRIAL`:** Time-limited introductory Premium grant. The entitlement architecture supports this state, but #876 does not freeze final launch trial duration or whether payment details are required at trial start. It reverts to Free upon expiry if not converted.
* **`GRACE_PERIOD`:** 14-day transitional window following a payment failure or renewal delay. All Premium capabilities remain fully active to avoid abrupt couple disruption, accompanied by an informative, non-intrusive renewal banner.
* **`EXPIRED`:** Subscription term ended without renewal, or grace period elapsed. Space seamlessly transitions to Free/Core without data loss.
* **`REVOKED`:** Immediate termination due to refund, payment chargeback, or explicit license invalidation. Immediately reverts to Free/Core.
* **`GRANDFATHERED`:** Explicit legacy, promotional, lifetime, migration, or administrator grants that intentionally require special capability/lifecycle semantics. Ordinary subscription price grandfathering does not by itself freeze a historical capability snapshot.

---

## Non-destructive downgrade & data retention contract

The most critical commercial guarantee of eimir. is **Zero Data Loss on Downgrade**:

1. **Read & Export Invariant:** All content created during a Premium subscription remains **100% accessible, viewable, and exportable** forever under its normal authorization/privacy semantics.
   * Chapters with bespoke layouts remain viewable in their rich presentation.
   * High-resolution photo galleries and audio notes remain playable and downloadable.
   * Past yearly recaps and generated PDF books remain readable and downloadable.
   * 5-Year Reflection histories and past question answers remain readable.
   * Essential machine-readable account/Space export remains available independent of Premium.
2. **Create / Edit / Regenerate Boundary:**
   * *Create:* New items requiring Premium capabilities cannot be created while expired.
   * *Edit:* Basic text/date fields of existing items can still be updated; re-rendering complex Premium artifacts (e.g. re-generating high-res yearbook PDFs) requires active Premium.
   * *Uploads:* If Cloud storage exceeds the applicable Free quota upon downgrade, existing media is **never deleted**, but new uploads may be paused until storage is reduced or Premium is restored.
3. **Daily Check-In & Today Pro Downgrade Semantics (#1151):**
   * *Daily Check-In Raw Data:* Existing `DailyCheckIn` raw records (vibe, energy_level, checked_on) are **never deleted or hidden** upon downgrade or license expiry.
   * *Free Daily Ritual:* Today's own check-in and partner check-in view (under active Mutual Reveal rules) continue to function 100% unimpaired for Free spaces.
   * *Privacy & Reveal:* Mutual Reveal and tenant boundaries remain strictly enforced regardless of commercial tier.
   * *Portability:* Historical authorized check-in raw data remains exportable through machine-readable portability tools.
   * *Longitudinal Insights Regeneration:* Without the active `daily.insights` capability, new longitudinal insight calculations, pattern discovery queries, and dynamic recap generation are paused.
   * *Historical Recap Artifacts:* Pre-rendered static recap documents or snapshot artifacts created while Pro was active remain readable and downloadable under the standard non-destructive downgrade guarantee (frozen at time of downgrade; no re-computation).
   * *Daily Quote Preferences:* Account-scoped quote preferences are **never deleted** on downgrade; if Pro is restored, preferences immediately become effective again. Without `daily.quote`, quote resolution is paused and the feature displays quiet Pro discovery.
   * *App Icon Preferences (#1307):* A saved personal icon stays readable, exportable and effective on the supported browser surface after expiry. Saving a different alternative requires `theme.bespoke_packs`; returning to Original is always Free. This does not promise automatic updates or reversion of installed launcher icons.

---

## Self-Hosted licensing & offline resilience

1. **PolyForm Noncommercial 1.0.0 Baseline:** Self-Hosted instances are 100% free for personal/noncommercial use with full access to all Free/Core capabilities.
2. **Zero Phone-Home Requirement for Core:** A healthy Self-Hosted instance never connects to external license servers for normal operation. It remains fully functional in air-gapped, local-only, or offline environments.
3. **Offline Signed License Keys for Premium:**
   * Self-Hosted Premium features use asymmetric cryptographic license material under ADR 0006.
   * The server validates the signature locally using an embedded/project-controlled public verification key without requiring outbound license-server access.
   * The exact payload/schema, clock/tamper policy, expiry, and revocation semantics belong to the entitlement implementation/ADR boundary rather than this matrix.
4. **Commercial-use rights remain separate:** A Self-Hosted consumer Premium entitlement does not itself grant third-party SaaS/OEM/white-label rights; those are governed by the separate commercial-license policy.

---

## Multi-channel purchase reconciliation & restore

The application abstracts all billing providers behind a unified, provider-neutral capability model:

```text
[ Google Play Billing ] ----\
[ Cloud Web / Stripe ]  -----\
[ Offline License Key ] ------+---> [ Normalized Entitlement Adapter ] ---> [ Capability Core ]
[ Admin / Legacy Grant ] -----/
```

* **One-Tap Restore:** Official clients may provide a transparent "Restore Purchases" action where the provider/distribution model supports it.
* **Idempotent Reconciliation:** Replaying purchase receipts or re-entering license keys is fully idempotent and updates the Space entitlement record without duplicate billing or state corruption.
* **Store Independence:** Store-specific identifiers (SKUs, product IDs, receipt tokens) remain strictly isolated inside provider adapters and never become general Domain feature checks.
* **Initial direct billing direction:** Stripe is the initial hosted/Web provider direction under #876, but it remains an adapter and does not redefine entitlement truth.

---

## Grandfathering boundary

The default commercial policy distinguishes **price grandfathering** from **capability grandfathering**:

- an existing subscription may retain an older provider/catalog price when commercial policy allows it;
- an ordinary active `PREMIUM` entitlement receives the current normalized Premium capability set;
- the product must not snapshot the complete historical Premium feature set at every purchase and preserve it forever by default;
- explicit `GRANDFATHERED`/legacy grants remain available for deliberate migration, promotional, lifetime, or compatibility cases.

Any capability-level legacy exception must be explicit and traceable rather than inferred from purchase date alone.

---

## Paywall UX principles

Monetization presentation in official clients must respect the emotional nature of the product:

* **No Modal Spam:** Locked features are marked with a subtle, elegant badge (e.g. `Premium`). Tapping a locked feature opens an informative preview sheet explaining the added value.
* **No Fake Urgency:** No countdown timers, artificial scarcity, or manipulative dark patterns.
* **Transparent Pricing:** Prices and terms are presented clearly up front before entering store purchase flows. The current reference price is EUR 5.99/month or EUR 49.99/year per Space under #876.
* **Reassurance of Data Safety:** Any downgrade or paywall screen explicitly reassures users that their existing memories and shared data are safe and will never be deleted.
* **No trust upsell:** Privacy, Security, deletion, Accessibility, and essential portability must never be presented as benefits unlocked by payment.

PO quality clarification (2026-10-29): optional Plan cover images and ordinary
map-based place selection remain Free/Core in Cloud and Self-Hosted. Covers
use the existing attachment byte limits, authorization, cleanup and transfer
rules; there is no new image-count paywall or paid maps entitlement. Countdown
and fixed shared-visibility context move into the one Plan editor. This changes
presentation, not audience rights or the underlying Plan state machine.

PO gallery extension (2026-10-30, #1514): Plans support ordered photo galleries
with the same viewing interaction as Memories. This remains Free/Core in Cloud
and Self-Hosted. The existing technical gallery safety limits (20 images,
500 MiB combined) and managed storage quota apply; there is no paid image-count
boundary. Existing cover-only Plans remain intact. All photos participate in
shared-parent retention, cleanup and portable export/restore.

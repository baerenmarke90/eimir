# ADR 0006: Centralized Capability Entitlements, Couple Ownership, and Multi-Source Reconciliation

**Status:** Accepted  
**Date:** 2026-09-01  
**Deciders:** Product Strategy (#262), Milestone 6 Architecture (#437)  
**Runtime Implementation:** #523  
**Related Documents:** [`FREEMIUM-FEATURE-MATRIX.md`](../FREEMIUM-FEATURE-MATRIX.md), [`BUSINESS-MODEL.md`](../BUSINESS-MODEL.md), [`ENTITLEMENT-BOUNDARY.md`](ENTITLEMENT-BOUNDARY.md)

---

## 1. Context and Problem Statement

eimir. combines two operating models (**Self-Hosted** and **eimir. Cloud**) and two product tiers (**Free/Core** and **Premium**).

Prior to this decision, the application codebase had zero runtime entitlement or paywalling logic. As commercial Premium capabilities (such as printable PDF yearbooks #517, 5-Year Reflection Mirrors #516, annual video recaps, and third-party integrations #88) are scheduled for delivery in M6–M8, the application requires a robust, centralized architectural foundation for commercial capability evaluation.

Scattering ad-hoc `if is_premium` or provider-specific checks (e.g., Google Play SKU names, Stripe subscription IDs) across domain modules would violate Clean-Room separation, create vendor lock-in, break Self-Hosted offline compatibility, and risk tenant isolation leaks.

---

## 2. Decision Drivers

* **Provider Neutrality:** Domain code must evaluate stable, abstract capabilities (e.g. `storage.cloud_quota`, `recap.pdf_export`, `question.5_year_mirror`), never external payment SKUs or store tokens.
* **Couple / Space Ownership:** In a relationship app, commercial grants belong to the shared `Space`. If one partner purchases Premium, both partners must immediately experience Premium capabilities within that Space.
* **Non-Destructive Downgrade:** Expiry or downgrade must never delete, corrupt, or hide historical user content. Read and export access must remain permanently functional.
* **Self-Hosted Autonomy & Offline Resilience:** Self-Hosted Core must operate 100% offline with zero external network dependencies. Optional Self-Hosted Premium features must support cryptographically signed offline license keys.
* **Backend Authoritative Enforcement:** The server enforces all capability boundaries; client-side state is strictly a presentation and UX aid.
* **Zero Privacy Override:** Commercial entitlements must never weaken tenant isolation or partner `OWNER_ONLY` privacy boundaries (`PrivateNote`, `GiftIdea`).

---

## 3. Considered Options

1. **Option A: Scattered Ad-Hoc Store Checks**
   * Check store receipts and external SKUs directly inside API endpoints or domain services.
   * *Rejected:* Severe architectural coupling, impossible to maintain across Web and Android, completely breaks Self-Hosted builds.

2. **Option B: Account-Only Entitlements**
   * Bind Premium subscriptions strictly to individual user accounts (`AccountId`).
   * *Rejected:* Forces couples to purchase two separate subscriptions for a shared relationship space, contradicting the core product philosophy.

3. **Option C: Centralized Provider-Neutral Capability Core with Space-Level Ownership (Selected)**
   * Abstract all purchase sources into a normalized `EntitlementGrant` table.
   * Bind grants to `SpaceId` (with `AccountId` tracking the billing purchaser).
   * Evaluate capabilities using a centralized backend service (`entitlements.has_capability(space_id, capability)`).
   * Expose a safe, read-only OpenAPI endpoint for client UX decoration.

---

## 4. Decision Outcome

We choose **Option C: Centralized Provider-Neutral Capability Core**.

### 4.1 Normalized Data Model

```text
                                  +---------------------------------------+
                                  |           EntitlementGrant            |
                                  +---------------------------------------+
                                  | id: UUID                              |
                                  | space_id: UUID                        |
                                  | account_id: UUID (purchaser/sponsor)  |
                                  | source_type: EntitlementSourceType    |
                                  | external_reference: String            |
                                  | status: EntitlementStatus             |
                                  | tier: EntitlementTier (FREE, PREMIUM) |
                                  | effective_from: DateTime              |
                                  | effective_until: DateTime?            |
                                  | capabilities: List[String]            |
                                  | metadata: JSON                        |
                                  | created_at: DateTime                  |
                                  | updated_at: DateTime                  |
                                  +---------------------------------------+
```

* `EntitlementSourceType`: `GOOGLE_PLAY`, `CLOUD_STRIPE`, `SELF_HOSTED_KEY`, `ADMIN_GRANT`, `TEST_FIXTURE`.
* `EntitlementStatus`: `ACTIVE`, `TRIAL`, `GRACE_PERIOD`, `EXPIRED`, `REVOKED`, `GRANDFATHERED`.

### 4.2 Standard Capability Identifiers

Domain capabilities are represented as normalized, namespaced string constants:

```python
class Capability(StrEnum):
    STORAGE_CLOUD_QUOTA_50GB = "storage.cloud_quota_50gb"
    CHAPTER_RICH_PRESENTATION = "chapter.rich_presentation"
    OCCASION_AUTOMATION = "occasion.automation"
    RECAP_PDF_YEARBOOK = "recap.pdf_yearbook"
    RECAP_VIDEO_MONTAGE = "recap.video_montage"
    QUESTION_5_YEAR_MIRROR = "question.5_year_mirror"
    SURPRISE_MODE_VAULT = "surprise_mode.vault"
    THEME_BESPOKE_PACKS = "theme.bespoke_packs"
    INTEGRATION_EXTERNAL_SYNC = "integration.external_sync"
```

### 4.3 Backend Capability Evaluation

Domain endpoints evaluate capabilities via a lightweight, cached service:

```python
class EntitlementService:
    def has_capability(self, session: Session, space_id: UUID, capability: str) -> bool:
        """Evaluate if the given space currently holds the requested capability."""
        # 1. Self-hosted unmetered overrides (e.g. storage quota is N/A locally)
        # 2. Query active grants for space_id where effective_from <= now <= effective_until
        # 3. Handle GRACE_PERIOD and ACTIVE states
        ...
```

If an endpoint requires a capability that the Space does not possess, it returns a standard problem response:
* Status: `403 Forbidden`
* Code: `PREMIUM_ENTITLEMENT_REQUIRED`
* Detail: Human-readable explanation and required capability identifier.

### 4.4 Safe Client OpenAPI Read Model

Clients query the effective entitlement state via:
`GET /api/v1/spaces/{space_id}/entitlements`

**Response Payload:**
```json
{
  "space_id": "01a05e73-1135-7908-8b1f-586369c425f2",
  "tier": "premium",
  "status": "active",
  "effective_until": "2027-09-01T00:00:00Z",
  "is_in_grace_period": false,
  "capabilities": [
    "storage.cloud_quota_50gb",
    "chapter.rich_presentation",
    "recap.pdf_yearbook",
    "question.5_year_mirror"
  ]
}
```
Clients use this payload solely to adjust navigation, render badges (`✨ Premium`), and present informational upgrade sheets.

---

## 5. Lifecycle and Resilience Mechanics

### 5.1 Grace Period (14 Days)
When a recurring subscription renewal fails (e.g. expired credit card on Play Store or Stripe), the grant transitions to `GRACE_PERIOD` for 14 days. During this period:
* All Premium capabilities remain **fully active** to prevent sudden emotional disruption to the couple.
* The client displays a friendly, non-blocking notice: *"Your subscription renewal is pending. Please update your payment details to keep Premium active."*
* If not resolved after 14 days, the grant transitions to `EXPIRED`.

### 5.2 Self-Hosted Offline Cryptographic Licensing
For commercial or enterprise Self-Hosted deployments:
* The license key (`EIMIR_LICENSE_KEY`) is an Ed25519-signed JSON payload.
* The payload contains `instance_id`, `licensee`, `capabilities`, `issued_at`, and `expires_at`.
* The server verifies the signature against a hardcoded Ed25519 public key at startup and during periodic evaluation.
* **Zero outbound telemetry or phone-home requests** are made, ensuring complete data privacy and air-gap compatibility.

### 5.3 Deterministic Test & Demo Fixtures
For automated CI testing and the public Demo mode:
* A mock entitlement source (`TEST_FIXTURE`) allows tests to inject synthetic grants with precise expiry timestamps.
* The public Demo environment operates under explicit standard Free/Core rules, with specific demo spaces configured for feature walkthroughs without bypassing security boundaries.

---

## 6. Consequences & Guarantees

### Positive Consequences
* **Architectural Cleanliness:** Feature code remains 100% decoupled from payment gateway libraries and store SDKs.
* **Multi-Platform Consistency:** Web and Android share the exact same capability model and error semantics.
* **Couple Harmony:** Zero confusion over who owns what in the relationship space.
* **Customer Trust:** Guaranteed zero data loss on downgrade protects user trust and brand integrity.

### Negative / Trade-offs
* Requires maintaining source adapters for each commercial channel (Play Store billing, Stripe webhooks, offline license validator).
* Relationship dissolution (#518) requires clean entitlement detachment to avoid cross-tenant disputes.

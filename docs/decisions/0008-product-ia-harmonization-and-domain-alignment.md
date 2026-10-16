# ADR 0008 – Product IA Harmonization and Domain Alignment

**Status:** Accepted
**Date:** September 4, 2026
**Owning issue:** #620
**Amends:** `decisions/0003-primary-navigation-and-route-model.md`
**Affects:** `docs/INFORMATION-ARCHITECTURE.md`, `docs/UX-PATTERNS.md`, Web navigation, Android navigation

**Current relationship:** Compatible domain homes and stable routes remain binding. Primary-navigation reservations below were superseded by [Decision 0009](./0009-games-primary-navigation-and-premium-capability.md) and [Decision 0010](./0010-games-secondary-navigation-under-more.md). Current product-design direction is [Product Reference v1](../product/design/product-reference-v1.md); this dated decision is not a separate screen-composition reference.

## Context

ADR 0003 established the five-area product model (four until M7) and durable
route IDs (`today`, `story`, `plan`, `discover`, `more`). In subsequent
milestones and interim passes, terminology diverged across documentation and
client platforms:

- The `today` destination was alternately referred to as **Heute**,
  **Übersicht**, or **Wir**.
- The `story` destination was alternately referred to as **Story** or
  **Momente**.
- Feature domains were clustered into generic planning containers (for instance,
  organizing chapters, places, and collections under planning) rather than
  belonging to cohesive, relationship-centered product destinations.
- Conceptual information architecture was occasionally conflated with physical
  URL structures: reorganizing a domain conceptually was mistakenly assumed to
  require breaking or migrating stable, existing detail deep links.

Post-620 consistency requires a unified, binding product model that eliminates
conflicting terminology while protecting existing deep link contracts from churn.

## Decision

### 1. Unified Primary Navigation

The primary navigation destinations are bindingly unified across Web and
Android to:

| Route ID | de-DE product name | Purpose | Availability |
|---|---|---|---|
| `today` | Wir | Shared pulse, daily touchpoints, and next meaningful actions | now |
| `story` | Momente | Shared timeline of memories, milestones, and chapters | now |
| `plan` | Planen | Wishes, concrete plans, and future shared activities | now |
| `discover` | Entdecken | Curated inspiration for shared couple time | **M7**, reserved |
| `more` | Mehr | People, places, shared lists, private area, and settings | now |

- **Wir** is the first primary destination and the ordinary signed-in landing
  page on Web and Android. It replaces the previous **Heute** and **Übersicht**
  designations while keeping the canonical `today` route ID and `/today` path.
- **Momente** replaces the previous **Story** designation while keeping the
  canonical `story` route ID and `/story` path.
- `discover` remains reserved for M7 and is not rendered before its domain
  exists. Four destinations are rendered until M7.

### 2. Domain Allocation

Content domains are assigned to their natural product home:

- **Momente (`story`):** Shared timeline, memories (Erinnerungen), heart moments
  (Herzmomente), milestones (Meilensteine), and life chapters (Kapitel).
- **Planen (`plan`):** Ideas and wishes (Wünsche) and concrete plans (Pläne).
  Shopping belongs here once implemented in a future milestone.
- **Mehr (`more`):** Important people and anniversaries (Menschen), shared places
  and destinations (Orte), shared lists and collections (Gemeinsame Listen), and
  the private owner-only area (Für mich), alongside Space, partner, and account
  settings.

### 3. Decoupling Information Architecture from URL Structure

Information architecture defines product hierarchy and navigation focus; it does
not dictate physical URL paths. Detail deep links are durable external and
internal contracts that must not break or churn merely for cosmetic navigation
alignment.

- Existing stable detail deep links are preserved without migration:
  - Chapters detail: `/plan/chapters/:chapterId`
  - Places detail: `/plan/places/:placeId`
  - Collections detail: `/plan/collections/:collectionId`
- Active navigation state reflects the conceptual domain home, not the URL path:
  - Navigating to `/plan/chapters/:chapterId` marks **Momente** as active.
  - Navigating to `/plan/places/:placeId` or `/plan/collections/:collectionId` marks
    **Mehr** as active.
- New canonical routes and redirects are only introduced when technically
  necessary, never for presentation-only routing rewrites.

### 4. Global Utilities and Account Tree Preserved

As decided in ADR 0003, global utilities (Search, Notifications) and personal
account navigation (Profile, Activity) remain outside the primary navigation bar.
On Web, they live in the persistent top-right header, preserving the strict
four-destination primary boundary.

## Consequences

- Web and Android present the identical destination names (**Wir · Momente ·
  Planen · Mehr**) without drift.
- Existing bookmarks and shared links to chapters, places, and collections
  continue to resolve cleanly.
- Active navigation highlights match user mental models rather than historical
  URL paths.
- Product documentation (`INFORMATION-ARCHITECTURE.md`, `UX-PATTERNS.md`) is
  synchronized with the running implementation.

## Alternatives Considered

- **Rename detail paths to match new IA (e.g. `/story/chapters/:id`, `/more/places/:id`):**
  Rejected. This would cause unnecessary URL churn, break existing deep links,
  and require redirect complexity without user benefit.
- **Retain "Übersicht" or "Heute":**
  Rejected. "Wir" directly expresses the shared couple core of the application
  and provides consistent emotional grounding.
- **Retain "Story":**
  Rejected. "Momente" feels more personal, warmer, and seamlessly encompasses
  both memories and milestones.

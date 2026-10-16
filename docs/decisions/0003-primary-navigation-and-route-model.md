# ADR 0003 – Primary Navigation and Route Model

**Status:** Accepted for compatible route contracts; navigation amended by #374 and ADRs 0008–0010
**Date:** August 31, 2026
**Amended:** September 1, 2026 (#374), September 4, 2026 (ADR 0008)
**Owning issue:** #360
**Navigation amendment:** #374, ADR 0008
**Affects:** #295 (Web), #350 (Android), #328 and #346 (Deep Links), #344, #352, #368, #374, #620

> [!NOTE]
> **Subsequent Amendment (September 4, 2026 – ADR 0008):**
> ADR 0008 harmonizes visible product navigation labels and domain grouping across
> platforms to **Wir · Momente · Planen · Mehr** (with `Entdecken` reserved for M7).
> Stable route IDs (`today`, `story`, `plan`, `more`) and detail deep links
> (`/plan/chapters/:id`, `/plan/places/:id`, `/plan/collections/:id`) remain strictly
> unchanged. See `0008-product-ia-harmonization-and-domain-alignment.md`.

**Current relationship:** Stable route IDs, supported compatibility redirects, and domain authorization remain binding. The dated labels and reserved primary Discover slot below are superseded by [ADR 0008](./0008-product-ia-harmonization-and-domain-alignment.md), [Decision 0009](./0009-games-primary-navigation-and-premium-capability.md), and [Decision 0010](./0010-games-secondary-navigation-under-more.md), as consolidated in [Information Architecture](../INFORMATION-ARCHITECTURE.md). [Product Reference v1](../product/design/product-reference-v1.md) governs current product-design direction; the original shell descriptions are not separate composition authority.

## Context

`docs/INFORMATION-ARCHITECTURE.md` section 2 declared five mandatory primary
destinations and section 5 a canonical route model. `docs/UX-PATTERNS.md`
repeated the same product model. The original ADR normalized the shipped Web
routes to stable cross-client route IDs and restored the five-destination
boundary.

The original Web client had flattened Search, Activity, Notifications, People
and Profile into destination-like entries. That broke the core rule that
primary navigation contains no more than five destinations. It also reused the
reserved label *Entdecken* for a sidebar group even though the actual Discover
domain belongs to M7.

Two constraints remain binding:

- **Discover has no Core yet.** Its route identity stays reserved and it is not
  rendered before M7 provides the domain.
- **Deep Links are durable.** Existing canonical and compatibility paths remain
  valid even when the visible shell placement or product copy changes.

Issue #374 subsequently refined the Web shell. It makes the main signed-in area
visibly **Übersicht**, moves Search and Notifications to icon utilities in the
header, and places Profile and Activity in the personal account tree. This
amendment records that refinement without renaming the stable `today` route ID
or `/today` path.

## Decision

Keep the five-area product intent of the Information Architecture. Primary
product areas remain separate from global utilities and personal/account
navigation.

### 1. Primary navigation

Four destinations until M7, five from M7:

| Route ID | de-DE visible product name | Path | Availability |
|---|---|---|---|
| `today` | Übersicht | `/today` | now |
| `story` | Story | `/story` | now |
| `plan` | Planen | `/plan` | now |
| `discover` | Entdecken | `/discover` | **M7**, feature-gated |
| `more` | Mehr | `/more` | now |

`discover` keeps its reserved identity and position in the order and is not
rendered before its domain exists. A reserved route is not dead navigation; a
visible empty area would be.

For Web, **Übersicht is the first/top primary destination and the ordinary
signed-in landing page**. A valid protected Deep Link return target still takes
precedence after authentication.

### 2. Stable route identity, updated visible label

The canonical identifier remains `today` and the canonical path remains
`/today`. Issue #374 intentionally changes only the user-facing product label
from **Heute** to **Übersicht**. This avoids unnecessary Deep Link churn while
making the dashboard/landing semantics explicit.

`dashboard` remains a legacy route name and redirects to `/today`; `planning`
remains a legacy route name and redirects to `/plan`.

### 3. `more` remains a primary product area

Secondary product/settings surfaces keep their canonical routes under `Mehr`:

| Path | Content |
|---|---|
| `/more` | area overview |
| `/more/space` | Space and partner, invitations |
| `/more/people` | related people and important dates |
| `/more/private` | the owner-only area |
| `/more/notifications` | in-app notifications surface |
| `/more/profile` | profile, preferences, appearance |

A route living under `/more` does not require its entry point to be a left-nav
item. #374 moves the Web entry points for Notifications and Profile into the
header/account hierarchy while preserving these canonical paths.

### 4. Global utilities and personal/account navigation are not primary destinations

Promoting utility or account targets to the left primary navigation would break
the five-destination rule.

For the Web shell:

- **Search** is a global utility at `/search`; it is represented by an icon-only
  search affordance in the persistent top-right header.
- **Notifications** is a global utility whose existing surface remains
  `/more/notifications`; its persistent entry point is an icon-only bell in the
  top-right header. No client-only unread count is invented.
- **Profile** remains `/more/profile`, but its persistent entry point is the
  current-user avatar/profile control in the top-right header.
- **Activity** retains `/today/activity` for compatibility and domain semantics,
  but its Web entry point is inside the avatar/profile account tree rather than
  the left primary navigation.

The avatar/profile control reuses the centralized identity/avatar primitive and
settings hierarchy defined by #368. Search, Notifications, Profile and Activity
must not also be duplicated as left-primary destinations.

### 5. Old paths redirect

`/dashboard`, `/planning`, `/people`, `/profile`, `/activity`,
`/notifications` and the previous private-area paths keep working as permanent
redirects to their canonical locations. Deep Links that have already been
shared must not break. #328 and #346 use the stable canonical route model rather
than visible shell placement.

## Consequences

- `docs/INFORMATION-ARCHITECTURE.md` records **Übersicht** as the visible
  `today` label and documents the Web utility/account hierarchy.
- Web authentication resolves the ordinary authenticated root to `/today`, while
  the #346 protected Deep Link return target still has precedence.
- Web Search, Notifications and the avatar/profile control share the persistent
  top-right header. Activity and Profile are reachable from the account tree.
- Existing route IDs and compatibility redirects stay unchanged.
- Discover stays reserved until M7.
- No second navigation framework, icon system, account model or avatar
  representation is introduced.

## Alternatives considered

**Rename the route ID and path to `overview`/`/overview`.** Rejected: the visible
copy does not justify breaking or migrating an already-established Deep Link
contract.

**Keep the visible label `Heute`.** Superseded by #374: the product direction
explicitly establishes **Übersicht** as the main signed-in landing/dashboard
label.

**Keep Search, Notifications, Activity and Profile in the left navigation.**
Rejected: they are global/personal utilities and would compete with actual
product areas while violating the primary-navigation boundary.

**Create a second account-menu or avatar implementation for the header.**
Rejected: #368 already owns identity/avatar and centralized settings, and #374
must reuse those primitives.

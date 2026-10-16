# Information Architecture for eimir.

**Status:** Binding foundation for Web and App  
**Version:** 1.6<br/>
**Effective from:** September 15, 2026<br/>
**Route model decided by:** `decisions/0003-primary-navigation-and-route-model.md`  
**Harmonized by:** `decisions/0008-product-ia-harmonization-and-domain-alignment.md`  
**Games placement decided by:** `decisions/0010-games-secondary-navigation-under-more.md`  
**Navigation surface decided by:** the Web shell (`design/eimir/SHELL-RESCUE-A1.md`, Product Reference v1); `decisions/0004-android-uses-bottom-navigation-at-every-size.md` is historical (ADR 0011)

This document defines navigation, naming, routes, and product-function
assignment. Web and Android use the same domain architecture and stable route
IDs while adapting persistent navigation and utility placement to platform
conventions.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md). Navigation/domain ownership and stable routes remain binding here; screen composition follows v1. This reconciliation preserves the accepted A1 Web shell and ADR 0004 native navigation decisions.

## 1. Core rules

- The shared **Space** is the constant product context.
- Primary navigation contains no more than five destinations.
- A piece of content has exactly one domain home; cross-references are Deep
  Links.
- Routes represent tasks and content, not technical modules.
- Privacy classes do not change primary navigation; where a domain supports
  multiple classes, the status is shown directly on the content.
- Navigation must not discard unsaved input without warning.
- Web and App use the same domain terminology and stable route IDs. Explicitly
  documented platform shell adaptations may place utilities differently.

## 2. Mandatory primary navigation

| Route ID | de-DE product name | Purpose | Availability |
|---|---|---|---|
| `today` | Wir | shared overview, partner pulse, and next meaningful actions | now |
| `story` | Momente | non-public shared timeline of memories, milestones, and chapters | now |
| `plan` | Planen | wishes and concrete plans; shopping later | now |
| `more` | Mehr | games plus secondary shared, private, and account-adjacent areas | now |

The previous top-level `discover` reservation is superseded by Decision 0009.
Discovery experiences remain product behavior inside `Momente`; they do not
consume a persistent primary-navigation slot.

`Spielen` is a first-class product area with the stable route ID `games` and
canonical path `/games`, but Decision 0010 deliberately places its entry under
`Mehr`. It is therefore not a fifth persistent primary destination. When a
user is inside `/games` or `/games/...`, `Mehr` remains the active primary area.

The visible label **Wir** intentionally replaces previous **Heute** and
**Übersicht** designations while retaining the stable `today` route ID and
`/today` path. On Web, Wir is the first primary destination and the ordinary
signed-in landing surface.

The visible label **Momente** intentionally designates the `story` area
(replacing former **Story** phrasing) while retaining the stable `story` route ID
and `/story` path.

### Platform representation

The surface is a platform adaptation; the primary destinations, their order and
their route IDs are not.

- **Android app:** renders the Web shell below (Capacitor wrapper). The retired Compose client's at-every-size Bottom Navigation is recorded in the historical
  `decisions/0004-android-uses-bottom-navigation-at-every-size.md`.
- **Web, Compact/Medium windows below 840 px:** Bottom Navigation with icon and text label.
- **Web, Expanded from 840 px:** horizontal header navigation, as accepted in [A1](./design/eimir/SHELL-RESCUE-A1.md); older sidebar wording is superseded.
- **Web persistent header:** global utilities and the current-user account
  affordance live top-right rather than consuming primary navigation slots.
- Order remains identical on all platforms.
- Current area is recognizable through color, icon, and text state.

Window size classes still choose the *content* composition on both platforms;
see section 6. Only the navigation surface is platform-specific.

## 3. Structure tree

```text
eimir.
├── Wir
│   ├── next shared moment
│   ├── personal and shared recommendations
│   ├── recaps
│   └── open tasks and notices
├── Momente
│   ├── Timeline
│   ├── Erinnerungen
│   ├── Herzmomente
│   ├── Meilensteine
│   └── Kapitel
├── Planen
│   ├── Wünsche
│   │   ├── open
│   │   ├── planned
│   │   └── completed
│   ├── Pläne
│   │   ├── status
│   │   ├── date
│   │   ├── checklist
│   │   └── media and notes
│   └── Einkauf (later, feature-controlled)
└── Mehr
    ├── Spielen (relationship-native games; canonical route `/games`)
    ├── Menschen (related people and important dates)
    ├── Orte (shared places and destinations)
    ├── Gemeinsame Listen (collections)
    ├── Für mich (owner-only area)
    ├── Space and partner
    ├── privacy and permissions
    ├── data export and account deletion
    └── help, legal, and app information

Web persistent utilities / account tree
├── Search
├── Notifications
└── Avatar / Profil
    ├── Profil
    ├── Aktivität
    └── centralized settings
```

The utility/account tree is not an additional primary-navigation level. Its
items keep canonical routes in the route model below and remain directly
Deep-Linkable.

## 4. Planen as shared hub

`Planen` leads with anticipation of shared couple time under [v1 R3](./product/design/reference-screens.md); its domain distinctions remain:

1. **Wish:** an idea without a binding date.
2. **Plan:** a concretized idea with status, date, or tasks.
3. **Shopping (later):** an independent shopping domain, not a generic
   collection.

Wishes and plans must not appear as isolated data worlds. Converting a wish
into a plan is a visible, understandable state transition. Discovery behavior
inside Momente does not create a fourth copy of content; it may adopt a
recommendation as a wish or plan where that product flow exists.

Life chapters (Kapitel) are preserved under Momente. Places (Orte) and shared
lists (Gemeinsame Listen) are organized under Mehr.

### Secondary navigation

- Wishes and Plans remain discoverable secondary destinations. A segmented control or tabs may serve the task, but must not displace the upcoming experience as the focal point. Shopping appears only with an implemented and enabled shopping domain.
- Web preserves that same hierarchy; any list/detail pane must justify its value rather than follow available width.
- The last selected sub-area may be restored locally.
- Deep Links always open the concrete sub-area and content.

## 5. Route model

The following paths are canonical Web paths and the foundation for App Deep
Links. IDs are opaque, stable identifiers.

| Task | Canonical path |
|---|---|
| Open Wir | `/today` |
| Activity between the partners | `/today/activity` |
| Open Momente | `/story` |
| Open memory | `/story/memories/:memoryId` |
| Create memory | `/story/memories/new` |
| Open chapter (Momente) | `/plan/chapters/:chapterId` |
| Planen hub | `/plan` |
| Wishes | `/plan/wishes` |
| Open wish | `/plan/wishes/:wishId` |
| Plans | `/plan/plans` |
| Open plan | `/plan/plans/:planId` |
| Shopping reserved for later domain | `/plan/shopping` |
| Games hub (Spielen, entry under Mehr) | `/games` |
| More | `/more` |
| Places (Mehr) | `/plan/places` |
| Open place | `/plan/places/:placeId` |
| Collections (Mehr) | `/plan/collections` |
| Open collection | `/plan/collections/:collectionId` |
| Space and partner | `/more/space` |
| Related people and important dates | `/more/people` |
| Owner-only area (Für mich) | `/more/private` |
| Privacy | `/more/privacy` |
| Notifications | `/more/notifications` |
| Profile | `/more/profile` |
| Settings | `/more/settings` |
| Data and account | `/more/data-account` |
| Search | `/search` |

### Web utility and account placement

Search, Notifications, Profile and Activity are **not** left-primary
destinations.

- Search is a global utility reachable through an icon-only magnifying-glass
  control in the top-right Web header and opens `/search`.
- Notifications is a global utility reachable through an icon-only bell in the
  top-right Web header and opens `/more/notifications`.
- The current-user avatar/profile affordance is top-right and uses the profile
  photo or deterministic initials fallback from the centralized profile
  identity model. It opens the personal account tree.
- Profile (`/more/profile`) and Activity (`/today/activity`) are entries inside
  that account tree. Their route placement remains stable for compatibility and
  domain ownership; shell placement does not redefine the route.
- Search, Notifications, Profile and Activity must not be duplicated as
  standalone left-primary entries.

### Signed-in landing and Deep-Link return

- The authenticated root/default route resolves to `/today`, whose visible
  product label is **Wir**.
- A normal successful sign-in therefore lands on Wir.
- A valid protected Deep Link requested before authentication takes precedence
  and is restored after login instead of being replaced by the default landing
  route.

### Deep-Link rules

- Every detail item has a shareable internal Deep Link.
- A Deep Link validates authentication and Space membership before loading data.
- Unauthorized content is not confirmed as an existing resource.
- After login or invitation, the user returns to the originally requested
  destination.
- Deleted content receives an understandable state instead of a generic empty
  page.
- IA does not dictate URL structure (ADR 0008). Stable detail deep links
  (`/plan/chapters/:id`, `/plan/places/:id`, `/plan/collections/:id`) remain
  unchanged while their active navigation highlights and conceptual home map
  to their natural domain.
- Visible label changes and shell-placement changes do not rename stable route
  IDs merely for presentation reasons.

## 6. Screen and pane behavior

| Content | Compact | Medium | Expanded |
|---|---|---|---|
| Momente | list or detail | list or detail | timeline + detail |
| Wishes | list or detail | list or detail | list + detail |
| Plans | list or detail | list or detail | list + detail + optional support |
| Shopping, later | one list | list + optional recipe card | list + recipe/detail pane |
| Games | hub or gameplay | hub or gameplay | hub or gameplay |
| Settings | stacked pages | categorized page | categories + setting detail |

On small windows, detail replaces the list. On large windows, the list remains
visible and selected content appears beside it. Back state must survive window
size changes.

On responsive Web layouts, the header utilities remain reachable through an
equivalent compact header/account pattern. They are not pushed back into primary
navigation to solve space constraints. Interactive header targets remain at
least 44 CSS pixels and preserve keyboard focus order and accessible names.

## 7. Naming and language

### Binding terms

| Domain term | UI name | Do not use |
|---|---|---|
| shared tenant | Space | Workspace, Tenant |
| relationship partner | Partner | Contact, User 2 |
| memory | Erinnerung | Post, Beitrag |
| wish | Wunsch | Bookmark, Favorite |
| concrete shared activity | Plan | Project, Task List |
| owner-only visibility | Nur für mich | Owner-only |
| Space visibility | Mit Partner teilen | Public, share with everyone |

- Technical terms remain outside end-user UI.
- Buttons use verbs: `Speichern`, `Teilen`, `Planen`, `Entfernen`.
- Navigation labels use nouns or established product names.
- German and English must work without different navigation structures.

## 8. Roles and visibility

Navigation is not permission. A visible area does not guarantee access to every
object within it.

### Privacy classes

| API value | Meaning | UI label |
|---|---|---|
| `OWNER_ONLY` | owner only | Nur für mich |
| `SPACE_SHARED` | both active Space members | Für uns beide / Mit Partner teilen |
| `TEMPORARY_SHARED` | limited-time sharing | only after domain implementation |
| `EPHEMERAL_CONTEXT` | short-lived context with expiry | context-dependent |
| `SYSTEM_METADATA` | technical metadata | no regular UI label |

The UI may use `private` and `shared` as internal presentation states but sends
the domain API values. Not every domain supports selection: Memory, Wish, and
Plan are `SPACE_SHARED` in the current Core; HeartMoment may use `OWNER_ONLY`
or `SPACE_SHARED`. `public` is not a valid value.

## 9. URL, history, and back behavior

- Selection, filters, and relevant tabs are represented in URL or navigation
  state when they describe a restorable context.
- Short modal interactions create history entries only when they can be opened
  by Deep Link.
- Android System Back and Browser Back have the same domain behavior.
- Close ends a dialog; Back navigates history.
- Switching primary navigation does not create stacked detail history.
- Opening a Web utility/account destination keeps its canonical history entry;
  closing an account popover itself does not create history.

## 10. Open product decisions

Before M1, decide:

- Which content appears in notification previews?
- Can a recommendation become a plan directly, or only a wish first?
- Which filters persist between sessions?
- Which retention periods apply before Cloud launch for account and Space
  deletion?
- How is future partner removal represented? It is not part of MVP.

## 11. Acceptance criteria

- [ ] Every feature belongs to exactly one primary area or a documented
      secondary/utility/account surface.
- [ ] Web and App use stable shared route IDs and domain terminology.
- [ ] Bottom Navigation and the Expanded Web header use the same primary destination order.
- [ ] Detail routes support Deep Links.
- [ ] Authentication, membership, and deletion states are defined.
- [ ] Back behavior works across single- and multi-window layouts.
- [ ] Navigation remains operable with keyboard, screen reader, and text scaling.
- [ ] Web global/personal utilities do not consume duplicate primary-navigation
      slots.

## Related documents

- [Design Principles](DESIGN-PRINCIPLES.md)
- [UX Patterns](UX-PATTERNS.md)
- [Component Contracts](COMPONENT-CONTRACTS.md)
- [Screen Templates](SCREEN-TEMPLATES.md)
- [Critical User Flows](USER-FLOWS.md)
- [API/UI Contracts](API-UI-CONTRACTS.md)

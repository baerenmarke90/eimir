# eimir. — Product Specification

Binding product requirement. This file is the implementation source; a predecessor application is not consulted for it.

| | |
|---|---|
| Version | 1.2 |
| As of | 2026-09-19 |

## 1. Product

A private digital companion for a couple's shared life, offered in two operating models: managed Cloud service and Self-Hosted installation.

Positioning, intentional de-DE product copy: *Die Paar-App, die euch gehört.*

Where users enable the corresponding functions, the product manages Memories, emotional moments, Milestones, shared history, Wishes, Plans, Places, Lists, private content, appointments, partner preferences, birthdays and important people, couple questions, shared well-being, Shopping Lists, recipe ideas, leisure suggestions, external photos, and optional location information.

## 2. Tenant model

```text
Account A ──┐
            ├── Membership ── Space
Account B ──┘
```

A **Space** is the private shared area of a couple; a normal couple Space has at most two active partners. An Account may technically belong to multiple Spaces.

Every shared record belongs to exactly one Space. See [docs/SECURITY.md](../docs/SECURITY.md) for access rules.

## 3. Domains

### Identity
`Account`, `AccountEmail`, `AuthIdentity`, `DeviceSession`

Account stores profile identity, not mixed Auth secrets. Auth identities are kept separately.

### Relationship
`Space`, `Membership`, `Invitation`, `SpaceProfile`

`SpaceProfile` stores `relationship_started_on`, `show_relationship_duration`, and `duration_display_mode`. Relationship-duration display is part of the MVP and can be disabled.

Optional future product modules are configured through an authoritative Space-scoped capability/configuration boundary rather than scattered client-only feature flags. A Space-level module being enabled never forces an individual partner to contribute personal or emotional status data. V1 may grant module-management authority to the Space creator, but clients and Domain code consume an authoritative management capability instead of hard-coding creator-ID comparisons as the permanent authorization model.

### Profiles
`PartnerProfile`, `ProfilePreference`, `RelatedPerson`, `ImportantDate`

`ProfilePreference`: `account_id`, `space_id`, `category`, `topic`, `sentiment`, `value`, `visibility`.

Categories: FOOD, DRINK, FLOWERS, MOVIES, SERIES, MUSIC, HOBBIES, ACTIVITIES, TRAVEL, RESTAURANTS, COLORS, OTHER.
Sentiment: LOVE, LIKE, NEUTRAL, DISLIKE, AVOID.

`RelatedPerson`: display name, relationship (CHILD, PARENT, SIBLING, FRIEND, OTHER), optional birthday with `birthday_year_known`.
`ImportantDate`: type BIRTHDAY, ANNIVERSARY, CUSTOM, with recurrence.

### Memories
`Memory`, `Attachment`, `HeartMoment`, `Milestone`, `Comment`

`Memory`: title, text, `happened_on` distinct from `created_at`, author, multiple media, comments.

`HeartMoment`: text, emotion (LOVED, SEEN, APPRECIATED, SUPPORTED, GRATEFUL, HAPPY), visibility SHARED or PRIVATE. PRIVATE is `OWNER_ONLY` without exception.

`Milestone` is its own model, not a list type.

`Comment`: version-1 targets are strictly enumerated — shared Memory, Milestone, shared HeartMoment. No comments on private content.

### Planning
`Wish` (OPEN, PLANNED, COMPLETED), `Plan` (IDEA, PLANNED, COMPLETED), `Place`, `Chapter`

Flow: Wish → Plan → experienced → optional Chapter. A non-completed Plan can return to the Wish state.

`Place` has optional coordinates; a Place without coordinates is valid.

`Chapter` groups Memories, HeartMoments, and Milestones. Deleting a Chapter removes links, not the originals.

### Collections
`Collection`, `CollectionItem` — freely definable shared Lists with completion, ordering, and multi-select. The Shopping List is a separate later Domain, not a Collection.

### Private
`PrivateNote`, `GiftIdea`, `PrivateCollection`, `PrivateCollectionItem` — all `OWNER_ONLY`.

### Engagement
`Reminder`, `ReminderSchedule` (ONCE, ANNUAL, RELATIONSHIP_DAY_COUNT), `ReminderOffset` (dedicated rows, no CSV strings), `ReminderPreference`, `Activity`, `Notification`, `PushDelivery`, `Suggestion`, `RulePreference`

Automatically generated Reminders know their source and are not freely editable like manual ones.

### Platform
`FeatureConfiguration` (technical/deployment activation) and `Entitlement` (commercial eligibility) are strictly separate. `Job`, `OutboxEvent`, `AuditEvent`, `IntegrationConnection`.

For optional relationship modules, effective availability is conceptually the intersection of deployment capability, commercial entitlement, Space module configuration, and — where the data is personally sensitive — the individual partner's own preference/consent. These concerns must not be collapsed into one generic flag.

### Later
`Question`, `QuestionAssignment`, `QuestionAnswer`, `QuestionFavorite`, `DailyCheckIn`, `ShoppingList`, `ShoppingItem`

`DailyCheckIn` is the shared technical foundation to evaluate for voluntary daily relationship-status dimensions such as Vibe and subjective Energy/Capacity. Separate product surfaces may use separate optional dimensions, but they must not create competing daily-status/privacy backends without an explicit decision.

Future Relationship Depth also includes deliberately small partner-directed notes/support gestures and shared-achievement/celebration experiences. Their exact Domain representation is decided during the owning milestone readiness work rather than inferred from UI wording.

Question reveal rule: both people answer independently; before reveal, neither sees the other's answer and, where possible, not even whether the other has already answered. The question catalog is created editorially from scratch.

## 4. Derived views

Calculated rather than persisted:

- **Story** from Memory, shared HeartMoment, and Milestone, enriched with author, media, Chapter, Place. Cursor pagination, filtering by type and year, Search, ordering, month groups. Never private content.
- **"Weißt du noch?"** references original content and duplicates nothing.
- **Dashboard** — Space overview, partner, optional relationship duration, intentional de-DE product copy "Ich denke an dich", retrospective, upcoming items, recent items.
- **Year in Review** — metrics, month groups, highlights. Empty statistics need not be shown.

## 5. Search

PostgreSQL Full Text Search in version 1, behind an abstraction. Security filtering is enforced server-side in the query.

Includes Memories, HeartMoments, Milestones, Chapters, Plans, Places, Collections, the current user's private content, and later Questions.

## 6. Export

Versioned neutral Transfer Bundle with `manifest.json` (`formatVersion`, `exportedAt`, `applicationVersion`, `checksums`), Domain files, and media.

Excluded: passwords, Passkeys, Refresh Tokens, Sessions, Push Tokens, security logs.

Migration from a predecessor application later uses the same neutral format — no direct import of a foreign database into this ORM.

## 7. Rules and suggestions

Deterministic: trigger + conditions + action. Controlled catalog, no freely executable user scripts, no AI required.

`RulePreference` per Account and Space with `rule_key`, `enabled`, `parameters`.

## 8. Clients

Web (React/TypeScript) is the single product UI. Android is delivered as a Capacitor wrapper that packages the same Web bundle (ADR 0011); there is no independent Kotlin/Compose client. A Core function is production-ready when the Web client, which every delivery channel runs, exhibits the correct Domain behavior for Create, Read, Update, Delete, Authorization, visibility, validation, and errors.

Offline Read Cache yes, offline writes no, in the browser and in the Android wrapper. Without connectivity, the client clearly states that nothing was saved.

M5 is intentionally a **Core completion milestone**. New Relationship Depth domains must not be pulled into M5 merely because M5 is active; M5 may provide reusable navigation/settings/client primitives, but it productizes the M0-M4 Core and portability contract first.

## 9. Milestones

The forward roadmap is deliberately release-first after client completion: optional product expansion must not block the first safe release of the stable Core.

| | Scope |
|---|---|
| M0 | technical platform, Outbox, Jobs, error format, CI, Provenance |
| M1 | Identity, Spaces, Memberships, Invitations, Profile, preferences |
| M2 | MediaStore, Attachments, Memories, HeartMoments, Milestones, Comments, Story |
| M3 | Wishes, Plans, Places, Relations, Chapters, Collections, Private Area |
| M4 | Reminders, Activity, Notifications, "Ich denke an dich", Dashboard, Search, Rules |
| M5 | Export, Import, complete Web client, complete Android client, Read Cache, Deep Links, Accessibility, Performance, parity |
| M6 | **Operate & Launch:** Self-Hosted/Cloud deployment, Backup/Restore/Upgrade, administration, observability, Entitlements/Billing adapter boundary, hardening, release engineering and final launch QA |
| M7 | **Relationship Depth:** Space module readiness, Daily Check-in/Vibe/Energy, partner notes/support gestures, "Unsere Fragen", shared achievements, yearly/monthly recaps |
| M8 | **Discover & Integrations:** Discovery, Shopping, Recipes, Events/Entertainment, external media and provider adapters |
| M9 | **Context & Presence:** Maps/location history, opt-in location context, Geofencing, contextual suggestions, Presence |
| MX | real end-to-end encryption |

M0-M4 are historical milestone boundaries and are not renumbered. M5 remains Client Completion & Parity. G4 follows M5 as the Core Release Candidate gate; G5 follows M6 as the Launch-ready gate. M7-M9 are post-launch expansion milestones and are not prerequisites for the first release.

This sequence supersedes only the old M6-M9 milestone numbering/order described in section 68 of `CLEAN-ROOM-MASTER-SPEC.md`; all security, privacy, Domain, architecture and implementation requirements from that specification remain binding. The dated roadmap decision under `docs/decisions/` records this narrow supersession.

## 10. Not in the first MVP

Real E2EE, offline write sync, AI, public share links, movie recommendations, Event Discovery, recipe integration, Shopping automation, external media and location integrations, Maps integration, Geofencing, partner removal, Daily Check-in, "Unsere Fragen", Relationship Depth modules, Year in Review.

These M7-M9 capabilities are post-launch expansion. The first MVP/release is the M0-M5 Core made safely operable through M6/G5.

The architecture must support these extensions; the Core is built cleanly and securely first.

## 11. Definition of Done per Domain feature

Data model, migration, Domain Service, Authorization, API, OpenAPI, validation, error codes, Unit tests, Integration tests, Cross-Tenant tests, Privacy tests where applicable, Export support for persistent user data, Web UI, Android UI, error handling, documentation.

A working button alone is not done.

## 12. Priority when goals conflict

1. Clean-Room separation
2. Security and Tenant Isolation
3. clean Domain model
4. stable API
5. tests
6. portability
7. Web and Android UX
8. extensions
9. monetization

No shortcut may weaken Tenant Isolation or Privacy.
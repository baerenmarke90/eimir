# SIDEBYSIDE NEXT – CLEAN-ROOM MASTER SPECIFICATION

## 0. Assignment

You must implement **SideBySide Next** as a completely new, independent application.

SideBySide Next is a private couple app for two partners. In the long term it is intended to be offered both as:

1. **SideBySide Cloud** – commercially operated SaaS service
2. **SideBySide Self-Hosted** – self-operated installation

The project is a **Clean-Room reimplementation**.

An older application named SideBySide Classic exists and historically originated from SharedMoments. That older codebase may be treated only as historical background.

## ABSOLUTE CLEAN-ROOM RULE

While implementing SideBySide Next, you must **not read, copy, port, or use as an implementation template any source code from SharedMoments or SideBySide Classic.**

If an old repository exists on the system:

- DO NOT open it
- DO NOT search it
- DO NOT analyze it with grep/ripgrep
- DO NOT import it
- DO NOT copy files from it
- DO NOT adopt code from it
- DO NOT write there
- DO NOT commit there

In particular, the following must not be adopted:

- Python code
- Flask routes
- SQLAlchemy models
- db_queries.py
- Jinja templates
- CSS
- JavaScript
- Kotlin code from the old Android app
- old `/api/v2/...` implementations
- database migrations
- code comments
- old question seed
- translation tables as a bulk dataset
- demo content
- old screenshots
- assets of unclear provenance

Implement exclusively from this specification.

If the current working directory is the old SideBySide/SharedMoments project, change NOTHING there. Switch to or create a new isolated workspace instead, for example:

`~/Projekte/SideBySide-Next`

The old repository must remain untouched.

---

# 1. Product vision

SideBySide is a **private digital companion for a couple's shared life**.

In the long term, where users voluntarily enable the corresponding functions, the app should know or manage:

- shared Memories
- special emotional moments
- Milestones
- shared history
- Wishes
- Plans
- shared Places
- shared Lists
- personal/private content
- important dates
- partner preferences
- birthdays and important people
- couple questions
- shared well-being
- Shopping Lists
- recipe ideas
- leisure and Event suggestions
- external photos
- optional location information
- contextual hints

Product positioning, intentional de-DE copy:

> SideBySide – die Paar-App, die euch gehört.

Privacy is a Core element.

No advertising.
No sale of personal data.
No unnecessary tracking.
Sensitive content must not be used for Analytics.

---

# 2. Core architecture

Implement a **modular monolith**, not a Microservice landscape.

Target architecture:

```text
                         SideBySide Next

                 ┌────────────┴────────────┐
                 │                         │
             Android App                Web App
           Kotlin / Compose          React / TypeScript
                 │                         │
                 └──────── HTTPS ──────────┘
                            │
                      REST API v1
                            │
                         FastAPI
                            │
                    Application Core
                            │
          ┌─────────────────┼──────────────────┐
          │                 │                  │
     PostgreSQL          MediaStore          Worker
                            │
                   ┌────────┴────────┐
                   │                 │
               Filesystem            S3
              Self-Hosted           Cloud
```

No Microservices unless a concrete technical necessity exists.

---

# 3. Binding technology stack

Backend:
- Python
- FastAPI
- SQLAlchemy 2
- Alembic
- PostgreSQL

API:
- REST
- JSON
- versioning under `/api/v1/...`
- OpenAPI as the binding contract

Web:
- React
- TypeScript
- Vite
- React Router
- TanStack Query
- a new, independently created Design System

Android:
- Kotlin
- Jetpack Compose
- Material 3
- OkHttp/Retrofit or an equivalent clean HTTP layer
- Room for local Read Cache
- WorkManager
- Android Keystore / secure credential storage

Infrastructure:
- Docker
- Docker Compose for Self-Hosted
- stateless API/Web for Cloud
- PostgreSQL for Self-Hosted as well
- NO SQLite support required
- NO mandatory Redis
- NO mandatory Celery

Background Jobs:
- PostgreSQL-based Job Queue
- Worker
- `FOR UPDATE SKIP LOCKED` or an equivalent robust mechanism

---

# 4. Technical conventions

## IDs

Persistent Domain Entities use UUIDv7 where the selected libraries support it cleanly.

No incrementing public IDs.

## Time

Technical timestamps:
- UTC
- PostgreSQL `TIMESTAMPTZ`

Pure Domain calendar dates:
- PostgreSQL `DATE`

Examples:

```text
created_at  = Timestamp
updated_at  = Timestamp
happened_on = Date
birthday    = Date
```

## JSON

External API:
- camelCase

Internal Python code:
- snake_case

## Optimistic Concurrency

Mutable Domain objects receive version information.

Updates must later be able to detect conflicts, for example through:

```text
If-Match / Version
```

Conflict:
HTTP 409

This also prepares for later Offline Sync.

---

# 5. Uniform API error format

Use a consistent Problem-Details-like schema.

Example:

```json
{
  "type": "validation_error",
  "title": "Invalid request",
  "status": 400,
  "detail": "The title must not be empty.",
  "code": "MEMORY_TITLE_REQUIRED"
}
```

HTTP convention:

```text
Create          201
Get             200
Update          200
Delete          204
Validation      400/422
Unauthenticated 401
Forbidden       403
Not Found       404
Conflict        409
Rate Limit      429
```

For Privacy-relevant resources, deliberately use `404` instead of `403` where appropriate so the existence of foreign/private resources is not leaked.

---

# 6. Multi-Tenancy – central Security invariant

The central tenant object is named:

```text
Space
```

A Space represents the private shared area of a couple.

Every shared record must belong to exactly one `space_id`.

Base model:

```text
Account A ──┐
            ├── Membership ── Space
Account B ──┘
```

A normal couple Space has at most two active partners.

An Account may technically belong to multiple Spaces even if the normal UI initially emphasizes only one active couple Space.

Every access to Space data requires:

1. authenticated Account
2. active Membership
3. verification that the resource actually belongs to that Space
4. additional Resource/Owner authorization where applicable

There must be NO data access based only on a Resource ID without Tenant verification.

Example:

```text
GET /api/v1/spaces/{spaceId}/memories/{memoryId}
```

must verify:

- current Account
- Membership in `spaceId`
- `memory.spaceId == spaceId`
- Resource permission

Cross-Tenant protection is Release-critical.

---

# 7. Privacy classes

Every Domain must classify its data into one of these classes:

```text
SPACE_SHARED
OWNER_ONLY
TEMPORARY_SHARED
EPHEMERAL_CONTEXT
SYSTEM_METADATA
```

There is no implicit PUBLIC class.

Private information must be protected server-side.

Hiding it only in the Client is never sufficient.

---

# 8. Core Domain model

Plan at least the following Domain areas:

Identity:
- Account
- AccountEmail
- AuthIdentity
- DeviceSession

Relationship:
- Space
- Membership
- Invitation
- SpaceProfile

Profiles:
- PartnerProfile
- ProfilePreference
- RelatedPerson
- ImportantDate

Memories:
- Memory
- Attachment
- HeartMoment
- Milestone
- Comment

Planning:
- Wish
- Plan
- Place
- Chapter

Collections:
- Collection
- CollectionItem

Private:
- PrivateNote
- GiftIdea
- PrivateCollection
- PrivateCollectionItem

Engagement:
- Reminder
- ReminderSchedule
- ReminderOffset
- ReminderPreference
- Activity
- Notification
- PushDelivery
- Suggestion
- RulePreference

Platform:
- FeatureConfiguration
- Entitlement
- Job
- OutboxEvent
- AuditEvent
- IntegrationConnection

Later:
- Question
- QuestionAssignment
- QuestionAnswer
- QuestionFavorite
- DailyCheckIn
- ShoppingList
- ShoppingItem

Do not use a generic universal table such as:

```text
items(type, content, misc, ...)
```

for every Domain.

Important Domain areas receive dedicated models.

---

# 9. Accounts and authentication

Account contains profile identity but not mixed Auth secrets.

Conceptually:

```text
Account
- id
- displayName
- birthday?
- profileAttachmentId?
- locale
- timezone
- createdAt
- updatedAt
```

Auth identities are separate.

## Cloud

Planned:
- email verification
- Magic Link
- Passkey
- Recovery

No mandatory password for Cloud.

## Self-Hosted

Additionally:
- local password login
- Passkey
- OIDC

Pocket ID must therefore later be possible as a normal OIDC Provider.

## Native Auth

Android uses Bearer Tokens.

```text
Authorization: Bearer <access-token>
```

Do not use a Web Session Cookie as the primary Native authentication mechanism.

DeviceSession:

```text
- accountId
- refreshTokenHash
- deviceName
- platform
- createdAt
- lastUsedAt
- expiresAt
- revokedAt
```

Refresh Tokens:
- persist only as hashes
- Rotation
- detect Replay where possible

Access Token:
- short-lived, for example roughly 15 minutes

---

# 10. Invitations

Workflow:

```text
Account A creates Space
→ create Invitation
→ one-time token
→ partner opens link
→ sign-in/registration
→ Accept
→ Membership
```

Invitation Token:
- random
- sufficient entropy
- store only as a hash
- expiration date/time
- revocable
- one-time use only

Tests:
- expired
- revoked
- reused
- full Space
- race condition
- invalid token

---

# 11. Partner profiles and preferences

Partner profiles are Foundation.

Strictly separate two concepts:

## SELF_PROFILE

Information a user shares about themselves with their partner.

Possible fields:

- birthday
- favorite flowers
- favorite food
- favorite drinks
- favorite colors
- movie genres
- series genres
- music
- hobbies
- activities
- travel preferences
- restaurants
- dislikes
- optionally additional attributes

## PRIVATE_PARTNER_NOTE

Private information a user remembers about their partner for themselves.

Example:
- gift idea
- private note
- surprise planning

These must never appear in the visible partner profile.

## ProfilePreference

Conceptually:

```text
- accountId
- spaceId
- category
- topic
- sentiment
- value
- visibility
- updatedAt
```

Categories at minimum:

```text
FOOD
DRINK
FLOWERS
MOVIES
SERIES
MUSIC
HOBBIES
ACTIVITIES
TRAVEL
RESTAURANTS
COLORS
OTHER
```

Sentiment:

```text
LOVE
LIKE
NEUTRAL
DISLIKE
AVOID
```

Example:

```text
category = DRINK
topic = favorite_drink
sentiment = LOVE
value = "Coca Cola Zero"
```

The architecture must later support recommendations and Rules based on these data.

---

# 12. Related Persons and Important Dates

Children/family members are not SideBySide Accounts.

RelatedPerson:

```text
- id
- spaceId
- createdBy
- displayName
- relationship
- birthday?
- birthdayYearKnown
- visibility
```

Relationship, for example:

```text
CHILD
PARENT
SIBLING
FRIEND
OTHER
```

Data minimization:

By default, do not store addresses, schools, phone numbers, etc. for third parties.

ImportantDate:

```text
- id
- spaceId
- relatedPersonId?
- type
- date
- repeats
- label
- visibility
```

Types:

```text
BIRTHDAY
ANNIVERSARY
CUSTOM
```

This should later allow Rule-based behavior such as the intentional de-DE user-facing example:

`"Lisa hat in 7 Tagen Geburtstag."`

---

# 13. SpaceProfile

Contains relationship-related information.

At minimum:

- `relationshipStartedOn?`
- `showRelationshipDuration`
- `durationDisplayMode`
- optional shared song later

Displaying shared days/relationship duration belongs to the MVP but can optionally be disabled.

Possible intentional localized display:

```text
4 Jahre, 3 Monate
```

or:

```text
1.568 gemeinsame Tage
```

When disabled, it does not appear.

---

# 14. Memories

Memory:

```text
- id
- spaceId
- authorId
- title
- body
- happenedOn?
- createdAt
- updatedAt
- version
```

Functions:

- create
- read
- update
- delete
- multiple images/media
- Gallery
- display author
- Story
- Search
- Comments
- later Chapter/Place relation

Store the Domain event date separately from the creation timestamp.

Authorship matters.

Base rule:
The author may edit/delete personal text.
The partner may read the shared Memory.

---

# 15. Heart Moments

HeartMoment:

```text
- id
- spaceId
- authorId
- text
- emotion
- visibility
- happenedOn
- attachmentId?
- createdAt
- updatedAt
- version
```

Initial emotions:

```text
LOVED
SEEN
APPRECIATED
SUPPORTED
GRATEFUL
HAPPY
```

Visibility:

```text
SHARED
PRIVATE
```

PRIVATE means:

The partner must NOT receive the content through:

- GET by ID
- Lists
- Search
- Dashboard
- Story
- Comments
- Notifications
- partner Export
- indirect Relation

Owner only.

SHARED may appear in Story and may receive Comments.

---

# 16. Milestones

Dedicated Domain model.

Milestone:

```text
- id
- spaceId
- authorId
- title
- body?
- happenedOn
- timestamps
- version
```

Usage:
- Story
- Chapter
- Search
- Year in Review

Do not model as a special List type.

---

# 17. Attachments / MediaStore

Storage must be abstracted.

Interface conceptually:

```text
createUpload()
finalizeUpload()
open()
delete()
createReadUrl()
```

Implementations:

```text
LocalMediaStore
S3MediaStore
```

Attachment:

```text
- id
- spaceId
- ownerId
- mediaType
- mimeType
- size
- width?
- height?
- duration?
- originalName
- storageKey
- cryptoVersion
- encrypted
- createdAt
```

Never derive Storage Keys directly from user filenames.

Example:

```text
spaces/{spaceUuid}/attachments/{attachmentUuid}/original
```

Upload lifecycle:

```text
PENDING
→ upload
→ validation
→ READY
```

Failure:

```text
FAILED
```

Validate:
- actual MIME type
- size
- permitted media type
- image dimensions
- Space assignment

Cloud media are not public.

Reading:

```text
Authorization
→ short-lived signed URL or authorized streaming route
```

---

# 18. E2EE READINESS – LEVEL 1 IS MANDATORY

The first Release does NOT implement real end-to-end encryption.

However, the architecture must be E2EE-ready from day one.

Important:

Level 1 must NOT be marketed as real E2EE.

Actual E2EE becomes a separate later Security milestone.

## Architecture rule

Logically separate sensitive content from metadata.

Example:

Memory

Metadata:
- id
- spaceId
- authorId
- happenedOn
- createdAt
- updatedAt
- cryptoVersion

ProtectedPayload:
- title
- body
- additional sensitive fields

In version 1, ProtectedPayload may still be plaintext.

However, API and persistence must not be designed so that a later transition to:

```text
ProtectedPayload
→ client-side encryption
→ Ciphertext
```

requires a complete rearchitecture.

Attachments likewise:

- cryptoVersion
- encrypted

Storage must not assume plaintext.

Dashboard, recaps, Notification system, and Rule Engine should avoid mandatory dependence on sensitive plaintext wherever possible.

Reserve a later E2EE milestone for:

- Device Keys
- Account Keys
- Space Keys
- Key Distribution
- Device Verification
- Recovery
- Key Rotation
- encrypted Payloads
- encrypted Attachments
- local Search
- Web Crypto
- Android Crypto
- migration of existing data
- external Security Audit

Do NOT implement yet.

---

# 19. Comments

Comment:

```text
- id
- spaceId
- authorId
- targetType
- targetId
- body
- createdAt
- updatedAt
```

Strictly enumerate permitted targets in version 1.

At minimum:
- shared Memory
- Milestone
- shared HeartMoment

No Comments on private content.

Comment on another person's shared content:

```text
→ Domain Event
→ Notification for content author
→ optional Push
```

---

# 20. Transactional Outbox / Domain Events

Domain Events are Foundation.

For relevant changes:

```text
DB Transaction
├── Domain Entity
└── OutboxEvent
```

Worker processes OutboxEvent.

Examples:

```text
MEMORY_CREATED
HEART_MOMENT_CREATED
PLAN_COMPLETED
IMPORTANT_DATE_APPROACHING
PARTNER_THINKING_OF_YOU
REMINDER_DUE
PROFILE_PREFERENCE_CHANGED
```

Later:

```text
SHOPPING_CONTEXT_ENTERED
NEW_RELEVANT_MOVIE
NEARBY_EVENT_FOUND
IMMICH_MEMORY_FOUND
```

No tight coupling between Domain and Push/Integration.

---

# 21. Story

Story is NOT a persisted Story table.

It is a Read Model composed from:

- Memory
- shared HeartMoment
- Milestone

enriched with:

- Author
- Attachment
- Chapter
- Place

API, for example:

```text
GET /api/v1/spaces/{spaceId}/timeline
```

Filters:
- type
- year
- q
- order
- cursor
- limit

Cursor-based Pagination.

Story supports:
- filtering by type
- filtering by year
- Search
- chronological ascending/descending order
- grouping by month

Never include private content.

Chronological ordering primarily uses `happenedOn`, otherwise a suitable fallback.

---

# 22. `"Weißt du noch?"`

Automatic retrospective from historical shared content.

No duplicated content.

Examples:
- today one year ago
- today two years ago
- similar historical dates

The retrospective references original content.

The feature should remain E2EE-compatible by requiring only metadata for server-side selection wherever possible.

---

# 23. Wishes

Wish:

```text
- id
- spaceId
- title
- createdBy
- createdAt
- updatedAt
- version
```

Domain states:

```text
OPEN
PLANNED
COMPLETED
```

User workflow:

```text
Wish
→ continue as Plan
→ Plan
→ experienced
```

A non-completed Plan may be returned to the Wish state where applicable.

Functions:
- Search
- filtering
- ordering
- progress
- author

---

# 24. Plans

Plan:

```text
- id
- spaceId
- sourceWishId?
- title
- description?
- status
- plannedStart?
- plannedEnd?
- experiencedOn?
- placeId?
- createdBy
- createdAt
- updatedAt
- version
```

Status:

```text
IDEA
PLANNED
COMPLETED
```

Workflow:

```text
Wish
→ Plan
→ Completed
→ optional Chapter
```

Model and test transitions explicitly.

---

# 25. Places

Place:

```text
- id
- spaceId
- name
- description?
- address?
- latitude?
- longitude?
- createdBy
- timestamps
- version
```

Position is optional.

Later, users should be able to:
- search for an address/Place
- use current position
- choose a map position
- save a Place without coordinates

Places can be connected with:
- Memories
- HeartMoments
- Milestones
- Plans
- Chapters

---

# 26. Content Relations

Expose a shared Relation Service externally.

In PostgreSQL, use real Foreign Keys wherever possible.

Do not use an uncontrolled universal Relation with:

```text
targetType
targetId
```

without Referential Integrity.

Internally, explicit Relation tables may exist:

```text
chapter_memories
chapter_heart_moments
chapter_milestones

place_memories
place_heart_moments
place_milestones
place_plans
place_chapters
```

---

# 27. Chapters

Chapter:

```text
- id
- spaceId
- title
- description?
- startOn?
- endOn?
- placeId?
- createdBy
- timestamps
- version
```

Chapter groups:
- Memories
- HeartMoments
- Milestones

Delete rule:

```text
Delete Chapter
→ remove Relations
→ DO NOT delete original content
```

---

# 28. Collections

Normal freely definable shared Lists:

Collection:

```text
- id
- spaceId
- title
- icon
- timestamps
```

CollectionItem:

```text
- id
- collectionId
- title
- completed
- position
- createdBy
- timestamps
```

Use cases:
- TrashTV
- movies
- restaurants
- travel ideas
- other checklists

Functions:
- create
- edit
- complete/reopen
- delete
- bulk select
- bulk delete
- reorder

The Shopping List is a separate later Domain and is NOT simply a Collection.

---

# 29. Private Area

Hard Privacy Domain.

## PrivateNote

```text
- id
- spaceId
- ownerId
- title
- body
- pinned
- timestamps
- version
```

## GiftIdea

```text
- id
- spaceId
- ownerId
- title
- description?
- recipient?
- occasion?
- targetOn?
- priceText?
- url?
- status
- pinned
- timestamps
- version
```

## PrivateCollection

```text
- id
- spaceId
- ownerId
- title
- icon
```

PrivateCollectionItem:

```text
- title
- completed
- position
```

`OWNER_ONLY`.

The partner must never see them, including through:
- ID
- Search
- Story
- Dashboard
- direct link
- API manipulation

---

# 30. Reminders

Reminder:

```text
- id
- spaceId
- title
- description?
- source
- createdBy
```

ReminderSchedule:

```text
- reminderId
- type
- corresponding parameters
```

Schedule Types:

```text
ONCE
ANNUAL
RELATIONSHIP_DAY_COUNT
```

ReminderOffset:

```text
- reminderId
- daysBefore
```

Do not use CSV strings such as `"0,1,3,7"`.

ReminderPreference:

```text
- accountId
- reminderId
- muted
```

Automatically generated Reminders must know their source and should not be treated as freely editable manual Reminders.

---

# 31. Rule & Suggestion Engine

The architecture must support deterministic Rules.

Base model:

```text
Trigger
+
Conditions
+
Action
```

No freely executable user scripts.

Controlled Rule catalog.

RulePreference:

```text
- accountId
- spaceId
- ruleKey
- enabled
- parameters
```

Example:

```text
birthday_reminder
enabled = true
daysBefore = [14, 7, 1]
```

Possible later Rules:

```text
IMPORTANT_DATE_APPROACHING
+ BIRTHDAY
+ 7 days
→ Notification

SHOPPING_CONTEXT_ENTERED
+ partner favorite drink exists
+ locationSuggestions enabled
→ local Suggestion
```

No AI required.

---

# 32. Notifications

Separate:

```text
Activity
→ Notification
→ optional PushDelivery
```

Activity = Space event

Notification = recipient state

PushDelivery = technical delivery channel

Functions:
- unread count
- mark as read
- mark all as read
- open target content

Push messages should contain no sensitive text by default.

Prefer intentional de-DE product copy such as:

`"Neue Aktivität in SideBySide"`

instead of private original text.

---

# 33. `"Ich denke an dich"`

Small partner signal.

```text
A sends
→ Activity
→ Notification B
→ optional Push
```

No free text required.

Cooldown and Rate Limit.

It should also serve as a test case for the Event/Notification pipeline.

---

# 34. Dashboard

Dashboard is a Read Model, not redundant persistence.

API, for example:

```text
GET /api/v1/spaces/{spaceId}/dashboard
```

May contain:

- Space Summary
- partner
- optional relationship duration
- `"Ich denke an dich"`
- `"Weißt du noch?"`
- upcoming items
- recent shared items
- Daily Question later
- Year Summary later

Derive all data from real Domains.

---

# 35. Global Search

Version 1:
PostgreSQL Full Text Search.

No Elasticsearch/OpenSearch required.

Abstract the Search Service so it can be replaced later.

API, for example:

```text
GET /api/v1/spaces/{spaceId}/search?q=...
```

At minimum:
- Memories
- HeartMoments
- Milestones
- Chapters
- Plans
- Places
- Collections
- later Questions
- current user's private content

Security filtering must happen server-side.

Private partner results must never be generated and then merely hidden in the Client.

---

# 36. Export / Portability

Versioned SideBySide Transfer Bundle.

Example:

```text
sidebyside-export.zip
├── manifest.json
├── accounts.json
├── space.json
├── memories.json
├── heart-moments.json
├── milestones.json
├── wishes.json
├── plans.json
├── places.json
├── chapters.json
├── collections.json
├── private/
└── media/
```

Manifest:
- formatVersion
- exportedAt
- applicationVersion
- checksums

DO NOT export:
- passwords
- Passkeys
- Refresh Tokens
- Sessions
- Push Tokens
- Security Logs

Notifications do not need to be part of the portable user dataset.

---

# 37. Migration from SideBySide Classic

Later flow:

```text
SideBySide Classic
→ neutral Transfer format
→ normal SideBySide Next Importer
```

NO direct import of the old database into the new ORM.

The new Importer knows only the neutral data-exchange format.

The Classic Exporter is handled separately and only later.

During Clean-Room implementation, DO NOT read old source code for this purpose.

---

# 38. Feature Flags vs. Entitlements

Strictly separate:

FeatureConfiguration
= technical/administrative activation

Entitlement
= commercial eligibility

A disabled feature never automatically deletes its data.

Billing must not be deeply embedded in the Application Core.

Core asks, for example:

```text
entitlements.has(space, "feature_name")
```

but does not know Google Play/Stripe/etc.

---

# 39. Cloud and Self-Hosted

Same Application Core.

## Self-Hosted

Target:

```text
docker compose up -d
```

Components:

- sidebyside-api
- sidebyside-web
- sidebyside-worker
- postgres

Persistence:
- PostgreSQL volume
- Media volume or S3

Optional:
- SMTP
- OIDC
- S3

## Cloud

- stateless API
- stateless Web
- Worker
- Managed PostgreSQL
- S3-compatible Object Storage
- Secret Management
- Mail
- Push
- Billing

Develop Provider-neutrally.

Do not embed Scaleway/Google/AWS directly into Domain code.

---

# 40. Provider Framework

External Providers only through adapters.

Define interfaces for:

```text
MapProvider
GeocodingProvider
PlacesProvider
DiscoveryProvider
RecipeProvider
EntertainmentProvider
ExternalMediaProvider
LocationHistoryProvider
```

IntegrationConnection:

```text
- id
- spaceId
- accountId
- provider
- status
- sharingMode
- capabilities
- credentialReference
- lastSyncAt?
- syncCursor?
- timestamps
```

Do not store credentials as plaintext in normal database configuration.

SharingMode:

```text
PRIVATE
SPACE_SHARED
```

External connections are not automatically shared with the partner.

---

# 41. Normalized external data

Example DiscoveryItem:

```text
- externalId
- title
- category
- description?
- startsAt?
- endsAt?
- latitude?
- longitude?
- locationName?
- source
- sourceUrl?
- imageUrl?
```

SideBySide Domains must not depend everywhere on proprietary data models of external APIs.

---

# 42. Location & Context Framework

Strictly separate four concepts:

Place
= shared stored Place

LocationHistory
= external history, for example Dawarich

Presence
= current/short-lived location

Context
= derived situation, for example `"probably supermarket"`

Location features default to:

```text
OFF
```

Explicit opt-in required.

Where possible:
- local Android Geofencing/Context evaluation
- no permanent Cloud location tracking

Server-side location:
- minimum necessary precision
- short Retention
- no location in normal logs
- revocable at any time

---

# 43. Partner distance – later

Optional future feature.

Default:

```text
OFF
```

Only after deliberate activation.

Possible display:
- 18 km apart
- nearby

Do not persist permanent historical data from this feature.

If PresenceSnapshot is required:

```text
- accountId
- spaceId
- approximateLocation
- accuracy
- capturedAt
- expiresAt
```

Short TTL.

Dawarich remains a separate Location History integration.

---

# 44. Shopping Domain – prepare for later

Do NOT model the Shopping List as a normal Collection.

Later dedicated Domain:

```text
ShoppingList
ShoppingItem
```

ShoppingItem should eventually support:

- name
- quantity?
- unit?
- category?
- note?
- completed
- addedBy
- recipeReference?

This later allows:

```text
Recipe
→ select ingredients
→ Shopping List
```

Not yet part of the first Core MVP.

---

# 45. `"Was kochen wir heute?"` – later

Later system:

```text
Partner Preferences
+
RecipeProvider
+
Recipe Favorites
+
ShoppingList
→ recommendations
```

No hard dependency on Chefkoch.

Before integrating a concrete Provider, review commercial API/licensing terms.

---

# 46. Events/leisure – later

Discovery:

```text
Location
+
Radius
+
DiscoveryProvider(s)
+
Space Preferences
→ Suggestions
```

Radius, for example:

```text
10 km
25 km
50 km
100 km
```

Possible later factors:
- date
- weekend
- price
- interests
- weather
- distance

Provider-neutral.

---

# 47. Movies/series – later

EntertainmentProvider.

ProfilePreference may contain movie genres, for example.

Possible later flow:

```text
Partner A likes thrillers
Partner B likes thrillers
+
new thriller
→ relevant Suggestion
```

No AI required.

---

# 48. Immich – later

Immich is integrated through:

```text
ExternalMediaProvider
```

Possible functions:

- find photos from a date
- find photos from a Place
- browse album
- select photo for a Memory
- retrospective with external photos

Do not automatically copy external images.

Later deliberate choice between:

```text
REFERENCE
IMPORT
```

---

# 49. Dawarich – later

Dawarich uses:

```text
LocationHistoryProvider
```

Possible functions:
- Where were we on date X?
- Which shared Places were visited?
- Suggest Places for Memories

SideBySide must function completely without Dawarich.

---

# 50. Daily Check-in – later

Optional.

Not a medical diagnosis system.

DailyCheckIn:

```text
- accountId
- spaceId
- localDate
- mood
- energy?
- note?
- visibility
- createdAt
```

Possible intentional de-DE display levels:

```text
sehr schlecht
schlecht
neutral
gut
sehr gut
```

Partner display only after voluntary sharing.

Feature can be completely disabled.

---

# 51. `Unsere Fragen` – after the Core

Dedicated later Domain:

```text
Question
QuestionAssignment
QuestionAnswer
QuestionFavorite
```

Central reveal rule:

Both answer independently.

Before both have answered, neither partner may see the other's answer.

Before reveal, it should also avoid disclosing whether the partner has already answered wherever possible.

Later functions:
- Daily Question
- categories
- archive
- Search
- open/answered
- personal Favorites
- yearly/monthly filters
- change today's question
- create custom question
- schedule question
- add question to pool
- answered question → HeartMoment

Do NOT adopt the existing question catalog.

A completely new editorial question pool will be created later.

---

# 52. `Unser Jahr` – after the Core

No persisted Year Recap is required.

YearRecapQueryService calculates:

- Memories count
- HeartMoments
- Questions
- Milestones
- Chapters
- Places
- completed Wishes
- completed Plans
- month groups
- highlights
- Cover Media

Later:
- monthly recaps
- PDF/Print
- sharing

Empty statistics need not be displayed.

---

# 53. Offline

MVP:

```text
Offline Read Cache = YES
Offline Write = NO
```

Android may display the last loaded data locally.

When writing without connectivity:
show a clear message that nothing has been saved yet.

Full Offline Sync / Outbox only later.

The Optimistic Concurrency architecture should prepare for this.

---

# 54. Public Share Links

Not part of SideBySide Next 1.0.

No public Share Links in the MVP.

Reevaluate later.

---

# 55. AI

No AI features in the MVP.

No:
- AI Text Enhancement
- AI Coach
- AI Image Analysis
- AI Question Generation

Optional later.

The Core must not depend on them.

---

# 56. Product Analytics

Do not collect private content.

Allowed technical/product examples:

- appVersion
- screenOpened
- featureUsed
- crash
- accountCreated
- partnerInvited
- partnerJoined
- firstMemoryCreated
- D7 active
- D30 active
- subscriptionState

DO NOT collect:

- Memory body
- HeartMoment text
- QuestionAnswer
- PrivateNote
- GiftIdea
- personal location description

No mandatory Meta/TikTok SDK in the product.

---

# 57. Logging and Observability

Logs may contain:

- requestId
- accountId
- spaceId
- route
- duration
- status
- errorCode

Do not log:

- Memory.body
- HeartMoment.text
- QuestionAnswer
- PrivateNote.body
- GiftIdea content
- sensitive ProfilePreference values
- precise location

Scrub Error Tracking as well.

---

# 58. Delete / Data Retention

Base rule:

When deleting:
- Chapter
- Place
- Collection

remove Relations, but do not automatically delete foreign original content.

Account and Space deletion require explicit processes.

Concrete Retention periods must be defined separately before Cloud launch.

Portability and complete deletion must be technically possible.

---

# 59. Security

Security is a Release Gate.

Mandatory tests:

- Cross-Tenant / IDOR
- private resource leakage
- malformed IDs
- Invitation abuse
- token Replay
- Refresh Rotation
- revoked Sessions
- Rate Limiting
- upload abuse
- malicious media
- XSS
- CSRF for Browser flows
- SQL Injection
- signed URL expiration
- Backup Authorization
- Search Privacy leaks

Tenant Isolation test:

```text
User A / Space A = allowed
User B / Space A = allowed
User C / Space B = never allowed
anonymous = never allowed
```

Additionally test Private Isolation through:

- List
- Search
- Dashboard
- Timeline
- Notifications
- Export
- Relations
- Attachments
- Update/Delete

---

# 60. Tests

Four levels:

1. Unit Tests
2. Integration Tests
3. API Contract Tests
4. End-to-End Tests

Additionally, a dedicated:

```text
SECURITY & PRIVACY TEST SUITE
```

A feature is not complete while Cross-Tenant and, where applicable, Privacy tests are missing.

---

# 61. Definition of Done per Domain feature

A feature is complete only when it includes:

- data model
- migration
- Domain Service
- Authorization
- API
- OpenAPI
- Validation
- Error Codes
- Unit Tests
- Integration Tests
- Cross-Tenant Tests
- Privacy Tests where relevant
- Export support for persistent user data
- Web UI
- Android UI
- Error Handling
- documentation

A working button alone does NOT mean "done".

---

# 62. Client parity

A Core function is production-ready only when Web and Android exhibit the same Domain behavior.

The UI need not be identical.

But behavior must match for:

- Create
- Read
- Update
- Delete
- Authorization
- Visibility
- Validation
- Errors

---

# 63. CI/CD

For every commit at minimum:

- formatting
- lint
- type check
- Unit Tests
- Integration Tests
- Security/Privacy tests
- dependency scan
- secret scan
- Backend build
- Web build
- Android build once available

Later additionally:
- container scan
- SBOM
- license scan

Do not ignore failing tests.

---

# 64. Dependency and asset provenance

Document all new dependencies:

- name
- version
- source
- license

Document all assets:

- origin
- license
- creator

Do not include assets of unclear provenance.

Use Branding assets only when they are explicitly provided as approved for SideBySide Next.

Do NOT choose a final license for the project's own new source code yet.

Do not automatically add an MIT/Apache/AGPL LICENSE file until explicitly decided.

Of course, comply with Third-Party license obligations.

---

# 65. PROVENANCE

Maintain `PROVENANCE.md` from the beginning.

Document conceptually:

> SideBySide Next is an independently implemented software project based on a functional product specification. No source code from SharedMoments or SideBySide Classic is to be copied into the implementation.

Document:
- start date
- specification version
- dependencies
- assets
- contributors
- relevant provenance
- optionally AI-assisted development internally

Do not claim that this technical documentation alone guarantees a particular legal licensing outcome.

---

# 66. Freemium architecture

Do not embed fixed product prices in Domain code yet.

Keep the Entitlement system flexible.

Cloud working hypothesis:

Free:
- 1 Space
- text features largely unlimited
- limited Media Storage
- limited number of selected convenience features

Premium:
- more Storage
- extended convenience/recap features
- Premium services

Do NOT artificially limit personal Memories by item count.

Self-Hosted:
- must remain meaningfully usable
- do not artificially cripple functionality

Possible later supporter services:
- Push Relay
- Offsite Backup
- Health Monitoring
- Restore Service
- Support
- Update Services

---

# 67. Later real E2EE

Real E2EE is NOT MVP.

But the architecture must prepare for it.

A possible later marketing claim only after actual implementation and Audit, intentional de-DE copy:

> "Eure Erinnerungen sind Ende-zu-Ende verschlüsselt – selbst SideBySide kann sie nicht lesen."

Never use this claim BEFORE actual implementation and Audit.

---

# 68. Development milestones

## M0 – Clean Foundation

- isolated new project
- repository structure
- Backend foundation
- PostgreSQL
- Alembic
- API conventions
- UUIDv7
- Error Model
- Domain Event Foundation
- Transactional Outbox
- Job Foundation
- Provider Interfaces
- E2EE-ready Payload Boundary
- CI
- Provenance
- Dependency Documentation

Outcome:
a new independent technical platform is running.

## M1 – Identity & Relationship

- Accounts
- email/Auth Identities
- Sessions
- Passkey-capable Auth architecture
- Self-Hosted OIDC-ready
- Spaces
- Memberships
- Invitations
- Tenant Authorization
- Private Authorization
- SpaceProfile
- PartnerProfile
- ProfilePreferences
- RelatedPersons
- ImportantDates

Outcome:
two partners can safely use a Space.

## M2 – Memory Core

- MediaStore
- Attachments
- Memories
- HeartMoments
- Milestones
- Comments
- Story
- `"Weißt du noch?"`
- Security Tests

Outcome:
SideBySide is already usable as a real couple/Memory app.

## M3 – Shared Life

- Wishes
- Plans
- Places
- Content Relations
- Chapters
- Collections
- PrivateNotes
- GiftIdeas
- PrivateCollections

## M4 – Engagement

- Reminders
- Reminder Scheduling
- Important Date Notifications
- Activity
- Notifications
- Push abstraction
- `"Ich denke an dich"`
- Dashboard
- Search
- Rule/Suggestion Engine

After M4, the functional Core is largely complete.

## M5 – Clients & Portability

- versioned Export
- normal Import
- prepared Classic migration path
- complete React Web Client
- complete Native Android Client
- Read Cache
- Client parity
- responsive UX
- Accessibility Basics

## M6 – Rich Relationship Features

- `Unsere Fragen`
- completely new question pool
- Year Recap
- Month Recap
- Daily Check-in
- PDF/Print Year Recap

## M7 – Integrations

- Discovery Provider / Events
- Shopping Domain
- Recipe Provider
- `"Was kochen wir heute?"`
- Entertainment Provider
- movie/series releases
- Immich Provider
- Dawarich Provider
- Maps / Places / Geocoding Provider

## M8 – Contextual Features

- opt-in Location Context
- Geofencing
- Shopping Context
- contextual Suggestions
- optional partner distance
- Ephemeral Presence

## M9 – Productization

- Self-Hosted Compose
- Backup/Restore
- Cloud Deployment
- Managed Storage
- Managed DB
- Entitlements
- Billing Adapter
- Privacy functions
- Security Hardening
- Penetration Tests
- Observability
- Release Pipeline
- Store Preparation

## MX – Future E2EE

Only later:
real end-to-end encryption.

---

# 69. What does NOT belong in the first MVP

Do not pull into the first Core:

- real E2EE
- Full Offline Write Sync
- AI
- public Share Links
- complex movie recommendations
- Event Discovery
- recipe integration
- Shopping Automation
- Immich
- Dawarich
- Google Maps integration
- Geofencing
- partner distance
- Daily Check-in
- `Unsere Fragen`
- Year Recap

The architecture must allow extensions, but the Core should first become clean and secure.

---

# 70. Immediate start – PHASE D

You may now begin the **Clean-Room implementation**.

Do NOT work in the old SideBySide/SharedMoments repository.

## D0 – Verify isolation

First of all:

1. run `pwd`
2. verify whether the current directory is SideBySide Classic / SharedMoments
3. if so: make NO changes there
4. use a new isolated workspace, preferably:

   `~/Projekte/SideBySide-Next`

5. ensure no files are copied from Classic

## D1 – Initialize new project

New structure:

```text
sidebyside-next/
├── backend/
├── web/
├── android/
├── deploy/
├── docs/
├── specification/
└── tools/
```

Initialize Git if no new repository exists there yet.

Do not add a remote and do not push until explicitly instructed.

Local, logically small commits are allowed after green tests.

## D2 – Documentation first

Create at minimum:

- README.md
- PROVENANCE.md
- docs/ARCHITECTURE.md
- docs/SECURITY.md
- docs/PRIVACY-MODEL.md
- docs/DEPENDENCIES.md
- specification/PRODUCT-SPEC.md

These files are based exclusively on this Master Specification.

Do not consult old code.

## D3 – Implement M0

Then begin M0:

- FastAPI skeleton
- SQLAlchemy 2
- PostgreSQL connection
- Alembic
- `/health`
- Problem Details error handling
- UUIDv7 support
- UTC conventions
- base Entity conventions
- transaction handling
- OutboxEvent
- Job foundation
- Domain Event contracts
- MediaStore interfaces
- Provider interfaces
- E2EE-ready ProtectedPayload abstraction
- initial CI
- tests

## D4 – PostgreSQL locally

Create a Docker Compose configuration for Development with PostgreSQL.

No SQLite fallback.

## D5 – First Security foundation

Before real content Domains, implement:

- Account skeleton
- Space
- Membership
- Tenant Context
- Membership Guard
- Security tests

Do this before Memory etc. are implemented.

## D6 – Working method

Work incrementally.

After each block:

1. run tests
2. run Lint/Typecheck
3. run `git diff --check`
4. run `git status`
5. briefly summarize:
   - what changed
   - why
   - which tests ran
   - result
   - next step

On errors:
- investigate the cause
- do not simply disable tests
- do not bypass Security checks

## D7 – No unnecessary clarification questions

If a decision is unambiguously defined by this specification, do not decide it again and do not ask about it.

Ask only when:
- a real product decision is missing
- a Security-relevant decision cannot be derived from the specification
- an action requires external credentials
- a remote/GitHub repository would need to be created
- costs could be incurred
- a final source-code license would need to be chosen
- access to old Classic source appears necessary

If you believe Classic source code is needed:
STOP.
Do not open it.
Instead explain which functional information is missing from the specification.

---

# 71. Priority

Priority order:

1. Clean-Room separation
2. Security / Tenant Isolation
3. clean Domain model
4. stable API
5. tests
6. Portability
7. Web/Android UX
8. extensions
9. Cloud monetization

No shortcut may weaken Tenant Isolation or Privacy.

---

# 72. Definition of success

At completion, SideBySide Next should:

- be implemented completely independently
- require no SharedMoments/Classic codebase
- support Cloud operation
- support Self-Hosted operation
- be secure in a Multi-Tenant environment
- support Native Android
- support Web
- be Provider-neutral
- allow E2EE to be added later
- allow extensions without fundamental rearchitecture
- have clean Provenance

Begin with D0 and D1.

First show:
1. which isolated working directory you use,
2. the planned initial directory structure,
3. that the Classic repository is not modified,

then continue directly with M0 unless a real blocker occurs.

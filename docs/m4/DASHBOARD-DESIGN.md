# M4-A Dashboard Design

**Status:** blocking contract decisions `DECIDED`  
**Owning issue:** #272

## 1. Purpose

Dashboard is the shared Space overview. It composes already-authorized domain data into a small read-optimized response without becoming a new persistence source.

Public route:

```text
GET /api/v1/spaces/{spaceId}/dashboard
```

M4-A does not create a `dashboard` table, background dashboard builder, or copied payload cache.

## 2. Shared-surface privacy invariant

Dashboard has one privacy meaning: **shared relationship context**.

Therefore:

- only `SPACE_SHARED` or otherwise explicitly shared domain data may enter the response;
- `OWNER_ONLY` data is excluded even when the caller is its owner;
- private HeartMoments are excluded even for their owner;
- PrivateNote, GiftIdea, PrivateCollection and private child data never influence Dashboard;
- private resource counts, timestamps, existence flags or ordering effects are forbidden.

This prevents the same Dashboard URL from having a hidden personal/private side channel and keeps shared client behavior predictable.

## 3. First M4-A response sections

Conceptual shape:

```text
DashboardView
- space
- partner?
- relationshipDuration?
- retrospective?
- upcoming[]
- recentShared[]
```

M4-A does not include placeholders for not-yet-delivered features.

Absent until their owning slices exist:

- `thinkingOfYou` / intentional de-DE product concept `Ich denke an dich`;
- Activity;
- Notifications;
- Reminder-derived cards;
- Rule/Suggestion output;
- Daily Question;
- Year Summary / recap.

When those features are implemented, the Dashboard contract may be extended backward-compatibly through an explicit decision/API review.

## 4. Space and partner summary

The summary is derived from the requested Space and active Memberships.

Conceptually:

```text
DashboardSpaceSummary
- spaceId
- partner?       # other active partner summary when present
```

The partner summary should expose only fields already intended for shared profile presentation, for example display name and authorized profile image reference where available. Authentication identities, email addresses, sessions and technical account metadata are not Dashboard fields.

A Space without a second active partner returns no partner object; this is not an error.

## 5. Relationship duration

The Dashboard may include a derived duration only when both conditions hold:

- `SpaceProfile.showRelationshipDuration == true`;
- `relationshipStartedOn` exists.

Conceptual shape:

```text
RelationshipDuration
- startedOn
- daysTogether
- displayMode
```

`daysTogether` is derived from the caller-local calendar date using the caller's configured timezone. The backend does not return localized prose such as `4 Jahre, 3 Monate`.

Clients use `displayMode` plus their locale-aware date/duration presentation.

If duration display is disabled or the start date is missing, omit `relationshipDuration` rather than returning a synthetic zero.

## 6. Basic retrospective — `Weißt du noch?`

M4-A provides one deterministic Free/Core retrospective candidate without AI, recommendation scoring, copied content or private data.

Eligible sources:

- Memory with `happened_on`;
- Milestone;
- SHARED HeartMoment.

Rule:

1. determine caller-local current calendar date;
2. select shared candidates whose domain event date has the same month/day and whose year is less than the current year;
3. choose the candidate from the most recent prior year;
4. within the same prior year use stable source-type then resource-ID tie-breakers;
5. return a typed reference plus the minimum already-authorized presentation fields;
6. if no candidate exists, omit the section.

No fuzzy date window is introduced in v1. February 29 matches only February 29.

The retrospective references the original resource and duplicates no domain content into a new table.

## 7. Upcoming items

Upcoming is not a Reminder queue. It derives future-facing information from domains that already own dates.

Initial sources:

### Planned Plan

Eligible when:

```text
status == PLANNED
plannedStart >= now
```

Use `plannedStart` as an instant.

### ImportantDate

Use the next occurrence according to its existing recurrence semantics. Non-repeating past dates are not upcoming.

### RelatedPerson birthday

Eligible only when all three hold (#617/#699):

```text
birthday IS NOT NULL
visibility == SHARED
showBirthdayOnDashboard == true
```

`/today` is not a general third-party birthday calendar; a `RelatedPerson` birthday is never projected merely because it exists and is shared. `showBirthdayOnDashboard` defaults to `false` and is an explicit, per-person, per-birthday opt-in independent of Reminder delivery.

When eligible, derive the next calendar occurrence using the same canonical annual-recurrence rule as ImportantDate and the Reminder/Rule runtime. Preserve the existing `birthdayYearKnown` meaning; do not infer a missing birth year.

### Relationship anniversary

If `relationshipStartedOn` exists, derive the next anniversary occurrence. This is independent of whether relationship duration display is enabled: the stored start date is shared relationship data, but the client may choose presentation according to the final product contract.

### Time basis

- instants use UTC internally and are compared to the current instant;
- pure recurring calendar dates use the caller's configured timezone to determine `today`;
- response carries typed date/instant values, never pre-localized strings.

### Ordering and limit

Order by next occurrence ascending, then item type, then stable source ID.

Default M4-A section limit:

```text
8
```

The API contract may make the limit internal rather than client-configurable. Dashboard is not a general listing endpoint.

## 8. Recent shared items

`recentShared` is deliberately **not** an Activity feed.

Eligible shared root resources:

- Memory;
- Milestone;
- SHARED HeartMoment;
- Wish;
- Plan;
- Place;
- Chapter;
- Collection.

Order:

```text
createdAt DESC, type ASC, id ASC
```

Default limit:

```text
8
```

Use creation time, not `updatedAt`, so editing old content or reordering a list does not masquerade as new relationship activity. Activity semantics belong to M4-B.

CollectionItems, Comments and private resources are not top-level recent Dashboard cards in M4-A.

## 9. Result projection

Dashboard cards contain only the minimum data needed to render/route the overview.

Conceptually:

```text
DashboardItem
- type
- id
- titleOrText?      # bounded, authorized presentation content
- occurredOn?       # domain DATE if meaningful
- scheduledAt?      # upcoming instant if meaningful
- createdAt?        # recent section
```

Do not return:

- raw ProtectedPayload objects;
- coordinates;
- private metadata;
- full bodies/descriptions when a short recognition field is sufficient;
- server-rendered localized prose.

## 10. Empty state contract

Optional singular sections are omitted/null when no real domain value exists.

Collections such as `upcoming` and `recentShared` may be returned as empty arrays if that improves generated-client stability. The final OpenAPI contract must choose one representation and keep it stable.

The server never fabricates placeholder domain rows to keep a card visible.

## 11. Consistency model

Dashboard is not a transactional financial/reporting snapshot.

M4-A uses one normal application unit of work and authorization context. Individual section queries may observe ordinary PostgreSQL `READ COMMITTED` behavior during concurrent writes.

Accepted:

- a just-created item may appear in one section on one request and in another section on the next request;
- upcoming/recent ordering may change between requests as normal writes commit.

Not accepted:

- owner-only leakage;
- Cross-Tenant leakage;
- a section becoming visible because a private row exists;
- broken source references returned from a single section query.

Do not add locks or stronger isolation merely to make Dashboard sections a globally atomic snapshot unless later evidence demonstrates a real correctness need.

## 12. Caching

M4-A Dashboard response uses private `no-store` semantics in v1.

Rationale:

- response combines user-specific Membership/profile/timezone context;
- sections are time-sensitive;
- M5 will own deliberate persistent Read Cache behavior;
- avoiding premature server/client cache semantics prevents stale privacy-sensitive state from becoming a hidden contract.

No ETag is required for the initial derived Dashboard response.

## 13. Observability

Do not log:

- Dashboard titles/text;
- relationship content;
- private candidate counts;
- exact ImportantDate/relationship dates as metric labels;
- partner/profile payloads.

Content-free latency and section-size telemetry may be used only in a privacy-safe aggregated form.

## 14. Freemium boundary

The basic Dashboard described here is **Free/Core** for Self-Hosted and Cloud.

Potential later Premium extensions must be distinct capabilities, for example richer visual presentation, analytical insights, premium recap modules, or advanced widgets. Premium must not be required simply to open the normal relationship home/dashboard or access the underlying Core data.

## 15. Mandatory runtime tests

At minimum S2 must prove:

- active Membership/Tenant Guard is required;
- partner summary uses only authorized shared profile data;
- relationship duration omitted when disabled/missing;
- caller timezone drives pure-date derivation deterministically;
- retrospective exact month/day selection and stable tie-break;
- PRIVATE HeartMoment never becomes retrospective even for its owner;
- upcoming Plan, ImportantDate, birthday and anniversary ordering;
- recent shared ordering by creation, not update;
- owner-only resources do not influence section presence/count/order;
- Cross-Tenant rows never enter any section;
- deletion/privacy transition cannot leave a stale copied Dashboard row because none is persisted;
- response contains no fake M4-B/M4-C/M6 fields;
- user-generated content is not emitted into logs on error paths.

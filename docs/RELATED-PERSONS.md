# Related Persons and Important Dates

## Scope

The M1 Domain `people` contains two objects from section 12 of the Master Specification:

- `RelatedPerson`: a person in the couple's environment — child, parent, sibling, friend. It has **no eimir. Account**, no login, and no invitation.
- `ImportantDate`: a date important to the couple. It may belong to a `RelatedPerson`, but does not have to — the couple's own anniversary belongs to nobody else.

Not included: Memories, Notifications, and Rules. Dates are modeled so a later Rule such as `"Lisa has a birthday in 7 days"` can work from metadata.

## Data minimization

For third parties, store only what is needed for relationship care: display name, relationship type, and a birthday. No addresses, schools, phone numbers, or similar data. These people cannot view or delete their data themselves; therefore the model intentionally remains narrow.

Display name and date label are the protected parts and are stored in a `ProtectedPayloadJSON` column — application-encrypted at rest when encryption is enabled (`crypto_version = 2`, see [ENCRYPTION-AT-REST.md](ENCRYPTION-AT-REST.md)), legacy plaintext otherwise (`crypto_version = 0`); **not E2EE**. Everything needed for sorting, linking, and later reminders — relationship, date, recurrence, visibility — remains queryable as columns.

## Visibility

The request specifies `visibility` (`SHARED` or `PRIVATE`), never the Privacy class. The server derives:

- `SHARED` => `SPACE_SHARED`
- `PRIVATE` => `OWNER_ONLY`

Read and write operations then use the central Owner/Privacy Guard; the condition is part of the SQL query and not a later filter.

Only the owner may write. A shared entry from the partner is readable and returns 403 on write attempts; a private partner entry returns 404 because a 403 would confirm its existence.

## A date is never more open than its person

A `SPACE_SHARED` date attached to an `OWNER_ONLY` person would reveal that the private person exists.

The rule therefore lives in the schema and not only in the service. `important_dates` carries `space_id` and the Privacy class of its person as a copy; both together form a composite foreign key to `related_persons (id, space_id, privacy_class)`. This ensures:

- a date cannot point to a person from another Space;
- a date cannot be more open than its person; a CHECK enforces that an `OWNER_ONLY` person only has `OWNER_ONLY` dates.

`ON UPDATE CASCADE` keeps the copy current. The service checks the same rule first so clients receive an explanatory 422 (`IMPORTANT_DATE_MORE_OPEN_THAN_PERSON`) rather than a database error.

## Changing and deleting a person

**Making private:** If shared dates still exist for this person, the transition is rejected with 409 (`RELATED_PERSON_HAS_SHARED_DATES`). They are not silently reclassified — including the partner's dates.

Private dates owned by the partner do not block the transition: they remain allowed, and rejecting because of them would reveal that they exist.

**Deletion:** The client must send an explicit `deletePolicy` with every delete. Allowed values are only:

- `preserve`: Delete the `RelatedPerson`; keep linked `ImportantDate` rows and remove the person relation. This also applies to the partner's `OWNER_ONLY` dates.
- `cascade`: Delete the `RelatedPerson` and all linked `ImportantDate` rows. This intentionally also applies to the partner's `OWNER_ONLY` dates.

Without a valid policy the request returns 422. There is no destructive default.

Both variants run atomically in the same DB transaction. The person and, for `preserve`, linked dates are locked for mutation; the existing person `If-Match`/version check remains mandatory. When unlinking preserved dates, their version increases like any other ORM change.

The Delete response is empty 204 for both policies and must not contain counts, existence indicators, or metadata about linked dates. This applies regardless of whether the partner has zero, one, or multiple private dates on this person.

The UI must actively choose between **preserve dates** and **delete dates too** before execution. For `cascade`, a clear but general warning is required, for example:

> Dates linked to this person may also include entries from your partner.

The UI must never display or indirectly reveal whether such private partner dates exist, how many exist, or any titles, dates, types, or other metadata.

## Birthday without known year

`DATE` has no representation for a date without a year. If the birth year is unknown (`birthdayYearKnown = false`), the server stores month and day using placeholder year **1904** — a leap year so February 29 can be represented. The database enforces the placeholder so no second location in code can choose another year.

Clients display only day and month when `birthdayYearKnown = false`. A known year without a date is inconsistent and is rejected with 422 (`RELATED_PERSON_BIRTHDAY_REQUIRED`) instead of silently corrected.

## Dashboard birthday visibility

`showBirthdayOnDashboard` (default `false`) is an explicit, per-person opt-in for this birthday to appear in the shared Dashboard `upcoming` list (#699). A `RelatedPerson` is never a Dashboard source just because it has a birthday - #617 established that third-party dates are not projected into the couple's `/today` context by default, and this flag is the deliberate exception a user chooses per person.

Projection requires all three at once: `birthday` is set, `visibility` is `SHARED` (`SPACE_SHARED`), and `showBirthdayOnDashboard` is `true`. A `dashboard_visibility_needs_a_birthday` CHECK enforces the first condition at the schema level; the service validates it before persistence with the same 422 pattern as `RELATED_PERSON_BIRTHDAY_REQUIRED`.

This setting is independent of Reminder delivery. Enabling or disabling Dashboard visibility never changes whether a Reminder fires for this birthday, and vice versa - they are separate preferences that happen to read the same `birthday` column.

## Concurrency

Both objects carry a version. Writes require `If-Match` with the last read version; stale state returns 409 (`VERSION_CONFLICT`). Responses include the version as `ETag`.

The canonical lock order for linked mutations is:

1. lock the `RelatedPerson` parent;
2. write or lock affected `ImportantDate` rows;
3. run reminder reconciliation.

A person privacy update or delete takes the parent lock with `FOR UPDATE`. An ImportantDate create or relink takes the same parent with `FOR SHARE`, then revalidates guarded readability and the person's current Privacy class while holding that lock. If the date link commits first, a waiting `SHARED -> PRIVATE` transition sees the shared date and returns `409 RELATED_PERSON_HAS_SHARED_DATES`. If the privacy transition commits first, a waiting shared date link sees the private person and returns the existing privacy-safe absence or `422 IMPORTANT_DATE_MORE_OPEN_THAN_PERSON`, depending on whether the caller may still read the person.

An operation must not lock an ImportantDate and then acquire its RelatedPerson lock. Keeping every linked write parent-first prevents a deadlock cycle with privacy transitions and the explicit person delete policies. The composite foreign key, `ON UPDATE CASCADE`, and `never_more_open_than_its_person` check remain the final database backstop.

## Events

This Domain emits no Outbox Events. M1 has no recipient for them, and an Event about a third party would create a second copy of their data with its own retention. When reminder logic arrives, the Event is created there with metadata only and without plaintext.

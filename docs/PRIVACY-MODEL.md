# Privacy Model

## Position

eimir. manages what a couple voluntarily puts into it: memories,
emotional moments, wishes, private notes, and preferences. This is not
arbitrary application content. How it is handled is a product feature.

No advertising. No sale of personal data. No unnecessary tracking.
Sensitive content does not flow into analytics.

## Classes

| Class | Visible to | Examples |
|---|---|---|
| `SPACE_SHARED` | both partners | shared memory, milestone, plan |
| `OWNER_ONLY` | owner only | private note, gift idea, private HeartMoment |
| `TEMPORARY_SHARED` | shared for a limited time | time-limited sharing |
| `EPHEMERAL_CONTEXT` | short-lived, with TTL | derived situation, presence |
| `SYSTEM_METADATA` | system | job, audit, outbox |

There is no implicit public class. Public sharing links are not part of 1.0.

## The hard boundary

The partner is **not** a privileged reader. For `OWNER_ONLY`, the partner is
treated the same as any unrelated person.

This applies especially to private storage — private notes, gift ideas,
private lists — and to HeartMoments with `visibility = PRIVATE`. A surprise
that its recipient can see is not a surprise.

This is enforced server-side in the query, not in presentation logic.

## Two kinds of profile information

They are strictly separated because confusing them causes direct harm:

**`SELF_PROFILE`** — information someone shares about themselves with their
partner. Favorite food, favorite flowers, genres, dislikes. It is visible to
the partner by design.

**`PRIVATE_PARTNER_NOTE`** — information someone records privately about their
partner. Gift idea, observation, surprise planning. It must never appear in
the visible partner profile.

Both describe the same person. Only one may be visible to that person.

## Third parties

Children, family members, and friends are not accounts. `RelatedPerson`
deliberately stores little: display name, relationship, and optional birthday.

By default, **no** addresses, schools, or third-party phone numbers are stored.
Those people have never provided consent.

`birthday_year_known` allows a birthday without a year — for a child, age is
often more sensitive than the day itself.

## Location

Location features are **off** by default. They require explicit opt-in.

Four concepts are kept strictly separate:

| Concept | Meaning |
|---|---|
| `Place` | deliberately stored shared place |
| `LocationHistory` | external history from an integration |
| `Presence` | current, short-lived location |
| `Context` | derived situation, for example "probably at the supermarket" |

Where possible, evaluation happens on the device rather than in the cloud.
Server-side location data uses the minimum required precision, short retention,
no location data in normal logs, and can be revoked at any time.

Optional partner distance remains off until deliberately enabled and does not
create a persistent history.

### Selected-photo places and readable addresses (#1459 / #1478)

The later Product Owner decision for #1459 makes selected-photo Place association
default ON under an account-wide revocable preference; it does not enable device
tracking, LocationHistory, Presence or inference. #1478 additionally permits
asynchronous reverse lookup of canonical shared photo coordinates, including
untouched historical automatic Places. Private HeartMoments never enter this path.

The backend Photon adapter sends only the saved coordinate pair and a language
code to the configured origin. By default this is `https://photon.komoot.io`; the
service sees these coordinates and the backend IP. No photograph, EXIF blob,
Memory title, account/Space identity or authorization credential is transmitted.
This is a concrete third-party data flow, not an anonymous or on-device claim.
The existing setting explains the flow; operators may replace the origin with
their own Photon instance or disable lookup with an empty value. An operator
must review its own recipient/privacy and availability obligations before a
managed launch; the public demo has no SLA.

The job holds current owner/Membership, preference, Place and shared-target
authorization against concurrent changes before egress. Manual correction,
unlink, private transitions, disabled Accounts and ended Memberships stop later
work. OFF prevents pending lookups and future extraction; it preserves previously
saved history and cannot retract a lookup already delivered to the service.
The ordinary job payload contains canonical IDs only. No cross-couple location
cache is created. Lookup results live in the existing protected Place payload,
including OSM source attribution, with the same encryption, export, backup and
deletion boundary. Provider failure retains the original coordinate/map action.

Opening an external map remains a separate deliberate action. Its destination
receives the original saved coordinates, with no account token or referrer. The
browser makes no map, geocoder, tile or preview request merely to read a Memory.

## Notifications

Push notifications contain **no** sensitive text by default.

> de-DE product copy example: **Neue Aktivität in eimir.**

instead of the original private text. A notification can appear on a locked
screen that other people may see — possibly the partner for whom a surprise is
intended.

## Analytics

Allowed technical and product events include: app version, opened screen,
feature used, crash, account created, partner invited, partner joined, first
memory created, activity after 7 and 30 days, and subscription status.

Not collected: contents of memories, HeartMoments, answers, private notes and
gift ideas, or personal location descriptions.

No mandatory advertising-network SDK is included in the product.

## Portability and deletion

A versioned native transfer format allows complete export of user data.
Passwords, passkeys, refresh tokens, sessions, push tokens, and security logs
are not exported — they are access mechanisms, not memories.

Deleting a chapter, place, or list removes relationships but **does not** delete
another person's original content. Dissolving a chapter must not delete a
partner's memories.

Account deletion and Space deletion are separate, explicit operations.
Concrete retention periods are defined before the cloud launch.

## Disabled features

Disabling a feature **never** deletes its data automatically. Turning a feature
off is not a deletion request.

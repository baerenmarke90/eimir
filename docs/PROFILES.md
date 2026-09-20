# Partner Profiles and Preferences

## Scope

The M1 Profiles Domain strictly separates two technically different kinds of information:

- `SELF_PROFILE`: An Account describes itself to the active partner in the same Space. These rows are `SPACE_SHARED`.
- `PRIVATE_PARTNER_NOTE`: An Account privately remembers something about the other active partner. These rows are `OWNER_ONLY`.

There is no `PUBLIC` visibility and the request cannot freely set `privacyClass`. The API derives the Privacy class server-side from the Domain `visibility`.

### Account presentation identity

`Account.display_name` is the authoritative current presentation name for an authenticated person. It is not an authentication identifier and changing it does not change the Account ID, email address, OIDC issuer/subject, Passkey credentials, password identity, or active sessions.

Display names are normalized in the identity service: surrounding whitespace is removed, at least one visible non-control character is required, Unicode content is preserved, and names longer than 120 characters are rejected rather than silently truncated. Local registration and later profile edits use the same rule. An unusable external OIDC display-name claim falls back to the neutral `Partner` name instead of making an otherwise verified identity unusable.

Person/author projections use the **current Account presentation identity** unless a domain explicitly documents a historical snapshot field. A stored historical event remains historical content, but an ordinary author label/avatar is not a second authoritative copy of the old display name.

## Persistence

`partner_profiles` is the visible profile aggregate root of an Account in a Space. At most one row exists per `(space_id, owner_id)` and the database enforces `SPACE_SHARED`.

`profile_preferences` stores structured preferences. Metadata such as category, topic, sentiment, ownership, and visibility remain separate from the protected `value`. The value is stored in a `ProtectedPayloadJSON` column with `crypto_version = 0`; this is plaintext and **not E2EE**. The separation keeps the later migration to client-side sealed payloads possible.

The database additionally enforces:

- `SELF_PROFILE` => `account_id == owner_id`, `SPACE_SHARED`, visible `partner_profile` exists.
- `PRIVATE_PARTNER_NOTE` => `account_id != owner_id`, `OWNER_ONLY`, no connection to visible `partner_profile`.

Therefore a private partner note cannot become part of the visible partner profile through faulty serialization.

### Avatar media binding

Profile avatars reuse the existing Attachment/MediaStore lifecycle. `account_profile_attachments` is a one-to-one attachment-parent relation: one Account has at most one current avatar and one Attachment can belong to at most one Account profile. It is a media binding only, not a second Account/Profile aggregate.

The relation stores only stable IDs. No temporary or signed provider URL becomes profile state. Upload validation, sanitization, thumbnail generation, storage keys, retention and physical cleanup remain owned by the existing attachment pipeline.

The central attachment binding resolver reports profile media as `ACCOUNT_PROFILE`. This means avatar attachments participate in the same cross-parent exclusivity rule as Memory and HeartMoment media and are no longer considered unbound once attached to a profile. Normal replacement/removal detaches the old relation before that attachment enters the existing deletion lifecycle.

The visible profile contract exposes only the stable nullable `profileAttachmentId`. The authenticated owner can set another READY image Attachment that they own in the currently authorized Space, or send an explicit `null` to remove the current avatar. Replacement/removal uses the existing `DELETING` and media-cleanup lifecycle; the Profile domain never deletes provider objects synchronously and never creates avatar-specific storage keys.

Avatar bytes are served only through the authorized profile-avatar route. The caller first proves that the Account has a readable profile in the caller's current Space. The server then resolves exactly that Account's current avatar binding; the caller cannot supply an arbitrary Attachment ID. The route prefers the existing thumbnail when available, otherwise serves the sanitized original, and returns `private, no-store` cache semantics. It never turns the avatar into a public unauthenticated URL or profile-stored signed URL.

Avatar presentation identity is Account-global. If the same Account is an active member of another Space, that Space may render the same current avatar after its own profile/membership authorization succeeds. This applies only to the exact current Account-profile binding and does not make any other Attachment readable.

### Ownership and lifecycle authority for Account profile media

**The Account is the authoritative owner and the authoritative lifecycle parent of its profile media.** No Space owns it, and no Space lifecycle may delete it. This is the single answer to the ownership question; the upload Space is only where the bytes happened to arrive.

Binding an attachment as an avatar therefore *adopts* it into the Account:

- the provider object is copied to the Account storage home `accounts/{accountUuid}/attachments/{attachmentUuid}/{variant}`;
- `attachments.space_id` becomes `NULL`, which marks the row as Account-owned and is the one deliberate exception to the mandatory tenant key of `PrivateResourceMixin`;
- the removal of the former Space-home object is queued as a durable Job in the same transaction, so an interruption retries instead of leaking.

Consequences that must stay true:

- Space self-exit and final zero-active-Space retention never delete Account profile media. Retention adopts an avatar bound under the earlier contract before it removes the Space, so the purge still leaves no `Attachment` row referencing a removed Space.
- Adoption is idempotent. Re-running it for an already Account-owned row changes nothing, and `purge` removes both storage homes a row may ever have occupied, so an interrupted adoption cannot leave an object without a live parent.
- Adoption is not an authorization change. `space_id IS NULL` never matches a Space-scoped query, so Account-owned media is unreachable through every Space attachment route; the avatar is served only by the profile-avatar route described above.
- Account deletion (#520) remains the lifecycle that removes profile media, and avatar replacement/removal keeps using the existing `DELETING`/media-cleanup path.
- The demo reset detaches and purges its personas' profile media explicitly, because it can no longer rely on the demo Space cascade to do it.

## Authorization

Every endpoint begins with the existing Tenant Context. Lists and detail access then use the central Owner/Privacy Guard. The filter condition is part of the SQL query; invisible rows are not loaded first and discarded afterward.

For `SPACE_SHARED`:

- both active partners may read,
- only the owner may write or delete.

For `OWNER_ONLY`:

- only the owner may read, write or delete,
- for the affected partner and Cross-Tenant caller the resource is indistinguishable from a missing resource (`404`).

The visible endpoint:

`GET /api/v1/spaces/{spaceId}/profiles/{accountId}`

always filters to `SELF_PROFILE`. The owner's own private notes about this person therefore cannot accidentally appear in this profile view.

`PATCH /api/v1/spaces/{spaceId}/profiles/{accountId}` is self-write only and requires the last-read Account presentation `ETag` in `If-Match`. Omitted identity fields remain unchanged. `displayName` is normalized and validated only by the authoritative identity-domain rule; changing it does not change authentication identity or sessions. `birthday` is an optional date-only Account identity field; explicit `null` clears it and active partners may read it only through the normal current-Space profile authorization. An explicit `profileAttachmentId: null` removes the avatar, while a non-null ID must pass the existing READY/owner/current-Space/image validation. Display name, birthday and avatar share one Account-global `version`, because they follow the Account across Spaces; birthday/avatar changes advance that version too. A stale write returns `409 VERSION_CONFLICT` rather than silently overwriting a newer edit.

`GET /api/v1/spaces/{spaceId}/profiles/{accountId}/avatar/content` requires an authenticated caller with readable current-Space profile access and returns `404` for a missing/invisible/non-ready current avatar. It does not accept an Attachment ID and therefore cannot be used as a cross-tenant media guessing oracle.

## API

- `GET /api/v1/spaces/{spaceId}/profiles/{accountId}`
- `PATCH /api/v1/spaces/{spaceId}/profiles/{accountId}`
- `GET /api/v1/spaces/{spaceId}/profiles/{accountId}/avatar/content`
- `GET /api/v1/spaces/{spaceId}/profile-preferences`
- `POST /api/v1/spaces/{spaceId}/profile-preferences`
- `GET /api/v1/spaces/{spaceId}/profile-preferences/{preferenceId}`
- `PUT /api/v1/spaces/{spaceId}/profile-preferences/{preferenceId}`
- `DELETE /api/v1/spaces/{spaceId}/profile-preferences/{preferenceId}`

Profile identity changes as well as ProfilePreference changes/deletes use ETag/`If-Match`. Stale versions return `409 VERSION_CONFLICT` instead of a silent Lost Update. The identity ETag is Account-global; preference ETags remain resource-local.

## Stable enums

Categories:

`FOOD`, `DRINK`, `FLOWERS`, `MOVIES`, `SERIES`, `MUSIC`, `HOBBIES`, `ACTIVITIES`, `TRAVEL`, `RESTAURANTS`, `COLORS`, `OTHER`.

Sentiments:

`LOVE`, `LIKE`, `NEUTRAL`, `DISLIKE`, `AVOID`.

Visibility:

`SELF_PROFILE`, `PRIVATE_PARTNER_NOTE`.

Unknown values are rejected by the API and additionally excluded through database constraints.

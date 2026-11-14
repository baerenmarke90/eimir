# Decision 0015: Collection Item create carries a scoped request identity

**Status:** Proposed in #1808 (step B1); becomes accepted when the Product Owner merges the pull request  
**Date:** November 14, 2026  
**Owning issue:** #1808  
**Builds on:** [Decision 0012](0012-memory-create-request-identity.md) (request identity for Memory create) and the shared `create_receipts` mechanism that Comment, Wish, Plan, Milestone and HeartMoment already use

## Context

The shared shopping list queues item changes on the device while there is no connection and sends them later.
A queued "add item" request can be sent more than once: the response of a request the server already committed
can be lost, and a queue replays what it cannot confirm. Without a request identity the second send would add
the same Item to the couple's shared list again.

Decision 0012 states that every further create endpoint needs its own scoped decision; the mechanism is not a
platform. This is that decision for Collection Items.

## Reuse review (`docs/REUSE-BEFORE-BUILD.md`)

| Candidate | Finding |
| --- | --- |
| `Idempotency-Key` header and `create_receipts` (decision 0012) | Reused as is: optional UUID header, scope (Space, Account, resource type, key), receipt claimed in the create's own transaction, fingerprint of the normalized request, `200` replay, `409 IDEMPOTENCY_KEY_REUSED`, 24 hour retention pruned by the existing job. |
| Client-supplied Item ID in the request body | Rejected: it would be a second identity mechanism next to the one every other create endpoint uses, and a stale retry after a deletion could not be told apart from a fresh create without a stored receipt. |
| Version/`If-Match` on the create | Not applicable: a create has no prior version. Updates keep using `If-Match`. |

## Decision

`POST /spaces/{spaceId}/collections/{collectionId}/items` accepts the optional `Idempotency-Key` header with the
semantics of decision 0012.

- **Fingerprint:** SHA-256 of the normalized request: Collection ID, trimmed title, `completed` and, when
  present, the trimmed quantity. Including the Collection ID means the same key cannot silently create an Item in
  a different list. No content is stored, only the fingerprint.
- **Replay:** the same identity and fingerprint returns `200 OK` with the *current* representation of the
  original Item and its `ETag`; nothing is written.
- **Different request, same identity:** `409 IDEMPOTENCY_KEY_REUSED`.
- **Original Item deleted later:** `404 COLLECTION_ITEM_CREATE_RESULT_DELETED`. The Item is never recreated by a
  stale retry. If the whole Collection was deleted the request fails with the usual `404 COLLECTION_NOT_FOUND`.
- **Without the header** the operation is unchanged, so older clients stay valid.
- **Authorization:** the Collection is resolved and write-locked first, exactly as for a plain create. The key
  never grants anything and is only meaningful inside the caller's own Account and Space.
- **Client rule:** a client replays a key for at most **12 hours**, half the server retention (decision 0012).
  After that a queued create is reported as not saved and the user adds the Item again. Updates (set completed,
  set quantity, rename) carry no key: they set a value, so repeating them is harmless, and they stay protected
  by `If-Match`.
- **Storage:** one additive migration extends the closed `resource_type` check of `create_receipts` with
  `COLLECTION_ITEM`; no new table, no backfill. Its downgrade deletes the receipts of that type, which only
  protect retries for at most 24 hours.
- **Lifecycle:** receipts cascade with their Space and Account and are removed on membership end and Account
  deletion by the existing cleanup. Nothing is added to export, because receipts are technical retry state.

## Business/freemium consistency

No business/freemium impact. Shared Collections and checklists stay Free/Core and identical on Self-Hosted and
Cloud (`docs/FREEMIUM-FEATURE-MATRIX.md`). The added metadata is bounded (about 150 bytes plus index entries for
at most 24 hours per identified create) and adds no quota, entitlement or provider.

## Consequences

- The generated TypeScript client gains an optional `idempotencyKey` parameter and an explicit `200` response on
  `createCollectionItem`.
- Step B2 of #1808 (the on-device queue) generates one key per queued create and keeps it with the queued request.
- Other Collection writes are not changed. Creating a Collection itself offline is out of scope.

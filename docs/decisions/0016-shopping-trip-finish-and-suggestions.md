# Decision 0016: Finishing a shopping trip and the suggestions it leaves

**Status:** Proposed in #1808 (step E1); becomes accepted when the Product Owner merges the pull request  
**Date:** November 14, 2026  
**Owning issue:** #1808  
**Builds on:** [Decision 0015](0015-collection-item-create-request-identity.md) (shopping list items) and the shopping variant of shared Collections (`kind = SHOPPING`)

## Context

A shopping trip ends when the couple has everything in the cart. Today the cart stays on the list, so the next
trip starts with a list full of old, checked entries that someone has to delete one by one. The agreed design
(#1808, Product Owner decisions of 2026-11-13) has a **finish-the-trip** action that clears the cart, keeps the
titles for suggestions, and shows an end state once; the suggestions come from "last bought" and are removable.

Two people can press the action at the same time on their own phones, a request can be repeated after a lost
response, and a partner can still be checking entries while the other finishes. None of that may duplicate or
lose an entry.

## Reuse review (`docs/REUSE-BEFORE-BUILD.md`)

| Candidate | Finding |
| --- | --- |
| Delete the entries with the existing `DELETE .../items/{itemId}` one by one | Rejected: one request per entry is not atomic, cannot add the titles to the suggestions in the same step, and a partner's concurrent finish would race entry by entry. |
| `Idempotency-Key` and `create_receipts` (decisions 0012 and 0015) | Not needed: the action is idempotent by its own definition below, so no receipt, fingerprint or retention is added. |
| Row lock of the Collection (`require_writable_locked`) | Reused: it already orders concurrent writers of one list, so two finishes run one after the other. |
| A product-wide recommendation service or an on-device list of past entries | Rejected: suggestions must come from this couple's finished trips only, be shared by both partners, removable and deleted with the list; a client-only copy would differ per phone. |
| Protected payload columns (`ProtectedPayloadJSON`) | Reused for the suggestion text, like every other user-written title. |

## Decision

**Finish.** `POST /spaces/{spaceId}/collections/{collectionId}/finish` with `{ "itemIds": [...] }`, the entries of
the cart as the person sees it. Only shopping lists have it (`422 COLLECTION_SHOPPING_NOT_SUPPORTED` otherwise).

- Within one transaction, with the list row locked, every named entry that **still exists and is still
  completed** is taken out of the list; its title (and last quantity) moves to the suggestions of the list. The
  remaining entries keep their order and are renumbered without gaps.
- An entry that is named but open again, deleted, or unknown is skipped. An entry that was checked after the client
  read the list is not named, so it stays in the cart for the next finish.
- **Idempotent without a key:** repeating the request, or the partner's finish of the same cart, finds nothing left
  and returns `200` with `finishedCount: 0`; nothing is duplicated and nothing is lost. A retry can never finish
  entries the client did not name.
- **Authorization** is the one of editing the list: the couple, no one else (`404` for outsiders).
- **Response:** `200` with the updated Collection (and its `ETag`) and `finishedCount`, so the client shows the end
  state with one request. The request names at most **200** entries; this is a technical bound, not a product limit.
- **Events:** one `COLLECTION_ITEM_DELETED` per finished entry and one `COLLECTION_UPDATED`, referencing ids only,
  exactly like deleting entries today. No title is written to an event.

**Suggestions.** A new table `collection_suggestions` belongs to one shopping list.

- A suggestion exists only because an entry was finished on a trip of this list. Buying the same thing again
  (same title ignoring case and spacing) updates one suggestion: latest wording and quantity, `lastBoughtAt`, and
  `timesBought + 1`.
- `GET .../suggestions` returns them, most recently bought first. `DELETE .../suggestions/{suggestionId}` removes
  one (`404 COLLECTION_SUGGESTION_NOT_FOUND`); both partners can read and remove. Adding a suggestion to the list
  is the existing create of an entry; no new endpoint.
- **Retention:** until removed or until the list is deleted (`ON DELETE CASCADE`). A list keeps at most **200**
  suggestions; beyond that the least recently bought ones are dropped. This is a technical bound against abuse.
- **Privacy:** the text is user content and is stored like every other title (protected payload, encrypted at rest
  when configured). Suggestions are shared within the couple only; the client states that in a short note next to
  them (step E2). They are included in the Space data export with their list and removed with the Space.
- **Not covered:** suggestions for plain lists, suggestions across lists, and counting or summing quantities.

## Business/freemium consistency

No business/freemium impact. Shared Collections and checklists stay Free/Core and identical on Self-Hosted and
Cloud (`docs/FREEMIUM-FEATURE-MATRIX.md`). The added data is small, bounded (at most 200 suggestions per list)
and adds no quota, entitlement, managed resource or provider.

## Consequences

- One additive migration (`0129`) creates `collection_suggestions`; its downgrade drops the table.
- The OpenAPI contract gains `finishCollectionShopping`, `listCollectionSuggestions` and
  `deleteCollectionSuggestion`; the generated TypeScript client follows.
- `collection_suggestions` is registered in the Space data transfer and in the payload encryption context table.
- Step E2 of #1808 adds the suggestion chips with their privacy note, the finish-the-trip action, the end state
  (everything is in the cart) and the shared-achievement moment. The action is online-only: it is not part of the on-device
  queue of step B2.

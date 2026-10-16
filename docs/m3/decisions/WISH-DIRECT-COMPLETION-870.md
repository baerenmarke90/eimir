# Wish Direct Completion — #870 Decision Addendum

**Status:** `DECIDED`  
**Date:** September 12, 2026  
**Tracking:** #870  
**Supersedes:** only the direct-completion prohibition and Wish operation list in `WISH-PLAN-LIFECYCLE.md`

This addendum extends the M3 Wish lifecycle for the product case in which a shared Wish becomes reality without first becoming a Plan. All M3 ownership, tenant isolation, Plan cardinality, return-to-Wish, delete, locking, and normal-PATCH rules remain authoritative unless explicitly changed below.

## 1. Superseded rules

The following two statements from `WISH-PLAN-LIFECYCLE.md` are no longer authoritative after #870:

- the Section 3 rule that there is no direct Wish Complete route;
- the Section 9 Wish operation list insofar as it omitted direct completion.

No other M3 lifecycle decision is superseded.

## 2. Binding Wish state machine

```text
OPEN -- convert-to-plan --> PLANNED
OPEN -- complete-directly --> COMPLETED
PLANNED -- plan complete --> COMPLETED
PLANNED -- return-to-wish --> OPEN
```

`COMPLETED` remains terminal.

Status remains server-owned. `WishUpdate` does not gain a `status` field and there is no generic status or reopen endpoint.

## 3. Direct-completion command

```text
POST /api/v1/spaces/{spaceId}/wishes/{wishId}/complete
If-Match: <wish-version>
```

The request has no body. The route itself expresses the lifecycle intent.

The command is valid only when all of the following are true:

- the acting account is authorized to write the shared Wish;
- the Wish is currently `OPEN`;
- the supplied `If-Match` version is current;
- no originating Plan exists for the Wish.

On success:

- Wish status becomes `COMPLETED`;
- Wish version increments through the normal versioned persistence path;
- the response returns the updated `WishDetail` and ETag;
- the existing `WISH_COMPLETED` event is emitted without Wish title or other relationship content.

## 4. Plan lifecycle remains authoritative once entered

A `PLANNED` Wish cannot use direct completion. It must be completed by completing its originating Plan so the Plan and Wish transition atomically under the existing M3 contract.

The direct command therefore rejects:

- stale versions with `RESOURCE_VERSION_CONFLICT`;
- repeated completion with `WISH_ALREADY_COMPLETED`;
- a `PLANNED` Wish with its originating Plan with `WISH_HAS_ACTIVE_PLAN`;
- contradictory Wish/Plan persistence states with `WISH_PLAN_STATE_CONFLICT`.

The canonical lock order remains:

```text
Wish -> Plan
```

The command locks the Wish before checking/locking any originating Plan.

## 5. Optional Memory continuation is not part of the transaction

Direct Wish completion and Memory creation are separate user actions and separate writes.

After a successful direct completion, Web may offer the optional continuation:

```text
Wunsch erfüllt -> Erinnerung daraus festhalten
```

Binding rules:

- no Memory is created automatically;
- the existing canonical Memory Create flow is reused;
- only the authoritative Wish title may be passed as an editable prefill in this slice;
- no experienced date, time, body, place, media, or privacy state is invented from the Wish;
- Memory Create continues to own its own date default and final validation;
- no Wish-to-Memory relation is inferred from title/date matching;
- reloading an already-completed Wish must not guess whether a Memory exists or re-offer a duplicate continuation based on heuristics.

A future durable Wish-to-Memory provenance relation requires its own explicit domain decision and contract.

## 6. Privacy and authorization

#870 does not change the shared-Wish authorization model:

- both active partners may complete an `OPEN` shared Wish;
- tenant isolation remains server-authoritative;
- foreign Space/resource access remains Privacy-safe;
- completion entitlement does not grant access to any Memory;
- optional Memory creation uses the Memory domain's own authorization and privacy rules.

## 7. Contract and regression requirements

The OpenAPI contract must expose `completeWish` as a versioned command and generated clients must remain in sync.

Regression coverage must include at least:

- successful `OPEN -> COMPLETED` direct completion;
- completion by the other active partner;
- stale `If-Match`;
- repeated completion;
- rejection once the Wish belongs to the Plan lifecycle;
- Cross-Space isolation;
- content-free completion event;
- no arbitrary Wish status field in create/update DTOs;
- Web continuation focus behavior and title-only Memory handoff;
- no heuristic Memory continuation after a completed Wish is reloaded.

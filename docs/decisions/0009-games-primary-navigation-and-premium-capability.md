# Decision 0009: Games owns the fifth primary destination and one couple-scoped Premium capability

**Status:** Accepted; primary-navigation placement superseded by Decision 0010 / #905  
**Date:** September 12, 2026  
**Owning issue:** #902  
**Parent product decision:** #866  
**Amends:** `0003-primary-navigation-and-route-model.md`, `0008-product-ia-harmonization-and-domain-alignment.md`, and the affected primary-navigation/route tables in `../INFORMATION-ARCHITECTURE.md`

**Current product-design authority:** [Product Reference v1](../product/design/product-reference-v1.md) now defines the Mobile Web Product Reference mentioned below. These decisions retain their compatible route, Games capability, and navigation-placement boundaries (Decision 0010 supersedes Decision 0009 placement); their dated screen descriptions are not independent pixel locks.

## Context

The accepted `Gemeinsam spielen` product area now contains a deliberately bounded initial set of five relationship-native games under #866. Product Owner direction makes this area a first-class Premium destination rather than a utility hidden under `Mehr`.

The existing navigation contract already limits primary navigation to at most five destinations. Before this decision, the fifth slot was reserved for a future top-level `Entdecken` domain at `/discover`. In the current product, discovery behavior is already part of `Momente`; keeping both a future top-level Discover area and the accepted Games area would require a sixth primary destination and reopen the consolidated shell hierarchy.

The centralized entitlement architecture from ADR 0006 / #523 also requires a stable provider-neutral capability identifier before protected Games functionality can land.

## Decision

### Primary navigation

The canonical five primary product areas are now:

```text
Wir · Momente · Planen · Spielen · Mehr
```

Stable Web route IDs and paths:

| Route ID | Label | Canonical Web path |
|---|---|---|
| `today` | Wir | `/today` |
| `story` | Momente | `/story` |
| `plan` | Planen | `/plan` |
| `games` | Spielen | `/games` |
| `more` | Mehr | `/more` |

`Spielen` owns nested `/games/...` routes and remains active for them.

The unused future **primary** `/discover` reservation is superseded. This does not remove discovery experiences inside `Momente` and does not prohibit future discovery features there. Adding a sixth primary destination would require a new explicit Product Owner / IA decision.

Mobile Web is the implementation and Product Reference source for this new destination. Android/iOS adapt it only after the Mobile Web shell and Games area are accepted; this decision does not authorize premature native UI work.

### Compact shell

Compact Web retains Quick Create as a global action while exposing all five product destinations. The shell therefore contains five destination links plus the existing Quick Create action in one thumb-reachable row. Product destination ordering remains `Wir · Momente · Planen · Spielen · Mehr`; Quick Create is a global action and is not a sixth product destination.

### Premium capability

All accepted games share one normalized Space/couple-scoped capability:

```text
games.couple
```

Canonical backend enum member:

```text
Capability.GAMES_COUPLE
```

Do not introduce per-game capability keys, SKUs, credits, round limits, or client-local Premium authority.

The existing centralized entitlement service remains authoritative. Entitlement never expands normal content authorization, and `OWNER_ONLY` / private data remains unavailable to shared games regardless of commercial state.

### Product-area discoverability

Free Spaces may enter `/games` and understand the five game concepts through one calm page-level Pro explanation. Gameplay itself requires `games.couple` once individual games are implemented. The shell must not infer readiness or preview content from private relationship data.

## Consequences

- The old top-level Discover reservation in earlier IA documents is no longer authoritative.
- `Spielen` consumes the fifth and final primary-navigation slot.
- Existing `Momente` discovery functionality remains intact.
- The initial Games hub contains the five #866-approved games and no filler catalog entries.
- No generic game engine or realtime multiplayer infrastructure is implied by this decision.
- Web may lead the shell adaptation temporarily while native clients wait for Product Owner acceptance, consistent with the Mobile-Web-first Product Reference rule.

## Follow-up

After #902 is accepted, #863 may introduce the first concrete game session/read seam. Remaining games continue as separate focused slices under their owning issues.

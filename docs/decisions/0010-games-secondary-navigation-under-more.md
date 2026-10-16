# Decision 0010: Games is a secondary destination under More

**Status:** Accepted  
**Date:** September 12, 2026  
**Owning issue:** #905  
**Supersedes:** the primary-navigation placement and six-slot compact-shell parts of Decision 0009  
**Preserves:** the `games.couple` Premium capability and `/games` route contract from Decision 0009

**Current product-design authority:** [Product Reference v1](../product/design/product-reference-v1.md) now defines the Mobile Web Product Reference mentioned below. These decisions retain their compatible route, Games capability, and navigation-placement boundaries (Decision 0010 supersedes Decision 0009 placement); their dated screen descriptions are not independent pixel locks.

## Context

Real-device Product Owner review of the accepted Games shell showed that five product destinations plus Quick Create make the compact bottom navigation too crowded. The additional `Spielen` slot reduces spacing and makes the shell feel compressed at the 390-class reference width, with 320 px reflow even more constrained.

Games remains a first-class product area, but it does not need a persistent primary-navigation slot. `Mehr` already owns secondary destinations and is the appropriate discovery point for a product area that users enter intentionally rather than continuously switching to during the core daily flow.

## Decision

The persistent primary Web navigation is:

```text
Wir · Momente · Planen · Mehr
```

On compact Web, Quick Create remains the centered global action in the original accepted third slot, producing the established five-slot shell:

```text
Wir · Momente · + · Planen · Mehr
```

`Spielen` is exposed from the `Mehr` overview as a secondary destination.

The canonical Games route remains unchanged:

```text
/games
```

Nested Games routes remain under `/games/...`. They are treated as belonging to the `Mehr` navigation area for active-state purposes, so `Mehr` stays selected while a user is inside Games.

No redirect or URL migration is introduced. Existing deep links to `/games` remain valid.

## Premium and privacy semantics

This decision does not change the commercial or authorization model from Decision 0009:

- Games remains Premium.
- `games.couple` remains the single Space/couple-scoped capability.
- The backend entitlement core remains authoritative.
- Commercial entitlement never expands content authorization.
- `OWNER_ONLY` and other private data remain unavailable to shared Games regardless of Premium state.

## Consequences

- Compact navigation returns to the established five-slot order `Wir · Momente · + · Planen · Mehr`.
- Quick Create stays centered between `Momente` and `Planen`; moving Games must not reorder the remaining compact shell.
- Expanded Web navigation also omits `Spielen` as a primary destination for consistent information architecture.
- `Mehr` gains a Games entry using the existing Games icon and product copy.
- `/games` and future `/games/...` gameplay routes continue to work without path changes.
- The Games hub and #863 implementation sequence continue unchanged.
- Native clients should follow the same information hierarchy when adapting the accepted Mobile Web Product Reference.
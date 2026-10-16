# 6. Release the Core before optional product expansion

- **Status:** accepted
- **Date:** 2026-09-01
- **Issue:** #433

## Context

The original forward roadmap placed rich relationship features in M6,
integrations in M7, contextual/location features in M8, and only then placed
Productization/Release in M9.

That ordering no longer reflects the product boundary eimir. has reached.
M0-M4 already define a substantial functional Core and M5 is explicitly the
milestone that turns that Core into complete, parity-checked Web and Android
clients. Questions, Daily Check-in, Recaps, Discovery, external integrations,
Maps and Geofencing are all optional expansion capabilities; the product
specification already states that they are not required for the first MVP.

Making those capabilities prerequisites for Backup/Restore, safe deployment,
administration, release engineering, Entitlements, hardening and final launch
QA would delay a safe release for reasons unrelated to Core readiness.

The growing Relationship Depth backlog (#429-#432) also needs a common module
and Daily Check-in boundary before runtime work starts. Pulling those domains
into the currently active M5 would create the opposite problem: M5 would stop
being a client-completion milestone and become an unbounded feature milestone.

## Decision

Keep **M0-M4 unchanged** as historical milestone boundaries and keep **M5 —
Client Completion & Parity** unchanged in purpose.

Reorder the forward roadmap from M6 onward:

| Milestone | Scope | Gate / outcome |
|---|---|---|
| **M5 — Client Completion & Parity** | complete Web/Android integration, Export/Import, Read Cache, Deep Links, Accessibility, Performance and parity | **G4 — Core Release Candidate** |
| **M6 — Operate & Launch** | Self-Hosted and Cloud/Managed operation, Backup/Restore/Upgrade, administration, observability, Entitlements/Billing boundary, release engineering, hardening and final release QA | **G5 — Launch-ready** |
| **M7 — Relationship Depth** | optional relationship modules, Daily Check-in/Vibe/Energy, partner notes/support gestures, Questions, shared achievements and Recaps | post-launch product depth |
| **M8 — Discover & Integrations** | Shopping, Recipes, Events/Entertainment, external media and provider adapters | optional external integration |
| **M9 — Context & Presence** | Maps/location history, opt-in location context, Geofencing, Presence and contextual suggestions | privacy-sensitive contextual expansion |
| **MX — E2EE** | real end-to-end encryption | separate strategic track |

M7-M9 are **not prerequisites for the first release**.

## Narrow supersession of the Master Specification

`specification/CLEAN-ROOM-MASTER-SPEC.md` remains the highest-level source for
Clean-Room, security, Privacy, Domain, architecture, testing and implementation
requirements.

This ADR and Product Spec 1.1 supersede **only the milestone numbering and order
of M6-M9 in section 68** of the current Master Specification. The old section
68 scopes map as follows:

- old **M9 Productization** -> new **M6 Operate & Launch**;
- old **M6 Rich Relationship Features** -> new **M7 Relationship Depth**;
- old **M7 Integrations** -> new **M8 Discover & Integrations**, except active
  location/context semantics;
- old **M8 Contextual Features** plus Maps/location-history user semantics from
  old M7 -> new **M9 Context & Presence**.

No other Master Specification requirement is weakened or superseded by this
roadmap decision. A later Master Specification consolidation may rewrite
section 68 to match this accepted decision directly.

## M5 scope protection

M5 productizes the M0-M4 Core. It may establish reusable navigation, settings,
state-management and client infrastructure, but it must not invent new M7
Domain contracts solely because the clients are being completed.

#429-#432 therefore remain outside M5 runtime scope.

## M6 structure

M6 planning should cover at least these risk classes, with final slice numbers
set by its readiness package:

1. release engineering and Android/store identity/signing;
2. Backup/Restore/Upgrade, retention and recovery evidence;
3. Self-Hosted, persistent development/staging, promotion/rollback and
   Cloud/Managed deployment;
4. application administration, including registration/maintenance and
   ServerAdmin surfaces;
5. the centralized commercial Entitlement/capability runtime and provider-neutral
   billing/licensing adapters from #262;
6. final Security, Privacy, Accessibility, performance, incident and recovery QA.

Existing issues are reclassified against this milestone by their owning scope;
this ADR does not silently expand their implementation requirements.

## M7 readiness before new runtime

M7 begins with a readiness/module boundary before individual relationship
features are implemented.

### Effective capability composition

Keep these concerns distinct:

```text
deployment/server capability
        intersection
commercial entitlement capability
        intersection
Space module configuration
        intersection
personal preference/consent where required
        =
effective product capability
```

#432 is the conceptual owner for this M7-S0 Space module configuration work.
Disabling a module is not deletion, cannot bypass Entitlements, and cannot take
away the partner's Security, Privacy, Accessibility or essential data rights.

### Creator authority

V1 may grant the Space creator module-management authority. Runtime code should
consume an authoritative capability such as `canManageSpaceConfiguration`
rather than permanently spreading direct `accountId == space.createdBy`
comparisons through Domain and client code. That leaves room for later shared
or transferable administration without redefining every caller.

### Personal status remains voluntary

A Space-wide module being enabled only makes the feature available. It does not
force a partner to publish Vibe, Energy or other personal/emotional state.
Personal sharing remains an individual action and privacy decision.

### One Daily Check-in foundation

#429 and #431 remain separate product experiences, but M7-S0 must evaluate one
small `DailyCheckIn` foundation for their optional daily dimensions rather than
creating parallel status backends. `vibe` and `energyLevel` are conceptual
examples; exact persistence, date/timezone, retention and history semantics are
owned by the readiness decision.

## M8 / M9 boundary

M8 owns provider-backed discovery and external integrations that do not require
continuous location context.

M9 owns user-visible location history/context, Maps, Geofencing, Presence and
contextual suggestions. An external provider such as Dawarich may be an adapter,
but location-history/context semantics remain in M9 so the privacy model is
reviewed as one coherent capability family.

## Consequences

- G4 still means **Core Release Candidate** after M5.
- G5 now follows M6 directly and means **Launch-ready**.
- Entitlement/billing runtime references that previously pointed to old M9 now
  point to M6/#262 in active forward-looking documentation.
- M7-M9 can evolve after launch without reopening the Core release gate.
- Historical dated reviews remain immutable. Completed milestone documents and
  old issue discussions may retain historical milestone names when their text
  is clearly describing the decision state at that time.
- This decision changes sequencing, not the Free/Premium classification of any
  capability.

## Alternatives considered

- **Keep Release in M9.** Rejected because optional product expansion would
  remain a launch prerequisite despite not being part of the first MVP.
- **Pull new relationship features into M5.** Rejected because M5 would lose its
  bounded client-completion/parity purpose and G4 would keep moving.
- **Release after M5 without a dedicated operational milestone.** Rejected
  because Backup/Restore, deployment, administration, Entitlements, hardening
  and release QA are real launch requirements and deserve their own gate.
- **Merge integrations and location context.** Rejected because active location,
  Presence and Geofencing have a materially different Privacy/risk profile from
  normal provider integrations.
# Deliberate offline Today checklist writes — #508

Baseline: `main@3bac184b8cd1dcf82cbf4831c9845fbf252d3aef` (2026-10-16).

## Pre-implementation review

Reviewed `TodayPinnedCollection`, its existing component/browser cases, the
Account/Space/Collection query key, per-item online request serialization,
confirmed-version rollback and existing snackbar/celebration behavior. Seven new production-component characterizations fail on unchanged runtime:
both offline signals leave the wrong outcome, both are ignored at queued
dispatch, a failed predecessor still permits dispatch, and a new offline intent
can supersede an already active online attempt. The initial four regressions
were recorded before runtime implementation; the additional admission cases
exposed that dispatch-only rejection is insufficient for the per-item queue.

This is a bounded repair of the existing no-offline-write contract, not a new or
materially redesigned feature. The previous checklist repair explicitly deferred
this per-item queue. Preserve all existing Today content, controls, add sheet,
canonical list link, shell/navigation, local checked state and motion. No new
markup, text, visual state, interaction or generated composition is needed.
The current [R4 Today](../../r4-today.md), Product Reference v1 and Today template
remain authoritative; historical whole-Today references are not layout overrides.

## Mobile Interaction Contract

| Concern | Contract |
| --- | --- |
| 1–2. Outcome and relationship value | Trust a shared practical checkbox: immediate online feedback, truthful rollback when nothing was saved. No new emotional copy or celebration. |
| 3–5. Compact, action and hierarchy | Existing `/today` composition; real relationship content remains focal. The checkbox is the row action; title, count, disclosure, add and open-list controls retain their hierarchy. |
| 6–7. Disclosure and interaction | Keep the existing native semantic pressed button and progressive list/add controls. No new task, typing, gesture or overlay. |
| 8–9. Loading and empty | Current authorized read/loading/empty behavior remains. No new Today persistence or cached-offline guarantee. |
| 10. Error | Roll back only the latest failed item intent to its confirmed version and use the existing localized snackbar; keep unrelated items and data. |
| 11. Offline | Reject a new offline intent before replacing the current online intent. End it immediately, without API dispatch, paused mutation or reconnect replay. Also recheck connectivity inside the per-item continuation, immediately before dispatch. Recovery reads are permitted; another write requires a new explicit activation. |
| 12. Success | Preserve server-confirmed item/version reconciliation. Shared-achievement feedback still requires the existing authoritative header; no failed/queued action may manufacture it. |
| 13. Privacy | Existing authorized Space-bound shared list; no private projection, extra persistence, API or visibility change. |
| 14–16. Reflow, motion and Expanded | Existing wrapping, target sizes, keyboard/pressed semantics, tokenized feedback and reduced-motion behavior remain. Expanded keeps the same task and content hierarchy. |
| 17–19. Pattern and input | A real checklist justifies rows. Reuse `ChecklistToggle`, the existing snackbar and Query cache. No keyboard activation or extra recall/typing. |
| 20. Generated reference | Not applicable to this contract repair: no new/material composition or capability. Existing feature composition remains; actual fresh full-screen evidence will validate the repaired behavior. |
| 21. Acceptance | Open → offline toggle → rollback/error → reconnect with zero writes → deliberate toggle/reopen → confirm → canonical detail and return. Cover Compact Light/Expanded Dark, queued dispatch, failed predecessor, both offline signals and existing online rapid-toggle/version cases. |

## Reuse and business review

Reuse review relevant: compare the installed TanStack Query mutation modes and
the existing detail/pin/gesture/check-in consumers. Reuse per-mutation
`networkMode: 'always'`, `retry: false` and the shared `assertOnlineWrite` /
`isClientOnline` helpers. Reject offline activations before claiming a new item intent; retain the earlier
online attempt if present. Keep online per-item serialization: it prevents stale
If-Match requests and is not an offline outbox. A global network-mode change,
second queue or dependency is unnecessary. The [official network-mode contract](https://tanstack.com/query/latest/docs/framework/react/guides/network-mode)
was rechecked. No dependency/provider adoption, license/terms, data flow, cost or
operator setup changes.

**No business/freemium impact:** shared lists and baseline interaction quality
remain Free/Core in Cloud and Self-Hosted. Existing capability, ownership,
entitlement, resource, retention, export and downgrade boundaries stay intact.

Cross-cutting: preserve item versions, item-local rollback and rapid online
intent ordering. Do not pause error recovery reads while offline or retain a
write lock for them. No API/schema, native wrapper/capability, deployment,
telemetry, persistence or token changes. This slice does not claim to fix other
creation/mutation families, remount ownership or the whole #508/#946 scope.

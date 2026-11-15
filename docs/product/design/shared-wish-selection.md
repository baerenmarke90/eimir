# Shared wish selection

Owning issue: [#1535](https://github.com/baerenmarke90/eimir/issues/1535).

## Product decision and repository-aware preflight

The Product Owner approved the mobile concept in this chat on 2026-10-30 and
requested its implementation and a pull request. This includes the proposed
Free/Core classification. Baseline main: `daf8783fde32c53ff72a03bf02e2ebad6ef92417`.
The existing `/plan` hub, Pläne/Wünsche tabs, local create actions, nearest/later/
undated/history groups, PlanCover, WishProductPage, canonical Wish-to-Plan
transition, focused task navigation and semantic tokens were reviewed before
generating the implementation reference and before runtime implementation.

![Generated Compact reference](references/shared-wish-selection/compact-reference.png)

The built-in Imagegen reference preserves the existing Plan hub and incorporates
the approved invitation and result task. It is composition guidance: its large
filled add button and alternate navigation glyphs are not implementation
requirements. Keep the real local add action and existing shell. The depicted
Plans deliberately have no photos; actual selected Plan imagery and galleries
remain intact. The exact prompt is retained alongside the image.

Authority: Product Reference v1, R3 Planning, Plan Hub / focused Create-Edit /
Detail templates, the participation contract, component selection/feedback/task
contracts and the normative motion guideline.

## Mobile Interaction Contract

- Outcome: choose an actual next experience from two to five shared Wishes.
  One person can assemble the round and prepare a Plan from their own favorites.
  Optional bilateral sharing reveals common favorites, not a comparison chart.
- Placement: one invitation after the nearest Plan, before later/undated content;
  a named entry also exists in Wishes. Preserve all existing hub capabilities.
  Focused selection tasks use local Back and the existing origin/return system.
- Steps: choose candidate Wishes and an optional occasion; mark personal
  favorites; deliberately share; read common favorites; prepare the canonical
  Plan with optional scheduling; save; observe the actual Plan; return.
- Input: native checkbox lists make bounded simultaneous comparison appropriate.
  No mandatory typing, premature keyboard, hidden swipe, score, random ranking,
  deadline, reminder pressure, comparative contribution indicator or game gate.
- Drafts: personal checkbox edits remain in the account/Space-scoped task until
  explicit sharing. Failed writes retain input. Dirty/pending exits follow the
  existing task guard. Editing a published selection deliberately withdraws it;
  the common result disappears until it is shared again. Cancellation does not
  silently republish it. Draft state never enters URLs, logs or durable browser
  storage. Account/Space changes invalidate late callbacks and local state.
- Candidates: starting a replacement round is explicit and explains that both
  selections reset. Cancel keeps the existing round. New ideas use normal Wish
  creation. Removed/converted candidates are revalidated; existing resulting
  Plans open rather than being duplicated. A deleted source never leaks a title.
- Privacy: the server returns only the caller's selection and an authorized
  intersection after both current members publish. Never return partner decision
  arrays, draft timestamps, per-person counts or a rejected-idea list. Intersection
  results can logically reveal some preferences; do not promise that every
  individual choice remains secret after sharing. No E2EE claim.
- States: initial/loading is distinct from no round and insufficient Wishes.
  Waiting, no common favorites and one/multiple common favorites have distinct
  compositions and meaningful next actions. A single active member can continue
  alone. Error/refetch failure preserves valid content; failed publication never
  claims success. Offline writes are explicitly unsaved, not queued.
- Result: Wish title supplies the Plan title; date/time are optional, with the
  existing date-only/timed/cross-day semantics. Saving uses the authoritative
  idempotent Wish-to-Plan operation, then opens the actual canonical Plan detail.
  One person's proposal is labeled as such and never implies mutual agreement.
- Compact: 320 px reflow and 360/390/430 px, 200% text, safe areas, native
  controls, at least 44 px targets, visible focus and meaningful labels. Expanded
  retains bounded reading width and the same sequence without extra columns.
- Motion: existing tokenized press/selection feedback and scoped confirmed-result
  arrival; no delayed writes, looping delight or confetti. Reduced motion retains
  all copy, state and focus. Warmth comes from actual Wish titles and anticipation.
- Acceptance: test Open -> select -> share -> result -> prepare/save -> actual
  Plan -> return, including dirty cancellation, failures, stale responses,
  independent participants, zero matches, source deletion/conversion, offline,
  keyboard, narrow/large text, Light/Dark and reduced motion. No native wrapper
  capability changes; the Capacitor app delivers the same canonical Web UI.

## Persistence, authorization and lifecycle

One current bounded round per Space, normalized Same-Space candidate relations,
and separate OWNER_ONLY selections. Titles and favorite-ID sets use existing
ProtectedPayload encryption-at-rest boundaries. No raw choices in events or logs.
Round changes use opaque round identity/version tokens; owner-selection writes carry both round
and own-selection identity so a stale old-round submission cannot become consent
in a replacement round. Partner writes do not overwrite the caller's choices.

Serialize round creation/reset with the existing Membership -> Space lifecycle
barrier. Bind each round to the current active Membership context, and remove
the temporary round on membership changes or explicit closure. Source Wish
relations use composite Same-Space keys and deletion cascades. Publishing and
reading revalidate current candidates and source Plan references. Plan conversion
retains the existing Wish -> Plan locking and unique source-Wish constraint.

Only current-round state is retained; there is no history of rejected choices.
Closing/replacing a round removes its selections while preserving original
Wishes and Plans. Account/Space deletion and owner-only cleanup include the new
tables. Personal machine-readable export includes only the caller's selection;
shared export includes only the authorized round/intersection. These temporary
decision snapshots are export-only and never reactivated as consent on import.

## Reuse review

This is application-specific selection/authorization logic, not new commodity
infrastructure. Reuse SQLAlchemy/PostgreSQL transactions and constraints,
ProtectedPayloadJSON, existing privacy/membership guards, FastAPI/Pydantic and
If-Match, generated TypeScript clients, React Router task origins, TanStack Query,
native controls, PlanScheduleFields and the canonical Wish-to-Plan transition.
Reuse the existing frozen OpenAPI generator instead of introducing a manual
transport. No third-party service, dependency, model, polling platform, queue,
calendar, image processing or infrastructure configuration is added. A bounded
visible-task refetch/manual refresh uses existing query primitives; it is not
presence tracking. New provider/license/cost review is therefore not applicable.

## Business/freemium impact reviewed

The approved addition extends the Free/Core Wish & Plan lifecycle. Update the
authoritative feature matrix to record this new capability. Both partners share
the feature with no entitlement, count paywall, resource upsell or downgrade
change. Two-to-five candidates and one current round express a short decision,
not a tier quota. Ordinary Wishes/Plans remain unlimited. Cloud and Self-Hosted
share behavior; small database rows use existing operations and encryption.
Essential export, deletion, privacy and accessibility remain non-paywallable.

## Cross-cutting review

Security/privacy: tenant and owner SQL predicates, current Membership binding,
no partner arrays, ProtectedPayload, no sensitive logging, cross-tenant/malformed
ID negatives, source withdrawal and deletion lifecycle. Concurrency: serialized
replacement/publication, round+owner tokens, exact candidate subsets, stale
consent rejection and existing idempotent Plan conversion. Resilience: pending
locks, retained drafts/errors, no offline write/outbox claim, account/Space late
completion rejection. i18n/accessibility: all copy through localization, native
labels, focus/Back, 44 px targets, 200%/320 px, contrast and reduced motion.
Performance: at most five candidate sources/two selections per current round,
bounded projections and no per-card requests. Contracts: additive migration,
OpenAPI and generated client; export-only snapshot cannot restore consent.
Operations: no new service/configuration, same supported backup/restore and
Cloud/Self-Hosted semantics. Test DB/API boundaries, encryption registry,
ownership, source/lifecycle races and full product journeys before PR review.

## Delivery and evidence

Delivered the focused `/plan/choose` task and its invitations in both Planning
segments. Canonical Wishes, Plan imagery/galleries and the existing hub remain
available. Native disclosure keeps reset/closure utilities below the main result.
No new dependency, provider, entitlement, configuration or native capability.

[Runtime images, behavioral coverage and provenance](references/shared-wish-selection/evidence/README.md)
record the final source revision. This includes the complete save/result/return
journey, 360/390/430/Expanded Light/Dark and 320 px at 200% text with reduced
motion. Preflight and runtime evidence remain separate.

Backend acceptance includes HTTP/real PostgreSQL tenant isolation, protected
payloads, partner-list withholding, source changes, exports, membership cleanup,
parallel writes and closed/recreated-round conflicts. Personal and round writes
both bind to round identity, so resetting numeric versions cannot revive stale
consent. The client rejects late account responses and retains failed drafts. Background
source edits, deletion and conversion retain personal/round-setup drafts while offering an
explicit reload with draft confirmation.

Local validation uses Node 22.23.2 and supported Python 3.13.5; CI's pinned
Python 3.14.8 remains authoritative. The additive migration follows the now-merged
0093 recap migration. Fresh installation, Alembic schema check and an empty
0094 -> 0093 -> 0094 round trip pass. Downgrade deliberately refuses active
rounds; closing/exporting temporary state preserves original Wishes and Plans.

The complete CI sweep exposed a missing entry in the cross-cutting endpoint
matrix. All four operations now receive the same anonymous/foreign/malformed
Space and missing If-Match checks as existing operations; all 20 selected cases
pass with encryption disabled and required. An existing Timeline contrast check
also raced its month-heading reveal. It now observes completed opacity before
Axe while preserving the motion assertions and all accessibility rules; the four
Timeline browser cases pass. These changes affect tests, not runtime behavior.

Business/freemium and cross-cutting decisions above were rechecked after delivery
and remain unchanged. The authoritative matrix is version 1.9. CI results and
exact test totals are recorded in the pull request; no deployment or physical
native-device acceptance is claimed.

## Extension: curated date ideas as typed candidates (#465 within #1535)

Product Owner instruction 2026-11-15: extend this selection with the Pro date
inspiration catalog (#1892) instead of building a separate Blind-Match module.
The preflight, baseline `main` `146708719`, Mobile Interaction Contract and the
kept/dropped #465 requirements are recorded on
[#465](https://github.com/baerenmarke90/eimir/issues/465#issuecomment-6886946014).

![Compact reference](references/wish-selection-date-ideas/compact-reference.png)

### Why extend instead of a second module

#465 asked for private choices, a server-side intersection, no side-channel
leaks and conversion into existing Wishes/Plans. This selection already
implements exactly that lifecycle. A second deck/match domain would duplicate
privacy, concurrency, notification and export logic and give couples two
competing ways to answer the same question. The extension keeps one entry,
one round per Space, two to five candidates and the existing reveal rules.

### Typed candidates

- `wish_selection_candidates.source_type` is `WISH` or `DATE_IDEA`. A Wish
  candidate keeps its Same-Space Wish reference and version; a date-idea
  candidate stores the persistent catalog ID (`eimir-date-001` …) and a content
  revision: the SHA-256 of that idea's full catalog entry (both locales and
  structured facts). A database check enforces exactly one reference per type.
- The additive migration (`0137`) turns every existing row into a `WISH`
  candidate; stored rounds, selections and API clients keep working. The key
  moves to the already unique `(round_id, position)`.
- A removed idea or a changed revision makes the round `NEEDS_IDEAS`: publishing
  is rejected and the couple reviews the round. Catalog edits never redirect a
  round to other content; unrelated catalog edits keep the revision stable.
- Date ideas are not saved as Wishes before the vote. The API keeps
  `candidates` Wish-only and adds `dateIdeaCandidates` (`dateIdeaId`, `current`,
  `idea` content or null), `commonDateIdeaIds`, `own.favoriteDateIdeaIds` and
  optional request lists. An own update that omits `favoriteDateIdeaIds` while
  the round has ideas is rejected, so an outdated client cannot publish about
  ideas it never showed.

### Privacy semantics (unchanged)

Idea favorites extend the existing OWNER_ONLY, ProtectedPayload-encrypted
selection; there is no new table or plaintext decision. Only the caller's own
list and the intersection after both current members publish are returned.
Events and notifications stay the existing generic `WISH_SELECTION_SHARED` /
`WISH_SELECTION_READY` messages without titles; no per-choice notification
exists. Exports contain catalog IDs only, never catalog copy; the shared export
has no personal lists. Membership changes still purge the whole round.

### Free and Pro

Wish-only rounds, private favorites, matches and Wish-to-Plan stay Free/Core.
Adding, choosing and showing date ideas requires the Space capability
`planning.date_inspiration` (one grant for both partners), checked server-side
on every write and before any catalog content is returned. Free Spaces see the
source switch with the calm locked hint and the shared paywall (`dateIdeas`).

### From a common idea to a Wish or Plan

A common idea is only a decision. plan now (`dateIdeas.card.plan`) opens the existing Plan
composer prefilled with the idea's `planTitle` and description; save as Wish
(`dateIdeas.card.save`) opens the Wish composer with `wishTitle`. Both save through the
ordinary idempotent endpoints and return to the selection through the task
origin. A Wish saved from an idea in this session plans through the canonical
Wish-to-Plan conversion. later (`wishSelection.later`) leaves the round unchanged. A partner can
still continue alone with their own favorites; that path is labeled as a
proposal, never as a mutual match.

### Downgrade, membership and account changes

Without the capability a round that contains ideas is `PAUSED`: Wish titles and
own data remain, catalog content and the result are withheld, choice writes are
rejected (`PREMIUM_ENTITLEMENT_REQUIRED`), and the couple can deliberately start
a Wish-only replacement or close the round. Wishes and Plans are never touched.
Restoring Pro resumes the same round if its ideas are still current. Account or
Space changes remount the task and the catalog cache is scoped and cleared as in
discovery.

### #465 scope decisions

Kept and delivered: owner-only choices, server-side intersection, no
side-channel counts or notifications, idempotent result, accessible
button/checkbox interaction, conversion through existing Wish/Plan flows,
isolation and export semantics. Deliberately not built: an endless swipe deck,
LIKE/PASS/SKIP history and re-surfacing, separate match objects and
celebration effects. Left for a later Product Owner decision: an opt-in
sensitive/intimacy category and further card sources (places, M8 providers).
A swipe gesture is not part of this slice; native checkboxes and the add
toggle remain the complete interaction.

### Reuse, cross-cutting and evidence

Reused: the selection service, tokens and reveal rules, ProtectedPayloadJSON,
`ensure`/`has_capability`, the bundled catalog and image endpoint, the catalog
query, filters, facts and image components (extracted from discovery and shared
by both screens), StatusScope, AddAction, ProMark, the shared paywall and the
existing composers. No dependency, provider, configuration or native change.
Cross-cutting: additive migration with guarded downgrade, OpenAPI/generated
client, bounded rows (at most five candidates), i18n in German and English,
accessibility via native controls, `aria-pressed` toggles and labeled remove
buttons, and reduced motion through existing tokens.
[Runtime evidence](references/wish-selection-date-ideas/evidence/README.md)
covers setup, private choice, result and pause at 320 (200 % text)/360/390/430/
Expanded in Light and Dark.

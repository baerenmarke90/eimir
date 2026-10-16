# Asymmetric participation — current-flow audit

Owning issue: [#502](https://github.com/baerenmarke90/eimir/issues/502).
Reviewed on 2026-10-12 against `main@170a89faadef184c124472f544680262e159d207`.
This is a bounded source/test audit and a foundation update. It changes no UI,
API, authorization, entitlement, telemetry or existing game/reveal decision.

## Authority and review boundary

[Product Reference v1](product-reference-v1.md), the
[partner-app standard](../../PARTNER-APP-EXPERIENCE-STANDARD.md) and
[UX Patterns section 3.5](../../UX-PATTERNS.md#35-participation-without-equal-contribution)
govern participation. Privacy and author/collaborative write contracts remain
authoritative. Web is the product reference; Android renders the same UI through
Capacitor. Native widgets, haptics and device behavior are outside this audit.

Reviewed production models/services, the corresponding Web controls, localized
copy, OpenAPI and existing regression/evidence records. Code and automated
fixtures establish the listed mechanics. They do not establish how real couples
experience pressure, final Product Acceptance or completion of #502/#946.

## Current flow inventory

| Flow | One person's useful outcome | Required partner participation and reason | Result / sources |
| --- | --- | --- | --- |
| Wish → Plan → completion | Either active member can create, schedule and complete the shared intention. Memory/Milestone continuation can be declined. | No matching contribution or partner confirmation. Collaborative writes retain version protection and creator attribution. | Already supports asymmetric use: [Plan model](../../../backend/src/eimir/plans/models.py), [lifecycle service](../../../backend/src/eimir/plans/service.py), [Wish service](../../../backend/src/eimir/wishes/service.py), [Web completion evidence](evidence/508/plan-completion/README.md). |
| Shared Collections | One member can prepare all items; the other can check an item with a single explicit action or edit later. | No ownership quota or equal item count. Both share write capability; item/order conflicts still require recovery. | Existing low-effort participation: [model](../../../backend/src/eimir/collections/models.py), [item update](../../../backend/src/eimir/collections/service.py), [Web page](../../../web/src/components/CollectionProductPage.tsx). |
| Memory, shared HeartMoment, Milestone | The author can publish independently; the partner can read without creating a matching item. Comments are optional. | Authored text remains author-only for editing. Shared readability does not grant private-content access or unrestricted writes. | No reciprocal publishing gate: [shared-write contract](../../../backend/src/eimir/authorization/privacy.py), [CommentsPanel](../../../web/src/components/CommentsPanel.tsx). The current comment action requires text; it is not a one-tap reaction. |
| Thinking-of-you / extended gestures | One deliberate gesture can be sent without writing or waiting for a reciprocal send. | An active recipient, enabled module and server pacing are required. Extended gestures additionally require the existing Pro capability. These conditions do not measure equal effort. | Reuse the existing [sender](../../../web/src/components/PartnerQuickActions.tsx), [service](../../../backend/src/eimir/engagement/thinking.py) and [actual Web evidence](evidence/508/partner-gesture/README.md). There is no response obligation or delivery claim before the server confirms. |
| Daily Vibe / Energy | Either dimension can be set independently; Vibe context text is optional. The person's own check-in is useful without a partner response. | Mutual Reveal requires the caller's own value in the same dimension before the partner projection becomes visible. It never reveals whether the partner participated while hidden. | Intentional privacy exception under #493: [service](../../../backend/src/eimir/daily_checkins/service.py), [Vibe copy](../../../web/src/i18n/locales/dailyVibe.ts), [Energy copy](../../../web/src/i18n/locales/dailyEnergy.ts). No skip-to-unlock, synthetic value or cross-dimension unlock. |
| Shared achievements | A qualifying Plan or final checklist completion can be performed by one member. | Only the actual domain transition and enabled module qualify; two authors or equal work are not required. | Team recognition, without individual contribution targets: [Plan API](../../../backend/src/eimir/api/v1/plans.py), [Collection API](../../../backend/src/eimir/api/v1/collections.py). |
| Today / Activity / Notifications | Existing history and planning remain meaningful when only one person contributes. A recipient may open a notification later or leave it unread. | No reciprocal action is required to continue using other product areas. Ordinary unread state describes recipient state, not relationship performance. | [Today composition](../../../web/src/components/TodayPage.tsx), [notification policy](../../../backend/src/eimir/engagement/notification_policy.py). Quiet Hours and digest preferences govern attention; this audit adds no inactivity reminder. |
| Our Moments / Wish Detective | A voluntary local two-person game has its own turns and round result. Shared source content is authorized before use. | Two stable participants serve the game rules. Wish Detective additionally needs at least two eligible Wishes by each partner and selects equal alternating rounds. | Deliberate game mechanics under [#866](https://github.com/baerenmarke90/eimir/issues/866), with a participation tradeoff to review below: [Our Moments session](../../../web/src/client/ourMomentsSession.ts), [Wish Detective selector](../../../web/src/client/wishDetectiveSession.ts). Game round points do not reward uploads or app usage. |

Account and Membership models contain no driver/passenger classification or
contribution target. The only Membership role is `PARTNER`; configuration-manager
authority is a separate management permission, not a participation type:
[Account](../../../backend/src/eimir/identity/models.py),
[Membership/Space](../../../backend/src/eimir/relationship/models.py).
The reviewed product surfaces expose no individual contribution ranking or
relationship score. This is a scoped finding, not an assertion about future code.

## Intentional and unresolved boundaries

### Preserve current privacy rules

Daily Check-in's hidden projection is a domain privacy rule, not a demand that
both people write equally much. A bounded own selection satisfies that
dimension; additional text remains optional. A person who does not check in can
continue planning, reading authorized history and sending an admitted gesture.
Do not weaken Mutual Reveal or disclose hidden participation to reduce friction.

Questions, Trust Vault and Slow Burn have no delivered domain in this baseline.
Their future bilateral-answer/consent rules remain owned by the specification
and #444/#461/#488. The participation principle gives no permission to unlock
another person's answer or sensitive content through a skip or inferred consent.

### Content reaction remains separate work

Shared checklist completion already provides a concrete low-effort planning
action. Thinking-of-you supplies a deliberate emotional gesture. Neither makes
the existing text comment a target-specific one-tap response to a Memory or
HeartMoment. That part of #502 remains open.

Before implementing it, identify a real human task and decide whether existing
comments/gestures suffice. If a new reaction is needed, resolve target types,
ownership, undo, notification pacing, privacy transitions, deletion and export;
publish the repository-aware generated reference and Mobile Interaction
Contract before UI code. Do not create separate per-feature like stores or
automatically send a partner ping when reading content.

### Wish Detective needs an explicit tradeoff review

`selectWishDetectiveRounds` returns no round when either participant has fewer
than two eligible authored Wishes, even if the Space has many Wishes from the
other person. This is an equal-source participation prerequisite in one optional
game. The existing #866 decision deliberately specifies giver-attributable
Wishes and balanced rounds, so this audit preserves it.

The follow-up under #502/#864/#866 should evaluate the sparse explanation and
whether a smaller or asymmetric round set can remain a fair, recognizable game.
Do not require the less active person to manufacture Wishes, reuse private
GiftIdeas, change authorship, invent source content or relax eligibility. A new
round rule needs an owning product decision and its own preflight/evidence.

Local match/guess points in these existing games measure the selected round.
They must stay within the game session and must not become permanent contribution
rankings, cross-game scores or relationship-health metrics.

## Verification — 2026-10-12

- 14 existing PostgreSQL cases passed for partner-editable Plan/Collection,
  partner Wish conversion, one-member completion, authoritative achievement,
  Mutual Reveal including optional notes, immediate/no-check-in projections,
  idempotent gesture admission and sender/Space-isolated cooldown.
- 133 existing Web component cases passed across PlanProductPage,
  PartnerQuickActions, TodayPage, DailyEnergyCheckIn and DailyVibeCheckIn.
- 14 existing local-game session cases passed, including balanced Wish source
  selection, alternating turns, pass/progress and session disposal.
- The existing Plan/gesture evidence above supplies historical Compact,
  Expanded, theme, keyboard/reflow and reduced-motion journeys. It is linked
  with its original limits; no new screenshot or native acceptance is claimed.

No new test duplicates those existing contracts. Tests used isolated PostgreSQL
and production components with existing synthetic fixtures. Runtime files and
assertions are unchanged. Documentation links, English-language checks and
`git diff --check` are required for this foundation slice.

## Business, reuse and remaining acceptance

**No business/freemium impact:** qualitative participation UX remains Free/Core;
privacy/security/accessibility remain non-paywallable. Existing Free
Thinking-of-you, Pro extended gestures, Pro Games and Mixed Daily Check-in
classification remain as recorded in the
[feature matrix](../../FREEMIUM-FEATURE-MATRIX.md). No entitlement, Space ownership,
Cloud/Self-Hosted, cost, quota, downgrade, retention or portability change.

Reuse review: existing collaborative authorization, versioned lifecycle,
checklist action, partner sender and reveal-aware projection already provide the
reviewed mechanics. No dependency, provider or custom infrastructure is added.
Cross-cutting result: preserve those privacy/concurrency contracts, localized
copy and accessible controls; create no activity profiling or new data surface.

This slice completes the current-Web inventory and adds the participation review
to the existing preflight/acceptance contract. The target-specific emotional
reaction, game tradeoff review and real-couple pressure/return acceptance remain
open in #502. Final product acceptance remains #946.

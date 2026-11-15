# Shared eimir. Pro paywall: contract

Owning issue: [#1892](https://github.com/baerenmarke90/eimir/issues/1892)
(Product Owner extension of 2026-11-14). One reusable paywall serves every Pro
entry point in the app. It extends the existing pieces — `ProMark`,
`ProInformationPanel`, `ProPresentationProvider`, `spaceEntitlement`, the
central Space capabilities and React Router history — instead of adding a
parallel paywall or entitlement architecture.

## Route and contexts

`/more/pro?context=<context>` (`PRO_PAYWALL_ROUTE`, `proPaywallPath()`). The
context selects copy and benefits only; it never grants or checks access.

| Context | Opened from | Title key |
| --- | --- | --- |
| `dateIdeas` | Date inspiration Free hint | `proPaywall.contexts.dateIdeas.title` |
| `recaps` | Recap library gate, relationship passport | `proPaywall.contexts.recaps.title` |
| `memoryMap` | Memory map Pro state | `proPaywall.contexts.memoryMap.title` |
| `photoSources` | Photo source settings (Pro required) | `proPaywall.contexts.photoSources.title` |
| `games` | Games area for Free Spaces | `proPaywall.contexts.games.title` |
| `general` | Account Pro panel, Wir designs, app icons, video, once messages, partner quick actions, partner location | `proPaywall.contexts.general.title` |

Each context shows exactly three benefits, all of them features that exist in
this repository today. Unknown context values fall back to `general`. The
account settings panel (`PRO_INFORMATION_ROUTE`) stays as the product
information section and links to the general paywall.

## Composition (Compact first)

1. Subtle Back in the shell slot.
2. Emotional hero: a composed brand surface (entry hero gradient, two meeting
   circles, context icon); no stock imagery; decorative only.
3. Context title (Literata) and a short description.
4. Three concrete benefits with icons.
5. Plan choice as native radio inputs presented as cards; yearly is preselected
   and shows the rounded saving, monthly is one tap away.
6. Purchase action only when a real billing channel exists.
7. "One subscription. For both of you." (`proPaywall.forBoth`).
8. Transparent terms: renewal, cancellation (content stays intact) and privacy
   (no relationship content goes to the payment provider) with a link to the
   privacy policy; plus "eimir. Free stays free forever".

No countdowns, repeated modals, pre-checked add-ons or confirm-shaming. The
paywall opens only from a deliberate user action (a link or button); nothing
navigates to it automatically. Expanded keeps the same single column within
`--reading-max`. Reduced motion removes the hero animation and plan
transitions without hiding information.

## Prices and billing channel

`web/src/client/proBilling.ts` holds the Product Owner target prices
(EUR 7.99 monthly, EUR 59.99 yearly per Space, about 37% saving; superseding
#876) as `source: 'reference'`. A connected provider must supply its own
offers (`source: 'provider'`), which then replace the reference values; the
client never invents a chargeable price.

`currentBillingChannel()` returns `unavailable` for both runtime platforms
because no production adapter exists yet (Web would use Stripe, the native
Android app Google Play Billing; a browser checkout must never appear in the
native app). In that state the paywall shows the product information and the
note `proPaywall.unavailableTitle`, and offers **no** purchase or restore
button, no simulated confirmation and no local unlock.

## Entitlement status

The paywall reads the session's single Space entitlement query
(`useSessionSpaceEntitlement`, `staleTime: Infinity`); opening it or switching
tabs never triggers another read. The read is renewed at start, on the
existing resume contract and after a concrete change (a server denial
withdraws a capability; a confirmed purchase invalidates the read once).

- **Pro active** (`tier = PREMIUM`, also when the partner purchased): no plan
  choice; the page confirms Pro for both and continues back.
- **Free**: plan choice and the channel state above.
- **Unknown** (read failed or pending): plan information stays visible, a
  neutral status note with retry is shown, nothing claims active or inactive.

## Purchase outcomes and return (for the future adapter)

`ProPurchaseOutcome` is the complete state set a provider flow must map to:

| Outcome | Presentation | Navigation |
| --- | --- | --- |
| `confirmed` | Welcome, status message | Renew entitlement once, return to the originating feature |
| `restored` | Restored, status message | Same as `confirmed` |
| `partnerActive` | Already active for the shared Space | Same as `confirmed` |
| `cancelled` | Nothing charged (alert) | Stay; Back returns to the origin |
| `pending` | Payment still being confirmed (alert) | Stay; access follows the backend grant |
| `failed` | Payment failed, nothing unlocked (alert) | Stay |
| `network` | No connection, try again (alert) | Stay |
| `expired` | Access expired, content intact (alert) | Stay |

Return uses browser history when the paywall was opened inside the app and
otherwise the context's home (`/plan#wishes`, recaps, map, account settings,
games, More). The result message receives focus for screen readers.

## Privacy, downgrade and Free

Only the selected plan identifier would reach a provider adapter; no Space
content, names or relationship data. Downgrade never deletes or hides content;
Wishes and Plans (including those created from date ideas) stay Free/Core and
never show a paywall. Security, privacy, export and accessibility are never
presented as Pro benefits.

## Visual reference and evidence

The paywall was specified by the Product Owner's nine-point layout in the
#1892 extension. Its Compact reference was composed from the running
implementation rather than generated before implementation (no image model in
this session) — a documented deviation for Product Owner review. Runtime
captures: [evidence](references/date-inspiration/evidence/README.md).

## Follow-up (separate task)

Connecting Stripe (Web) and Google Play Billing (Android) adapters, the
backend receipt/webhook reconciliation into Space grants, restore flows and
store price localization. Until then Pro is granted through the existing
admin and Self-Hosted license paths.

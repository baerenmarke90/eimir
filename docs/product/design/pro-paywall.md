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
| `calendar` | Calendar sync settings | `proPaywall.contexts.calendar.title` |
| `games` | Games area for Free Spaces | `proPaywall.contexts.games.title` |
| `general` | Account Pro row, Wir designs, app icons, video, once messages, partner quick actions, partner location | `proPaywall.contexts.general.title` |

Each feature-specific context shows three benefits. Unknown context values
fall back to `general`, which has the complete feature overview. The Account
settings row (`PRO_INFORMATION_ROUTE`) links to the general paywall.

## Composition (Compact first)

1. Subtle Back in the shell slot.
2. Emotional hero: a composed brand surface (entry hero gradient, two meeting
   circles, context icon); no stock imagery; decorative only.
3. Context title (Literata) and a short description.
4. Three concrete benefits with icons for feature-specific contexts.
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

### Account overview

The Account entry opens the general context. Its feature overview uses the
Settings template and R5 reading hierarchy. Keep the existing Back, brand
hero, plan choice or active status, provider feedback, and terms in one column.
Replace the general benefit teaser with expandable descriptions beneath the
plan or subscription controls. Context-specific pages keep their three benefits.
Use native disclosures and the existing semantic surface and motion tokens.
Animate the hero once and reveal the text when each group opens. Reduced motion
shows the same text immediately. The overview reads no relationship content
and requires no additional API request in any billing state.

The mobile visual preflight used `main` at `1ccac04079bd67224bc403ca9b84faff0e1728de`
and reviewed `/more/settings/account#eimir-pro` and `/more/pro`, including the
existing plan controls and browser availability note. Use live store offers
and the existing reference price calculation for plan amounts and savings.
See the [generated reference and browser evidence](evidence/pro-overview/README.md).

### Commercial coverage

Google Play verification and authenticated notifications feed the same
Space-level entitlement used by the feature APIs. The general overview covers
the following implemented Pro boundaries without changing their classification.

| Capability | Protected behavior |
| --- | --- |
| `memories.map`, `relationship.passport` | Memory map, new recap composition, relationship passport and the shared story lifeline. Existing saved recaps and ordinary places remain Core. |
| `media.video_upload` | New short videos require both a grant and an enabled media processor. Existing videos remain accessible. |
| `planning.date_inspiration` | Curated catalog, catalog images and catalog participation in shared Wish selection. Ordinary Wishes and Plans remain Core. |
| `games.couple` | Premium gameplay and new Happiness/Time Travel experiences. Existing shared memories remain accessible. |
| `daily.insights`, `daily.quote` | Long-term mood and energy trends plus the daily quote. Daily mood and energy entries stay Free. |
| `presence.location`, `partner.once_messages`, `partner.quick_actions.extended` | Consensual location sharing and distance, new one-time messages, and extended partner gestures. Receiving retained messages, stopping sharing and Thinking of You remain available as specified in the feature matrix. |
| `theme.bespoke_packs` | Saving new paid Wir designs, app icons and person-colour pairs. Defaults and previously saved selections continue to work. |
| `integration.external_sync` | Photo import from configured sources and automatic calendar sync. Imported media and one-time calendar handoff remain Core. |

The catalogue omits the reserved capability identifiers for rich Chapter
presentation, occasion automation, the PDF Yearbook, video montage, five-year
question mirror, Surprise Mode, and the proposed Cloud storage allowance. They
have no implemented Premium feature gate in this revision. Google Photos,
calendar sync and video availability still depend on installation or platform
configuration. The [feature matrix](../../FREEMIUM-FEATURE-MATRIX.md) governs
downgrade behavior, including preserved data and Free actions.

## Prices and billing channel

Purchases are in-app only (Product Owner, 2026-11-15, #1525). The runtime
platform decides the channel, never the viewport width:

| Runtime | Channel (`useBillingChannel`) | Paywall |
| --- | --- | --- |
| Android app, eimir. Cloud with Play configured | Google Play (`storeBilling.ts`) | live store prices, purchase, restore, manage |
| Android app, store unreachable or offer incomplete | `unavailable`, `reason: 'store'` | note `proPaywall.storeUnavailableTitle` + retry; no purchase |
| Android app, Self-Hosted or Play not configured | `unavailable` | note `proPaywall.unavailableTitle`; no purchase |
| Browser (any operating model), iOS app before launch | `unavailable` | note `proPaywall.unavailableTitle`; no purchase |

`web/src/client/proBilling.ts` keeps the Product Owner target prices
(EUR 7.99 monthly, EUR 59.99 yearly per Space) as `source: 'reference'`
product information. When Google Play answers, its offers
(`source: 'provider'`) replace them, including the customer's currency and an
eligible free trial (`proPaywall.plans.trial.*`, shown only when Google offers
it). While the store loads, the reference prices stay visible with the status
`proPaywall.loadingOffers` and no purchase action. The client never invents a
chargeable price; there is no simulated confirmation and no local unlock.

Purchase flow: the backend binds the sponsor Account and the Space to an
opaque purchase reference (`POST /spaces/{spaceId}/billing/purchases`); the
Play sheet opens with that reference; the app hands the purchase token to the
backend (`POST .../billing/google-play/purchases`), which verifies it with
Google, records the Space grant and acknowledges the purchase. The store note
`proPaywall.storeNote` states that payment runs through Google Play and covers
the shared Space. An active Space sees `proPaywall.manage`, which opens Google
Play's own subscription management.

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

## Purchase outcomes and return

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
| `nothingToRestore` | No purchase found, nothing charged (alert) | Stay |

Google Play mapping: start conflict `BILLING_SPACE_ALREADY_PREMIUM` →
`partnerActive`; store `USER_CANCELED` → `cancelled`; pending payment →
`pending`; `ITEM_ALREADY_OWNED` → restore; store network codes → `network`;
backend unreachable after the store took the payment → `pending` (the
notification completes it); other errors → `failed`.

Return uses browser history when the paywall was opened inside the app and
otherwise the context's home (`/plan#wishes`, recaps, map, account settings,
games, More). The result message receives focus for screen readers.

## Privacy, downgrade and Free

Only the opaque purchase reference and the selected base plan reach Google Play; no Space
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

## Open points

The Play Console catalog, license testers, service account and Pub/Sub
notifications still need the verified developer account; no real purchase has
run on a device yet ([setup](../../operations/google-play-billing.md)). Apple
In-App Purchase follows at the iOS launch; Self-Hosted Pro keeps the signed
offline license path.

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

### Pro showcase (Product Owner request of 2026-11-26)

**Intent.** The Product Owner asked for an animated Pro page that presents the
newest Pro capabilities and invites a purchase. Today the general page shows a
static brand hero and hides every capability inside collapsed text
disclosures below the plan choice, so a Free couple has to tap several times
to see what Pro offers, and then only as text. The catalogue also lags behind
`main`: it names one memory world of ten, omits the Cloud storage allowance and
mentions recap films and the shared garden only in passing.

**Goals.** Make what Pro gives a couple visible within the first screen,
through motion that shows the feeling of each capability. Keep the catalogue
complete and current. Keep the purchase path unchanged.

**Non-goals.** No change to prices, plans, billing channels, purchase flow,
entitlement or tier classification. No new Pro capability. No change to how
or where the paywall is opened.

**Anti-goals (a failure even if it works).** Pressure instead of invitation:
countdowns, auto-advancing carousels, repeated modals, scarcity claims or
confirm-shaming. Showing a couple's own relationship content or photos on a
sales surface. Motion that hides information under reduced motion, distracts
from the plan choice or costs noticeable battery.

**Approaches considered.**

1. *Drawn mini scenes* (selected by the Product Owner): each scene is a small
   SVG/CSS illustration built from semantic tokens and `EimirIcon` motifs.
   It follows Light/Dark and the four app designs, works offline, adds no
   dependency and degrades to a composed still frame. It conveys the feeling
   of a capability, not its real screen. (Revised with mockup v2 below: the
   scenes reuse the `WorldArt` illustrations, the Mochi pair and five
   bundled sample photos, with fixed artwork colours.)
2. *Real feature components with sample data* (for example the real record
   crate): most authentic, but heavy. It conflicts with the existing rule that
   the overview reads no relationship content and makes no additional API
   request. Rejected.
3. *Pre-rendered video clips*: richest look, but larger bundle, no automatic
   Dark/app-design adaptation and new clips for every design change. Rejected.

**Product Owner decisions.**

- A swipeable highlight gallery with four animated scenes, in this order:
  1. **Memory worlds** (`memoryWorlds`): one stage that moves through three
     world motifs in turn: a spinning record, a jar filling with small
     tokens, and stars joining into a constellation. Copy names that there
     are ten worlds.
  2. **Recap films** (`recapFilms`): a portrait film frame with story-style
     progress segments; three abstract photo tiles (brand/shared gradients,
     no real images) pan gently one after another.
  3. **Games & garden** (`gamesGarden`): a garden bed where a seed travels
     from one side to the other, two sprouts grow and a flower opens.
  4. **Memory map & closeness** (`mapCloseness`): a stylised map where a route
     draws itself and pins drop. Two dots with a heart between them stand for
     distance sharing, and the copy also names one-time messages.
- Built as drawn mini scenes (approach 1).

**Product Owner revision of the scenes (mockup v2, accepted 2026-11-26).**
The Product Owner found the first mockup too fast, the map line wrong ("our
line is not wavy"), the film monotonous and the whole too dull to invite a
purchase, and asked for the Mochis in the scenes ("they accompany all
scenes"). The accepted v2 replaces the scene list above:

- **The Mochi pair guides every scene.** It is the pair from the Mochi memory
  world (pink and mint, with the heart), drawn as artwork.
- **Memory worlds** (about 16 s): the Mochis hop together and cuddle, and a
  heart-shaped balloon with a sample photo rises. Then a calm tour of four
  real world illustrations (`WorldArt`: record crate, photo booth, fridge door,
  constellation), each about 2.5 s with its localized world name. The mini
  Mochis sit in a corner.
- **Recap films** (15 s): five 3 s parts with story progress segments, as in
  the real recap film: (1) a cover photo with a slow zoom, a month title and
  a count of moments; (2) three photos flying in as a collage; (3) a large
  fact on the brand gradient ("3 new places discovered"); (4) a place photo
  with a pin chip; (5) a goodbye ("See you in June!") with waving Mochis.
- **Games & garden** (about 16 s): the Mochis toss seeds to each other, three
  flowers open one after another and a butterfly passes. Then a game card
  ("Who plans the next date?") appears with a matching answer.
- **Memory map & closeness** (about 16 s): three photo pins pop onto a map,
  the Mochis sit at both ends, and **one soft arc** draws between them, as the
  real map connection does (`placeMapConnection.ts`, never a wavy route). A
  glow travels along the arc and back. A distance chip ("412 km") appears with
  the heart, then a one-time message chip.
- **Sample photos.** Scenes use five fictional sample photos from the curated
  demo set (`backend/demo_assets/manifest.json`: `memory-lake`,
  `memory-picnic`, `memory-breakfast`, `memory-ravioli`, `memory-trier`;
  Pixabay, CC0 1.0, published before 2019-01-09, no attribution required).
  They are bundled as small WebP derivatives with a provenance note next to
  them. They are never a couple's own content, and the paywall still makes
  no request for them.
- **Price anchor.** Below the gallery, for a Free Space only, one line names
  the monthly equivalent of the yearly plan for both partners ("Everything
  together for EUR 5.00 a month, for both of you"). It reuses the yearly
  plan's existing monthly-equivalent calculation and follows live store
  prices; it is no discount claim and no pressure.
- **"New" marks** in the catalogue on recap films, couple games and garden,
  the ten memory worlds and the Cloud storage allowance. The mark is a
  small text tag with no date or urgency.

**Proposals by the implementer (approved with this section).**

- *Placement.* On the `general` context the gallery replaces the brand hero
  and sits between the heading and the plan choice. The page order becomes:
  Back, heading, gallery, plan choice or active status, "for both", purchase
  or channel state, outcome, updated catalogue, Free note, terms. The gallery
  also stays for an active Space (it shows what the couple has); only the
  plan controls change, as today.
- *Context pages.* `recaps`, `memoryMap` and `games` replace the two-circle
  hero with their matching scene and keep their three benefits. The scene
  is not interactive. As in the accepted mockup v2, it spans the column at
  the scene's 5:4 ratio, so it is taller than today's hero. `dateIdeas`, `photoSources`,
  `storage` and `calendar` keep today's hero.
- *Gallery behaviour.* Horizontal scroll snap. Each card is about 88 % of the
  column width so the next card peeks in. The gallery **never advances on its
  own**. Below it, a page indicator (one button per card, accessible name
  "Highlight 2 of 4" through i18n) scrolls to its card; the current card is
  marked with `aria-current`. The cards are a list. Each card holds its scene
  (decorative, `aria-hidden`), a heading and one or two lines of copy, so
  screen readers read all four in order without swiping. Keyboard focus moves
  through the indicator buttons; nothing traps focus. In Expanded the gallery
  stays in the `--reading-max` column with the same behaviour.
- *Motion.* Only the card that is mostly visible animates, and only while the
  document is visible (IntersectionObserver plus `visibilitychange`). A scene
  cycle lasts about 15–16 s (Product Owner revision above). As Ambient motion
  (Motion Contract 4.5, M4, M8), a scene runs `--motion-ambient-repeat`
  cycles and then rests at its still frame. It pauses in place when its card
  is not current or not seen and continues from there. A card that never
  played shows its still frame. The mockup restarted a scene on every
  return, which M4 does not allow. Scenes use transforms and opacity only
  (no layout animation) and pause off screen. With `prefers-reduced-motion`
  every scene shows a composed still frame that carries the same meaning,
  and indicator scrolling is instant. No haptics; the purchase success
  haptic stays as specified.
- *Catalogue update.* Same disclosure structure and groups, with refreshed
  copy: memory worlds name all ten worlds (taken from the existing
  `memoryWorlds` locale names, not retyped). Recaps say that monthly and
  yearly recaps arrive as a film. Games name the shared garden. A new
  `storage` entry names 50 GB in the eimir. Cloud. It reuses the figure and
  wording of the existing `storage` paywall context. The quota is an operator
  setting, but the client has no value for it without an extra request, and
  the `storage` context already states 50 GB. If the operator figure changes,
  both strings change together (implementer's call). The paywall cannot tell
  Cloud from Self-Hosted without an extra request, so the copy itself names
  the Cloud. Self-Hosted Spaces have no in-app purchase anyway. The group `integrations` is renamed to cover photos,
  calendar and storage.
- *Copy.* German in `proPaywall.ts` and English in `en.json`, following the
  writing guideline: the couple is addressed as "ihr/euch", there is no app
  "wir", and the Space is not named.

**Constraints that remain binding.** Everything above in this contract:
no relationship content, no extra API request, no automatic navigation,
transparent terms, "Free stays free", purchase only with a real billing
channel. Semantic tokens for the page and the cards. The scene drawings are
artwork like `WorldArt`: their colours belong to the picture and stay the same
in Light, Dark and every app design.
Smartphone-first at 320/360/390/430 px with 200 % text. Light and Dark in all
four app designs. Visibility follows the runtime platform where it matters,
never the viewport.

**Left to the builder.** Exact SVG drawings, timings within the range above,
copy wording within the guideline, and component and file names. A new
`ProShowcase` component next to `ProFeatureCatalogue` is suggested. Also
whether scene keyframes live in `ProPaywall.css` or a sibling stylesheet.

**Work record.** A new issue owns this work. It records the acceptance
criteria above, the baseline `main` SHA and the visual reference. #1892 stays
the owner of the paywall contract.

**Evidence and validation.** No image model is available, which is the same
documented deviation as above. Before any UI code, the implementer builds a
clickable Compact mockup against current `main` as the visual reference. The
mockup holds the four drawn scenes, which the real build then ports. It
covers the general page and one context page in Light and Dark and is
attached to the issue. **Work stops until the Product Owner accepts the
mockup.** Unit tests cover:

- four cards on `general`;
- the matching scene on the three context pages;
- no scene animation under reduced motion;
- no extra request;
- indicator `aria-current`.

The existing browser specs that own `/more/pro` stay green. Each changed spec
appears in `web/e2e/test-impact.json`. Screenshot evidence covers 360/390/430 px
in Light and Dark, plus reduced motion.

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
| `daily.quote` | The daily quote. Daily mood and energy entries are Free; the long-term trends (`daily.insights`) were removed and deferred (#2210). |
| `presence.location`, `partner.once_messages`, `partner.quick_actions.extended` | Consensual location sharing and distance, new one-time messages, and extended partner gestures. Receiving retained messages, stopping sharing and Thinking of You remain available as specified in the feature matrix. |
| `theme.bespoke_packs` | Saving new paid Wir designs, app icons, person-colour pairs and memory worlds. Defaults, the Free Stapel memory world and previously saved selections continue to work. |
| `integration.external_sync` | Photo import from configured sources and automatic calendar sync. Imported media and one-time calendar handoff remain Core. |

The catalogue omits the reserved capability identifiers for rich Chapter
presentation, occasion automation, the PDF Yearbook, video montage, five-year
question mirror and Surprise Mode. They have no implemented Premium feature
gate in this revision. The Cloud storage allowance (`storage.cloud_quota_50gb`,
Cloud only) is now enforced and joins the catalogue with the Pro showcase
above. Google Photos,
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

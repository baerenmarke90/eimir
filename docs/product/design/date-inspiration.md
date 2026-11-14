# Date inspiration (Pro): preflight and delivery contract

## Product decision and baseline

The Product Owner requested a mobile-first, Pro-only date inspiration under
Plan → Wünsche on 2026-11-14: curated ideas with filters, saving an idea (`dateIdeas.card.save`)
through the existing Wish workflow and planning it (`dateIdeas.card.plan`) through the existing Plan
composer. The whole discovery (catalog read, browsing, filters, adopting an
idea) is eimir. Pro. Existing Wishes and Plans stay Free/Core.

Baseline `main`: `58adc37d63b3c5edb6c7ff22d7e2e7700fa6db92`. Reviewed before the
reference and before UI code: the `/plan` hub with Pläne/Wünsche/Anlässe
segments, Wünsche scope (Offen/Geplant/Erfüllt), search, the compact
shared Wish selection entry (#1535), the floating create action, Wish detail
and canonical Wish-to-Plan conversion, the focused Plan composer
(`PlanningCreatePage`), task origins/return, `useSpaceCapability`, Pro marks and
the Daily Quote/Games discovery patterns, AddAction, StatusScope, UiState/
ProblemState, motion tokens and i18n resources. Related open issues #465
(Blind-Match), #469 (Irgendwann-Maschine) and #487 (Date-Experience-Modi) are
not implemented here; the catalog is a reusable source for them later.

## Generated visual reference

![Compact reference: current Wünsche, new entry, discovery view](references/date-inspiration/compact-reference.png)

Left: the unchanged current Wünsche segment from the real app (mocked API,
390 px, Light). Middle: the same screen with the new entry beneath
the shared Wish selection entry. Right: the focused discovery view. This session has no
image-generation model, so the reference was composed from the real running
app plus DOM composition using the existing tokens (the documented fallback
used for #1816). It is composition guidance, not a pixel lock: real components
replace the placeholder glyphs; existing segments, search, scope, the selection
entry, the floating create action and the bottom navigation are preserved.

## Mobile Interaction Contract

| Concern | Contract |
| --- | --- |
| Outcome | Find an appealing shared experience and keep it as a Wish or plan it now, without typing. |
| Relationship value | Anticipation and a low-effort "let's do this" moment; no scores, streaks or pressure. |
| Placement / template | Entry in Planen → Wünsche (Offen scope) next to "Gemeinsam auswählen"; focused subpage `/plan/ideas` (Plan Hub → Detail/Discovery). No new navigation, no dashboard area. |
| Primary Compact state | Back → title and one-sentence intent → category chips → duration/budget/setting disclosure (`dateIdeas.filters.more`) with active-filter count → result count → idea list. |
| Dominant action | Per idea: `dateIdeas.card.plan` (shared AddAction link, opens the existing composer). `dateIdeas.card.save` is a lighter save action; once saved it becomes the `dateIdeas.card.saved` link to the actual Wish. |
| Hierarchy | Category → title → emotional description → duration/budget/setting line → requirements → actions. |
| Immediate vs. disclosed | Categories immediate; duration, budget and setting behind one disclosure. Active filters are always summarized outside the collapsed area with a reset. |
| Pattern | Subpage; native buttons with `aria-pressed` single-select chips per group, AND across groups, instant client-side filtering of one catalog response. |
| Loading | Skeleton-free calm loading state (`UiState`), stable layout reserved for the list. |
| Empty / no match | `dateIdeas.empty.title` with one reset action and a hint to loosen a filter; never a blank page. |
| Error / offline | `ProblemState` with retry; offline keeps a cached list visible with the cache notice. Saving offline is refused truthfully (nothing saved). |
| Success | Save confirms in place (status message, button becomes the `dateIdeas.card.saved` link to the actual Wish). Planning opens the prefilled composer; saving opens the actual Plan detail. |
| Free | One calm value explanation with a Pro mark and a link to Pro information; no catalog request, no modal, no repeated paywall. |
| Privacy | Only the shared catalog and which open Wishes reference an idea. No click, rejection or partner-content analysis; no external transfer. |
| Large text / narrow | 320 px reflow, 200 % text, wrapping chips and actions, 44 px targets. |
| Motion | Tokenized fade/lift for list changes and save confirmation; reduced motion removes translation and keeps all state. |
| Expanded | Same order and one column in the bounded reading width (`--reading-max`), starting at the leading edge. No table, extra columns or management UI. |
| Return | Back returns to Wünsche with scope and scroll (task origin). Composer and Wish detail return to the ideas view with filters intact. |
| Browser-only controls | None. |

Why cards: each idea is an independently meaningful unit with its own actions,
which satisfies "a card must earn its boundary". The list is a discovery
collection, not a record table.

## Data, entitlement and catalog architecture

- Capability `planning.date_inspiration` (central `Capability` enum; every
  all-Pro grant includes it). Server-side gate on `GET /spaces/{id}/date-ideas`
  and `POST /spaces/{id}/date-ideas/{ideaId}/wish`. One Space grant serves both
  partners. No new check on ordinary Wish or Plan endpoints.
- Catalog: `backend/src/eimir/date_ideas/data/catalog.json`, schema version 1
  ([JSON Schema](../date-inspiration/catalog.schema.json)), validated at load and
  by `backend/scripts/date_ideas_catalog.py validate|import|schema`. Stable
  permanent idea IDs (retire with `active: false`, never drop), localized titles,
  descriptions, requirements and category labels with default-locale fallback,
  structured duration/budget/setting metadata, editorial `sortKey` order. The
  bundled file is a 14-idea **development** dataset (`edition: development`); the
  final 200-idea editorial catalog replaces it through `import` without code
  changes.
- Adoption: the Pro endpoint copies the localized title/description into a
  regular shared Wish through the canonical `create_wish_once` service
  (receipts/idempotency) and records the catalog ID in the new nullable
  `wishes.date_idea_id` column. A per-Space/idea transaction advisory lock
  serializes simultaneous saves by both partners; an open or planned Wish from
  the same idea is returned instead of a duplicate. A completed Wish frees the
  idea. Planning it prefills the ordinary composer; when the idea is already
  saved, it opens that Wish so the canonical Wish-to-Plan conversion is used.
- Downgrade: adopted Wishes and resulting Plans are ordinary content; reading,
  editing, planning, completing, exporting and deleting stay Free. Only new
  catalog reads/adoptions pause. The provenance column exports and imports with
  the Wish through the generic transfer bundle.

## Reuse review

Reused: FastAPI/Pydantic, `ensure_capability`, entitlement service, Wish service
and create receipts, Alembic, generated OpenAPI client, React Router task
origins, TanStack Query, `useSpaceCapability`, ProMark, AddAction, UiState/
ProblemState/OverviewCacheNotice, `assertOnlineWrite`, i18next and Intl
formatting. The catalog follows the existing bundled-JSON pattern of the Daily
Quote sayings. No external content provider, AI service, scraping, location
permission, dependency or infrastructure is added; the curated catalog is
editorial content, which no off-the-shelf component supplies.

## Business/freemium impact reviewed

New matrix row "Date inspiration" classified **Premium** (`planning.date_inspiration`).
Existing Wish & Plan lifecycle stays Free/Core with no entity limits; adopted
content is retained, editable and exportable after expiry; Self-Hosted and Cloud
behave identically (bundled catalog, no managed cost beyond a small read).

## Cross-cutting review

- Security: membership before capability (404 for foreign Spaces), 403 with
  `PREMIUM_ENTITLEMENT_REQUIRED` for Free members, strict request bodies, catalog
  IDs validated against the catalog.
- Privacy: Wish text stays in the protected payload; only the public catalog ID
  is plaintext provenance. No behavioral profile, no logging of choices.
- i18n: all UI copy in de/en resources; catalog content localized with fallback;
  `Intl` for currency and duration.
- Accessibility: native buttons and links, `aria-pressed`, status announcements
  for result counts and saves, headings per idea, focus restoration on return.
- Concurrency: advisory lock plus receipts; replays return 200 with the same Wish.
- Resilience/offline: cached list, explicit offline refusal for saves.
- Performance: one catalog request per locale and session (client filters
  locally); bounded catalog (≤ 2 000 ideas); no per-card requests.
- Contracts/migration: additive OpenAPI, generated client, additive nullable
  column (0133) with reversible downgrade.
- Operations: catalog ships with the release; no configuration.

## Delivery and evidence

Implemented in the pull request for #1892: backend catalog, capability and
adoption endpoint; the Web entry, discovery page and composer prefill; the
matrix row (version 1.18). [Runtime evidence](references/date-inspiration/evidence/README.md)
covers Compact 320 (200 % text)/360/390/430, Expanded, Light/Dark, Free and
saved states. No native wrapper change; no Product Owner acceptance is implied.

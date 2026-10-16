**Reference status: HISTORICAL.** This #340 audit records its implementation baseline. Its desktop layouts, field order, and dominant-content prescriptions are not current design authority. [Product Reference v1](../product/design/product-reference-v1.md) and the current [Screen Templates](../SCREEN-TEMPLATES.md) govern new work; compatible accessibility, domain, privacy, and API constraints remain binding.

# Web Desktop UX Audit and Layout Decisions

- **Status:** applied to the Web client
- **Owning issue:** #340
- **Binding sources:** `docs/DESIGN-PRINCIPLES.md`, `docs/SCREEN-TEMPLATES.md`,
  `docs/DESIGN-TOKEN-POLICY.md`, `docs/ACCESSIBILITY-QA-MATRIX.md`,
  `docs/INFORMATION-ARCHITECTURE.md`

This document records the desktop UX review of the Web client, the layout
decision taken per screen, and the reusable primitives introduced so that the
decisions do not have to be repeated screen by screen.

It covers presentation and interaction structure only. Domain semantics,
authorization, privacy classification, and API behavior are unchanged.

## 1. Finding

The client was responsive but not composed for a wide viewport.

The root cause was a single rule: every screen rendered inside `.page`, which
was bounded at the **reading** width of 720 px. `docs/SCREEN-TEMPLATES.md`
section 1 bounds *primary content* at 1200 px and limits *reading text* to
720 px; the client applied the reading limit to whole screens. At 1440 px, a
screen used a 720 px column inside a 1200 px main region and left roughly
480 px unused on every page.

Everything the issue describes followed from that rule:

- Screens were a single vertical stack because no screen had room for a second
  content zone, even where one already existed in the markup. The planning
  overview already declared `repeat(auto-fit, minmax(22rem, 1fr))`; at 720 px
  with a 24 px gap the second column missed by 8 px and never appeared.
- Page headers used the mobile hero proportion. `h1` scaled to 48 px against a
  documented Web H1 of 36 px, so orientation consumed the top third of the
  viewport before any content.
- Creation forms preceded the content they produce (`Menschen`,
  `Wichtige Termine`), because a single column has no other place to put them.
- Density was inconsistent: entry lists stacked title, timestamp and action as
  three rows regardless of available width.

Defects found during the review and fixed with it:

- `--color-surface-muted`, `--color-accent` and `--color-text-primary` were
  consumed in six places but never defined, so unread badges, the private-area
  active tab, and unread notification borders rendered without their intended
  treatment.
- `--space-7` was consumed in a `clamp()` in the planning stylesheet and never
  defined, which voided the whole padding declaration.
- Three page stylesheets each overrode the global `.mobile-bottom-nav` column
  count (3, 4 and 8 columns). The effective compact navigation therefore
  depended on CSS import order.
- `states.loading.title` was missing from the locale, so the overview,
  activity and notification screens rendered the raw key while loading.
- The generic field-label rule outranked `.choice-row`, so relationship and
  visibility checkboxes rendered as stacked block labels with the checkbox
  detached from its text.
- Native `select` had no shared styling and rendered at browser default size
  next to 48 px inputs on every screen that filters or classifies.

## 2. Reusable layout primitives

Defined once in `web/src/layout.css` and consumed by name. No screen defines
its own desktop width or column logic.

| Primitive | Purpose |
|---|---|
| `.page` | Screen canvas. Fills the bounded main region. |
| `.page-reading` | Reading/editing column at `--reading-max`. |
| `.layout-split` + `.layout-main` + `.layout-rail` | Two content zones from 1100 px; stacked in document order below. |
| `.layout-split-lead-rail` | Places a leading context zone in the trailing column without reordering the document. |
| `.layout-rail-sticky` | Keeps a context zone visible while the content column scrolls. |
| `.layout-columns` (+ `-dense`, `-wide`) | Overview grid; column count derives from `--layout-column-min`. |
| `.layout-span-all` | A section that outranks its peers in an overview grid. |
| `.layout-panel` (+ `-quiet`) | The shared section surface. |
| `.layout-section-head` + `.layout-section-action` | Section title, orientation text and its single action. |
| `.page-heading` | Page title and the screen's dominant action on one band. |
| `.layout-metrics` / `.layout-metric` | Compact contextual figures. |
| `.detail-meta-list` | Author, dates and visibility of a single entry. |
| `.rail-heading` / `.rail-note` / `.layout-action-list` | Context-zone contents. |

The two-zone breakpoint is 1100 px, not the 840 px shell breakpoint: between
840 px and 1100 px the sidebar already claims 15 rem, and a second content zone
would compress both below a usable measure.

`.m4-list-rows` uses a **container query**, not a viewport query. The same
entry list is therefore dense in a content column and stacked in a context
rail, without the calling screen choosing a variant.

## 3. Screen inventory

For each screen: primary intent, what is visually dominant, and the desktop
composition decision.

### Story (`/story`)

- **Intent:** read the shared timeline.
- **Dominant:** the timeline.
- **Was:** 720 px stack. Three creation buttons competed inside the page
  header; a four-column filter row sat above the timeline.
- **Now:** `layout-split-lead-rail`. Content column holds the timeline. Context
  rail holds *Neu festhalten* (Erinnerung as the primary action, Herzmoment and
  Meilenstein secondary) and the filter panel with stacked fields. The rail
  leads in the document, so the compact stack keeps today's order
  (actions → filters → timeline) and focus order matches it.

### Planning (`/planning`)

- **Intent:** see all shared planning material and add to it.
- **Dominant:** the five peer sections (Wünsche, Pläne, Orte, Kapitel, Listen).
- **Was:** five sections in one 720 px column; roughly five viewport heights.
- **Now:** `layout-columns` overview grid; three columns at 1440 px, two at
  ~1000 px, one below. Each section is a `layout-panel` with a
  `layout-section-head` and its own progressive-disclosure create form.

### Overview / Dashboard (`/dashboard`)

- **Intent:** what matters in the shared space right now.
- **Dominant:** recent shared entries.
- **Was:** a tall, mostly empty relationship card, then a two-column grid
  squeezed into 720 px.
- **Now:** the relationship band spans the full width and reads as one line
  (label and since-date left, day count right) with a mint accent for shared
  state; below it a `layout-split` places the recent-entries section in the
  content column, and the upcoming-dates and retrospective sections in the
  context rail. The band states its empty case explicitly instead of rendering
  an empty box.

### Search (`/search`)

- **Intent:** find one entry.
- **Dominant:** the query field, then results.
- **Was:** query and type fields wrapped over two rows with the submit button
  on a third; results in a single 720 px column.
- **Now:** one toolbar row — query grows, type is fixed width, submit trails.
  Results are a `layout-columns-dense` grid under an explicit results heading.

### Activity (`/activity`) and Notifications (`/notifications`)

- **Intent:** scan what happened, chronologically.
- **Dominant:** the log.
- **Was:** each entry stacked title, timestamp and action as three rows.
- **Now:** `m4-list-rows` renders event, timestamp and action on one row once
  the list is wide enough. Notifications keep the unread band above the log as
  a quiet panel with the bulk action.

### People (`/people`)

- **Intent:** see and maintain the people who matter to the couple.
- **Dominant:** the list of people.
- **Was:** the creation form was the first thing on the page; the list and
  important dates were below it.
- **Now:** `layout-split-lead-rail`. Content column holds the people list and
  the *Wichtige Termine* section; the context rail holds the add/edit form.
  The important-dates form became a disclosure so the dates themselves lead
  their section, and it no longer nests a card inside a card.

### Profile (`/profile`)

- **Intent:** maintain how the relationship is displayed, plus preferences and
  private partner notes.
- **Dominant:** the preference collections.
- **Was:** six sections in one column.
- **Now:** `layout-split-lead-rail`. The context rail holds the account
  section and the relationship-display settings; the content column holds the
  preference managers, partner profile and private partner notes.

### Private area (`/private/notes`, `/private/gift-ideas`, `/private/collections`)

- **Intent:** work with owner-only entries.
- **Dominant:** the entries.
- **Was:** entry cards stacked inside an outer card (nested surfaces) in a
  720 px column; the active tab had no visible state because its token was
  undefined.
- **Now:** `layout-columns-dense` overview grid without the outer surface, and
  the active tab uses the brand surface with text weight, not colour alone.
  The privacy band above the tabs already states the area, so the page headings
  no longer repeat the eyebrow.

### Entry detail (Erinnerung, Herzmoment, Meilenstein)

- **Intent:** read one entry and act on it.
- **Dominant:** the body, media and comments.
- **Was:** a metadata grid of boxes above the body, in a 720 px column.
- **Now:** `layout-split-lead-rail`. Context rail holds `detail-meta-list`
  (author, date, created, visibility) and stays visible while the entry
  scrolls; the content column holds body, media and comments. Body text keeps
  the 720 px reading measure inside the wider column.

### Entry editors and creation (`/memory/new`, `…/edit`, heart moment, milestone)

- **Intent:** enter or correct one entry.
- **Decision:** `page-reading`. A single-intent form does not benefit from a
  second zone, and a 1200 px form is harder to complete than a 720 px one.
  This is a deliberate exception to the wide default, not an oversight.

### Planning detail (Wunsch, Plan, Ort, Kapitel, Liste)

- **Decision:** unchanged composition, now wide. These screens already used
  `planning-detail-grid` with `auto-fit minmax(24rem, 1fr)`; they gain their
  second column from the corrected page width without further change.

### Sign-in, invitation, recovery, space selection

- **Decision:** unchanged. These are pre-shell entry surfaces with their own
  hero/panel composition, which already reads as a designed desktop screen.

### App shell

- **Was:** nine equal-weight sidebar rows including *Neue Erinnerung* as a
  navigation destination; active state signalled by colour only.
- **Now:** creating is a primary action at the top of the sidebar; the nine
  destinations are grouped as *Gemeinsam*, *Entdecken*, *Ihr zwei*. The active
  destination carries a brand marker bar in addition to colour. The compact
  bottom navigation is unchanged in content and keeps every destination in one
  horizontally scrollable row with 44 px targets.

## 4. Visual treatment

The palette, radii and spacing scale of `docs/DESIGN-PRINCIPLES.md` are
unchanged. The treatment became less sterile through structure, not decoration:

- typography moved to the documented Web scale (H1 36/44, H2 28/36) instead of
  a mobile hero scale stretched to 48 px;
- the page canvas carries a fixed two-point ambient wash (brand and shared
  tints) instead of a single corner glow;
- panels use a dedicated `--color-surface-panel` so a panel is distinguishable
  from the page without adding a third depth level;
- the relationship band on the overview uses the shared-mint accent, which is
  the semantic colour for the shared relationship state;
- page headers close with a rule, giving each screen a defined orientation band
  rather than an open expanse.

No new colour literals were introduced. Eight pre-existing literals in
`styles.css` were replaced with the semantic tokens that already restated them
in `theme.css`, and the now-redundant restatements were removed.

Fonts are unchanged. `Inter` and `Fraunces` are declared but not delivered, so
both currently fall back to system faces. Delivering them requires a
reuse/provider decision (self-hosting versus a third-party font host) with
privacy consequences, and is out of scope here.

## 5. Accessibility

- Focus order equals visible reading order in every viewport. Where a context
  zone leads the document, `layout-split-lead-rail` moves it visually into the
  trailing column via grid placement and does not reorder the document.
- Context zones are `<aside>` landmarks with an `aria-label`.
- The active navigation destination is marked by `aria-current`, a brand
  surface **and** a marker bar, so it is not signalled by colour alone.
- The private-area active tab likewise uses surface plus weight.
- Checkbox rows regained their label association and 44 px target; checkbox and
  radio controls are no longer sized as full-width fields.
- `select` shares the input surface, focus ring and 48 px height.
- Compact navigation keeps every destination reachable at 44 px targets.
- Long strings: headings, section heads and cards wrap; the overview grid uses
  `minmax(min(100%, …), 1fr)`, so a long German label cannot force horizontal
  overflow.

## 6. Testing

- `web/src/webLayout.test.ts` covers the primitives: page canvas widths,
  the two-zone breakpoint and lead-rail placement, overview-grid derivation,
  reading measures, the compact page-header stack, single ownership of the
  compact navigation grid, and the shared form-control rules.
- The same suite asserts that **every** custom property consumed by the Web
  stylesheets resolves; this is what surfaced the four undefined tokens.
- `web/src/components/AppShell.test.tsx` covers the grouped desktop navigation,
  the shell creation action, and that the compact navigation still contains
  every destination.
- `web/src/shellResponsive.test.ts` and `web/src/themeResponsive.test.ts`
  continue to cover shell and theme-control responsiveness.

## 7. Business and freemium model

**No business/freemium impact.** The change is presentation and interaction
structure. No capability was added, removed, gated, or moved between tiers; no
entitlement, quota, storage, managed-resource, Cloud/Self-Hosted, or downgrade
behavior is touched. `docs/FREEMIUM-FEATURE-MATRIX.md` needs no update.

## 8. Cross-cutting quality

- **Security / authorization:** not affected; no request, token, or capability
  handling changed.
- **Privacy:** not affected. Visibility badges, the private-area privacy band
  and owner-only routing are unchanged; the private-area tab state became more
  legible, not less restrictive.
- **i18n:** four new locale keys (`states.loading.title`, navigation group
  labels, two rail/aria labels, dashboard empty and results headings). One
  missing key that rendered raw was fixed. All layouts wrap; none assume a
  string length.
- **Accessibility:** see section 5.
- **Performance:** CSS-only layout; no new dependency, no new request, no
  additional render work. Container queries replace one viewport media query.
- **Resilience / offline:** unchanged; offline banners and cached-view states
  keep their positions.
- **API / contracts:** unchanged. The generated client is untouched. The Story
  card still shows heading and media only, because `MemorySummary` omits the
  body by contract; changing that is an API decision outside this issue.
- **Operations / Self-Hosted:** no build, runtime, or deployment change.

## 9. Follow-ups

Deliberately not done here:

- Delivering the `Inter` and `Fraunces` faces (needs a provider/privacy
  decision).
- A Story card excerpt for Erinnerung and Meilenstein, which would require a
  change to the Story contract.
- Visual regression coverage; the repository has no screenshot baseline
  infrastructure, so coverage here is source-level.

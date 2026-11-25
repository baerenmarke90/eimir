# Design Token Sets

**Status:** Mandatory design-system contract
**Decision:** Product Owner approval, 2026-11-16 (#1907 C1)
**Parent policy:** [Semantic Design Token Policy](DESIGN-TOKEN-POLICY.md)

## Purpose

A personal design (Verbunden, Geborgen, Klar & modern, Klassisch, Seite an
Seite and later ones) is a set of semantic tokens plus at most one layout
mode. It is not per-design component CSS. New designs must be cheap to add,
must not break silently when components change, and must be able to apply to
the whole app instead of only to Wir.

## One file per design

Every design lives in `design/designs/<id>.json`. The file name equals the
stored design id. `web/scripts/generate-app-designs.mjs` validates every file
and generates:

- `web/src/design/app-designs.css`: the design's custom properties for Light,
  explicit Dark (`data-theme="dark"`) and system Dark, plus a palette for its
  settings preview tile (`data-design-preview`);
- `web/src/design/appDesigns.generated.ts`: the typed registry (tier and
  layout per id) and selectable palette representatives.

`npm run tokens:generate` writes both; `npm run tokens:check` (part of
`npm test` and `npm run build`) fails when they are stale.

| Field | Allowed values | Becomes |
|---|---|---|
| `id` | stored design id (`WirDesignId`) | `data-app-design` on the root element |
| `tier` | `free`, `pro` | must match the server's Free list (`FREE_WIR_DESIGNS`) |
| `layout` | one of `designPresets.layouts` | `data-wir-layout` on screens that implement it |
| `color` | `{ "world": "<colour world>" }` or inline `light`/`dark` maps of the 16 colour-world roles | the same semantic colour properties as `identity.colorWorlds` |
| `shape` | `standard`, `crisp`, `soft` | `--radius-small/medium/large/card` |
| `type.display` | a key of `designPresets.displayFamilies` | `--font-display` |
| `type.headings` | `display`, `ui` | `--font-heading-family` |
| `icon.stroke` | `standard` (the app stroke) or a value in the `designPresets.iconStroke` range | `--icon-stroke-width` |
| `icon.accent` | `duotone`, `mono` | icon accent strokes keep their accent or follow the text colour |
| `motion` | `standard`, `calm`, `lively` | scaled `--duration-feedback/transition/context` (never under reduced motion) |
| `surface.backdrop` | `glow`, `flat` | `--design-backdrop-glow` |
| `surface.elevation` | `standard`, `soft`, `none` | `--shadow-card`, `--shadow-soft` |
| `surface.edges` | `none`, `hairline` | `--border-surface-width` |

`standard` always means the current root tokens and emits nothing. The bounded
presets live in `design/tokens.json` under `designPresets`.

### Optional fine roles

Product Owner amendment (2026-11-16): an inline palette may also set optional
fine roles (`FINE_ROLES` in `web/scripts/app-designs.mjs`) in Light and Dark.
Omitted fine roles keep the value the 16 roles derive.

| Fine role | Sets |
|---|---|
| `borderSubtle` | `--color-border-subtle`, `--color-header-border` |
| `mutedTextSoft` | `--color-text-muted` |
| `surfaceSubtle` | `--color-surface-subtle`, `--color-surface-panel-tint` |
| `surfaceOverlay` | `--color-surface-overlay` |
| `actionStrong` | `--color-brand-strong` |
| `sharedFill` | `--color-shared` |
| `glow` | `--color-brand-glow` |
| `tintBrand`, `tintShared` | `--color-page-tint-brand`, `--color-page-tint-shared` |
| `decoration`, `onDecoration`, `onDecorationMuted` | `--design-decoration*` (captions and similar decoration) |
| `highlight`, `onHighlight` | `--design-highlight`, `--design-on-highlight` (stamps, marks) |
| `decorationIcon` | `--design-decoration-icon` |

The contrast gate also checks soft muted text on page and surface and text on
decoration and highlight. Layout CSS that consumes a decoration role gives it
a fallback to a mandatory role.

The generator rejects unknown fields, values outside the presets, and palettes
that miss WCAG contrast in Light or Dark (text, muted text and action text
4.5:1 on page and surface; action label on action fill 4.5:1; focus 3:1).

## Locked for every design

A design file cannot set:

- status colours (success, warning, error, info, premium surfaces stay the
  semantic status set);
- person colours (#1958 is its own personal choice);
- privacy/concealment and media overlays;
- the spacing scale, type sizes, focus-ring width and touch targets.

## Action colour

Product Owner decision (2026-11-17): filled create/add actions
(`AddActionButton`, `AddActionLink`, `AddActionContent`, the floating Compact
action) and primary links use the design's action colour
`--color-action-primary` with its label colour `--color-on-action-primary`.
A design sets them through the optional roles `actionPrimary` and
`onActionPrimary`; otherwise they are the palette's strong action and
`onAction`, which gives Verbunden the canonical blue. A palette other than
Verbunden follows its own colours and must not pin the canonical blue, so
choosing a design colour recolours the add action too. Shape, icon, label, size
and the single-primary-action rule stay as in the
[Button contract](COMPONENT-CONTRACTS.md#31-button) (#1688/#1724).

The generator requires 4.5:1 for the label on the fill and 3:1 for the fill
against page and surface in Light and Dark. The default palette's Dark blue
(`#354778` on `#171B2F`, 1.88:1) predates this rule and stays by Product Owner
decision (2026-11-17); it is exempt until a separate decision. Inside
contextual colour worlds of the default design the action colour stays the
canonical blue.

## Layout modes

Layout modes are a closed, code-owned list (`connected`, `classic`, `open`,
`compact`, `rows`, and since 2026-11-17 by Product Owner decision `names`
(Zu zweit: large names without portraits, the moment as a small row)).
A layout may change arrangement, density, hero composition
and image ratios. It must not change content, actions, routes, privacy
presentation or the create-button contract. Colours, type families, radii,
elevation and motion come from tokens, never from layout CSS.

A navigation-replacing layout needs a separate Product Owner decision before it
joins the list. The following modes were approved on 2026-11-23. Each uses the
same destination routes, contextual create actions and secondary-page headers.

| Layout | Navigation | Decision |
| --- | --- | --- |
| `rooms` | Room picker for Zuhause | [#1881](https://github.com/baerenmarke90/eimir/pull/1881) |
| `chapters` | Chapter navigation for Unser Takt | [#1885](https://github.com/baerenmarke90/eimir/pull/1885) |

The Momente Album/compact switch is an independent per-device presentation
choice, not a design. It consumes the same semantic tokens and therefore
follows any design.

## Application and scope

`WirDesignProvider` applies the selected layout and its presets from
`data-app-design` and applies the effective colour palette from
`data-app-palette`. A palette change reaches every tab, portaled sheet and
the browser theme colour (`theme-color`) without reapplying layout or presets.
Both attributes are scoped to the signed-in person's Space. Approved
navigation modes also apply to the authenticated shell.

The Design colours card follows the app design by default. The user can save
a palette from another design independently. Designs that share a palette
have one selectable representative, with the default design representing
the original colours.

Contextual colour worlds (`data-color-world="warm"`/`"natural"`, for example
intimate moments and plan anticipation) stay as they are in designs on the
default palette. In a design with its own palette (Geborgen, Seite an Seite)
they resolve to that design's palette, so a page never mixes two designs.

Transitional rule until that step: Seite an Seite already tinted the body,
its portaled sheets and the bottom navigation while Wir is open. The
generator keeps that reach for this one design
(`TRANSITIONAL_SHELL_SCOPES`), and `WirSharedAlbum.css` keeps its marked
bottom-navigation rules; both are removed with the app-wide step.

## Tiers and stored preferences

Pro gating is unchanged: saving a Pro design needs `theme.bespoke_packs`, a
saved design stays effective after expiry, and returning to a Free design is
always Free (see [Freemium Feature Matrix](FREEMIUM-FEATURE-MATRIX.md)). The
existing design IDs are unchanged. A backend test pins
every file's `tier` to `FREE_WIR_DESIGNS`.

The optional palette override uses the same owner-scoped appearance
preference, If-Match token and Free/Pro boundary. Following the design is
always Free. A stored override survives expiry and appears in the owner's
personal export. Existing preferences start by following the app design.

## Adding a design

1. Add `design/designs/<id>.json` with the fields above and run
   `npm run tokens:generate`.
2. Add the id to the backend `WirDesignId`, `FREE_WIR_DESIGNS` when Free, and
   a downgrade-only Alembic migration (as `0132_wir_design_shared_album.py`);
   regenerate the OpenAPI client.
3. Add the localized name and description.
4. Reuse an existing layout mode. A new layout mode is a code change with its
   own review; a navigation-replacing layout needs a Product Owner decision.

No component CSS is keyed by a design id.

## Delivery

1. Contract, generator and plumbing; Verbunden and Geborgen (Wir only, no
   visible change).
2. Klar & modern and Klassisch (no visible change).
3. Seite an Seite (no visible change).
4. App-wide scope (intended visible change, separate Product Owner
   acceptance); the Seite an Seite transitional shell rule is removed.

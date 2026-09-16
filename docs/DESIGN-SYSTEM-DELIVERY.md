# eimir. Design System Delivery

**Status:** Mandatory implementation framework  
**Version:** 1.2<br/>
**As of:** September 15, 2026

This document turns design principles, tokens, and component contracts into an executable design system for React/TypeScript and Kotlin/Jetpack Compose. The goal is semantic parity, not pixel-identical platforms.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 1. Target architecture

```text
design/tokens.json
        │
        ├── Web Token Adapter ─────── React Components ───── Web Catalog
        │
        └── Android Token Adapter ─── Compose Components ─── Android Catalog
docs/COMPONENT-CONTRACTS.md + design/component-manifest.json
        └────────────────── shared behavioral contract
```

- `design/tokens.json` is the source for semantic design values.
- Component contracts are the source for behavior, states, and accessibility.
- Platform adapters translate units and native mechanics, not meaning.
- OpenAPI provides domain data models; UI components contain no domain authorization.
- Light and Dark use the same semantic roles; components do not know theme-specific raw colors.

## 2. Parity levels

| Level | Must be equal | May differ |
|---|---|---|
| Semantics | name, purpose, variant, state, privacy meaning | internal implementation |
| Behavior | result, validation, errors, back behavior | native gesture/overlay form |
| Visual | color semantics, typography hierarchy, spacing, radius family | system font metrics, native controls |
| Accessibility | name, role, value, focus target, target size | platform-specific API |
| Layout | Compact/Medium/Expanded rules | pane and navigation mechanics |

## 3. Logical structure

The exact folder structure follows the repository, but it should represent these modules:

```text
design/
  tokens.json
  component-manifest.json

web design system/
  generated tokens
  primitives
  components
  patterns
  icons
  catalog/examples

android design system/
  generated tokens/theme
  primitives
  components
  patterns
  icons
  catalog/examples
```

- Generated files carry a header and are not edited manually.
- Domain screens import components, not raw colors or spacing values.
- Components may consume tokens; tokens must not know any component.

## 4. Token pipeline

### Source

`design/tokens.json` contains semantic colors, typography, spacing, radius, layout, motion, shadows, and target sizes.

For colors, the following also applies:

- `color.semantic` remains the Light-compatible default for existing adapters.
- `color.scheme.light` and `color.scheme.dark` are the explicit theme palettes.
- Both schemes have the same roles; a theme must not introduce a new domain color meaning.
- Accent, status, and privacy colors are adjusted per scheme for sufficient contrast instead of being mechanically inverted.

### Web output

- CSS custom properties for theme and runtime values.
- Typed TypeScript names for component logic.
- System appearance via `prefers-color-scheme` as the default.
- The user choice **System / Hell / Dunkel** (de-DE product labels) overrides the system preference and is persisted locally.
- Browser `theme-color` and `color-scheme` follow the actually resolved theme.
- Media queries/container queries are derived from breakpoint and motion tokens.
- `prefers-reduced-motion` sets regular transitions to `instant` or a safe reduced variant.

### Android output

- Compose `Color`, `Dp`, Shapes, Typography, and motion values.
- Material 3 theme as an adapter without losing eimir. semantics in generic Material names.
- `eimir.Theme` has separate Light/Dark `ColorScheme`s and follows `isSystemInDarkTheme()` by default.
- The theme entry point must allow an explicit override so that a later **System / Hell / Dunkel** setting (de-DE product labels) can be added without restructuring screens.
- Status and navigation bars follow the theme background and appropriate icon brightness.
- Window Size Classes are mapped to Compact/Medium/Expanded.

### Pipeline gates

- JSON and schema are valid.
- Every semantic color token exists in Light and Dark or is explicitly platform-specific.
- Every semantic token exists in both adapters or is explicitly platform-specific.
- Generated output is reproducible and produces a clean CI diff.
- Color-contrast smoke tests cover central foreground/background pairs in both themes.
- Raw hex values and non-tokenized spacing outside the token/theme module are prevented or reported.

## 5. Component levels

### P0 — Foundation

- Button, IconButton, Link,
- TextField, TextArea, Checkbox, Radio, Switch,
- NavigationItem, Tabs,
- ListItem, ContentCard,
- VisibilityControl, StatusBadge, SyncIndicator,
- InlineMessage, Snackbar,
- Skeleton, EmptyState, ErrorState,
- Dialog, BottomSheet, SidePane,
- MediaTile.

### P1 — Product patterns

- App Shell for Bottom Navigation and the Expanded Web header,
- adaptive List-Detail structure,
- form page with error summary,
- Story Timeline Item and month group,
- HeartMoment privacy selection,
- Upload Queue,
- conflict resolution,
- Auth/Invitation layout.

### P2 — Domain compositions

- Today modules,
- Memory Editor and detail,
- Wish/Plan status flow,
- Settings/Privacy pages,
- export status,
- later Shopping and Discover compositions behind feature availability.

## 6. Platform catalogs

Both platforms receive an internal visual catalog.

Each entry shows:

- purpose and contract link,
- all variants,
- Default, Hover/Pressed, Focus, Disabled, Loading, Error,
- long text and localization example,
- large text/200% zoom,
- Light and Dark mode,
- privacy and status colors with text,
- Compact and Expanded when layout-relevant,
- code example and prohibited usage.

The catalog is a development tool, not a public product page.

The first bounded v1 proof is [F1 visual foundations](product/design/f1-visual-foundations.md):
one Web development/test entry and one Android debug-only Activity. Its role
mapping and evidence identify what is delivered; it does not claim a complete
catalog, migrated R1–R5 screens or a shared F2 sheet implementation. The
production Web build and Android release manifest must exclude the proof entry
and its fixture assets.

## 7. Component API rules

- Components are named by purpose, not appearance: `VisibilityControl`, not `PinkChip`.
- Variants are closed enums, not freely combinable style flags.
- Text is passed as content; components do not invent domain copy.
- Icon-only controls require an explicit accessible name.
- `loading` and `disabled` are separate states.
- Layout components have no hidden navigation or API request.
- Domain IDs, tokens, and private content are not included in analytics callbacks of a base component.
- Components use semantic theme roles and no raw colors suitable only for Light.

## 8. Example of a platform-neutral contract

```text
Button
  variant: primary | secondary | tertiary | destructive
  state: default | disabled | submitting
  label: required
  icon: optional
  action: exactly one callback
  accessibility: visible label is accessible name
  size: web ≥ 44 px, Android ≥ 48 dp
```

Web may implement this as a native `<button>`; Android may use a Compose Button adapter. Result and states remain the same.

## 9. Adaptive layout delivery

- Breakpoints come from tokens.
- Web uses Compact/Medium Bottom Navigation and Expanded horizontal header navigation under the accepted A1 shell decision; Android keeps Bottom Navigation at every size under ADR 0004. Route IDs remain stable.
- List-Detail may be used from Medium only when justified by the human task and when selection, focus, and return context are preserved.
- Screen templates are implemented as reusable layout patterns, not copied per domain.
- Android uses Window Size Classes; Web follows the available container/window width.
- A size change does not discard a draft and does not trigger a new domain action.

## 10. Testing gates per component

### Common required cases

- contract variants and states,
- long labels,
- large text/zoom,
- Light and Dark mode including central WCAG 2.2 AA contrasts,
- system-theme changes where the platform supports this state,
- accessible name/role/value,
- focus/back/close,
- touch/click target,
- reduced motion,
- visual regression.

### Additional Web cases

- native HTML semantics,
- `System / Hell / Dunkel` (de-DE product labels) including persistence and reload,
- system changes are applied without reload when `System` is selected,
- keyboard patterns according to WAI-ARIA APG when no native element is sufficient,
- server/client rendering without layout shift if relevant later,
- browser matrix according to the QA document.

### Additional Android cases

- Compose Semantics and TalkBack,
- system Light/Dark and correct system-bar icon brightness,
- System Back and process restoration,
- different font/display sizes,
- Compact/Medium/Expanded.

## 11. Versioning

- Design tokens and component libraries use Semantic Versioning.
- Patch: visual/technical correction without a contract change.
- Minor: additive variant or component.
- Major: removed/renamed API or changed meaning.
- Deprecations have a replacement, migration note, and earliest removal release.
- Product code imports only public exports of the design system.

## 12. Ownership and decisions

For each P0/P1 component, the following are named:

- domain owner,
- design owner,
- Web and Android implementation responsibility,
- accessibility review,
- current status in the manifest.

New patterns are documented first as a contract/decision. A local special case in a screen does not automatically become part of the system.

The original DS0–DS4 phases below describe the system delivery framework; they do not replace the current [F1 → F2 → R1–R5 → P1–P3 → C1 sequence](./product/design/implementation-roadmap.md). F1 establishes only missing visual roles needed by v1; F2 establishes only needed interaction boundaries. Neither authorizes a blanket CSS/component rewrite. Reuse correct existing primitives, prove them on bounded surfaces, and retire weak mechanisms after replacements are accepted.

## 13. Delivery phases

### Phase DS0 — Pipeline

- token schema and generators,
- Web and Android theme adapters,
- CI validation,
- empty platform catalogs.

### Phase DS1 — P0 Components

- action, input, navigation, feedback, and privacy components,
- accessibility and screenshot tests,
- complete catalog entries.

### Phase DS2 — App Shell and system states

- adaptive navigation,
- Loading/Empty/Error/Offline,
- Dialog/Sheet/Pane,
- Auth/Invitation base layout.

### Phase DS3 — First domain flows

- Onboarding/Invitation,
- Memory/Media,
- HeartMoment privacy,
- Story List-Detail,
- Wish → Plan.

### Phase DS4 — Hardening

- visual parity,
- localization stress test,
- performance,
- documentation and deprecation process.

## 14. Release criteria

- Token adapters are reproducible.
- P0 components are visible in both catalogs.
- No local color/spacing semantics duplicate tokens.
- Light and Dark are fully readable and operable on Web and Android for all shipped UI surfaces.
- Central text, UI, and focus contrasts meet WCAG 2.2 AA in both themes.
- New UI introduces no hardcoded colors suitable only for Light.
- The accessibility matrix is satisfied for P0.
- Privacy states use technical classes correctly.
- The offline MVP shows the read cache but no invented write sync.
- Web and Android pass the same flow examples against the same API mock.
- Manifest status and documentation match the shipped state.

## 15. Presentation and runtime source governance

Per Issue #675, pull requests affecting presentation, brand identity, or
design tokens are subject to the mandatory Product Design / UX review gate,
even when they do not modify components inside `web/src` or Android UI packages.

The authoritative presentation/runtime source graph is evaluated by
`scripts/classify_product_design_paths.py` and includes:

- `design/tokens.json` and design-system machine-readable assets under `design/**`;
- Web runtime presentation assets: `web/public/**` (favicons, touch icons, fonts, entry scripts);
- Web entry point: `web/index.html`;
- Web client source: `web/src/**` (excluding contract-generated OpenAPI clients in `web/src/api/generated/**`);
- Android UI source and resources: `android/app/src/main/java/**`, `android/app/src/main/res/**`.

New design-system or runtime presentation sources must be registered in
`USER_FACING_PATTERNS` in `scripts/classify_product_design_paths.py` and covered
by `scripts/test_classify_product_design_paths.py`.

## Related documents

- [Design Tokens](../design/tokens.json)
- [Component Manifest](../design/component-manifest.json)
- [Component Contracts](./COMPONENT-CONTRACTS.md)
- [Screen Templates](./SCREEN-TEMPLATES.md)
- [Accessibility and QA Matrix](./ACCESSIBILITY-QA-MATRIX.md)

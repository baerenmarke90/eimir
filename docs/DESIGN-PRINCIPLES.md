# Design Principles for eimir.

**Status:** Mandatory foundation for Web and App<br/>
**Version:** 2.2<br/>
**Effective from:** September 15, 2026

This document translates the eimir. product idea into mandatory
design rules. It applies to product surfaces, the website, store listings,
marketing pages, and new features.

The terms **MUST**, **SHOULD**, and **MAY** describe the requirement level.
When requirements conflict, use this priority order:

1. privacy and security
2. accessibility
3. comprehensibility and usability
4. smartphone-first partner-app invariant for couple-facing product interaction (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md`)
5. Product Reference v1 and compatible domain-specific product decisions
6. shared design-system consistency
7. generic Screen Template default / brand impact
8. visual novelty

This order matches `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 0; that document is authoritative for the smartphone-first invariant itself.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 1. Design goal

eimir. should feel like a calm, private space for two people: warm,
personal, and high-quality, but never kitschy or overloaded.
Claim: „Euer gemeinsamer Ort.“

Every surface answers these questions within a few seconds:

- Where am I?
- What is shared here and what is private?
- What is the next meaningful step?
- Which data or permissions are affected?

## 2. Ten core principles

### 2.1 Calm before stimulation

The surface MUST support the content rather than compete with it.

- Each view has at most one dominant primary action.
- Decoration supports orientation or mood; it is not an end in itself.
- Whitespace is an active part of the layout.
- Persistent animations, aggressive banners, and unnecessary badges are not allowed.

### 2.2 Privacy is a visible product state

Privacy must not be explained only in policies. It MUST be directly visible at
the point where data is created or shared.

- States use clear labels. Intentional de-DE product examples are **Nur für mich**, **Mit Partner teilen**, and **Standort aus**.
- Visibility is always represented with text and an icon, never with color alone.
- Permissions are requested only in the context where they are needed.
- Security and encryption claims may be used only when they are technically and
  operationally demonstrated in the production build.
- No E2EE claim is allowed without verified end-to-end encryption.

### 2.3 Designed for two, not for a social network

The Space and the relationship take precedence over profiles, reach, or public
self-presentation.

- Shared context is always recognizable in navigation and language.
- There are no public rankings, follower mechanics, or social pressure.
- Recommendations optimize for shared relevance rather than maximum dwell time.
- Both people receive equal control and understandable state information.

### 2.4 One clear next step

Every view MUST have an unambiguous visual hierarchy.

- The visible content or title explains the context.
- A subtitle appears only when it adds meaning; a mandatory title/subtitle stack must not push personal content below the first viewport.
- The primary action is visually unambiguous.
- Secondary actions recede visually.
- Complex flows are split into small, reversible steps.

### 2.5 Content is the hero

Memories, wishes, plans, and shared moments are visually central.

- Compose by content type: photos, text memories, plans, and checklists need different presentation. A card must earn its boundary; show content before meaning, action, and secondary metadata.
- Real content replaces generic placeholders as early as possible.
- `Wir` / Today is an orchestration surface, not a widget dashboard: only currently relevant signals, contextual actions, and shared content appear; irrelevant modules disappear (see `PARTNER-APP-EXPERIENCE-STANDARD.md`).
- Images are cropped calmly and are never overloaded with text.
- Empty states explain the value and the next step, not merely the absence of data.

### 2.6 Progressive disclosure

The first level stays simple; details appear when needed.

- Rare options belong in details, menus, or a second step.
- Critical states and privacy information must not be hidden.
- Forms request only information required for the current step.
- Advanced settings retain understandable defaults.

### 2.7 Human, respectful language

Language is direct, warm, and non-judgmental.

- In de-DE product copy, prefer “ihr”, “euer”, “gemeinsam”, and concrete verbs.
- Do not use guilt mechanics, artificial urgency, or dark patterns.
- Error messages explain what happened and what the user can do next.
- Copy promises only capabilities available in the current product state.

### 2.8 Accessibility is Definition of Done

Accessibility is not a later optimization.

- The target standard is WCAG 2.2 AA.
- Body text reaches at least 4.5:1 contrast; large text and UI graphics reach 3:1.
- Color is never the only information carrier.
- Web surfaces are fully operable by keyboard.
- App surfaces support screen readers and text scaling to at least 200%.
- Touch targets are at least 48 × 48 dp; Web targets are at least 44 × 44 px.
- Reduced motion and sufficient focus indicators are supported.

### 2.9 One language across platforms

Web and App share semantics, tone, tokens, and component logic.

- The same function uses the same name and color role.
- Platform conventions take precedence over pixel-level equality.
- Android is the Capacitor wrapper around the Web product: platform conventions (system bars, insets, Back) are adapted, the screens are not re-implemented.
- New one-off components are allowed only when existing patterns are insufficient.

### 2.10 Motion explains change

Motion supports orientation and feedback.

- Reuse the semantic duration roles: fast (120 ms), standard (180 ms), and emphasized (280 ms), with maximum (320 ms) as the normal upper bound. Values come from `design/tokens.json`, not local ranges.
- Select the role by the change being explained; reduced motion uses instant or another safe reduced treatment.
- Animations use calm ease-out behavior without strong bouncing.
- Success, synchronization, and state changes are confirmed subtly.
- Decorative motion stops automatically and respects “Reduce Motion”.

## 3. Visual language

### 3.1 Color semantics

Colors are used according to meaning, not according to the preference of an
individual view. `design/tokens.json` is the sole source of truth.

The current runtime palettes are `color.scheme.light` and `color.scheme.dark`.
`color.semantic` contains compatibility fallbacks, not a competing palette.
Use the platform adapter; do not copy literal values from earlier tables or screenshots.

| Semantic role | Meaning and use |
| --- | --- |
| `background` | warm page ground; avoid unnecessary content boundaries |
| `surface`, `surfaceSubtle` | readable content and quiet grouping where needed |
| `surfaceRaised`, overlay roles | genuinely elevated controls or transient layers |
| `textPrimary` | authored content and primary meaning |
| `textSecondary` | readable dates, author, subtitles, help, and other supporting copy |
| `textMuted` | only where the actual rendered pair meets its applicable contrast requirement; not a default for essential small text |
| `border`, `borderSubtle` | purposeful separation, not a frame around every section |
| `brandStrong`, `brand`, `onAccent` | primary actions and selected emphasis with validated foreground/background pairing |
| `shared`, `sharedSurface`, `success` | shared context or confirmed outcomes with text/icon meaning |
| `private`, `privateSurface` | private context, not an error |
| `technical`, `discovery` | system information or inspiration when meaningful |
| `error`, `warning`, `focus` | distinct consequence and keyboard focus states |

The current Light muted/page pair fails normal-text contrast. Essential dates,
labels, help, and status therefore use a compliant secondary-text pairing.
Validate actual Light/Dark pairs; token names do not prove contrast. The
[system direction](./product/design/design-system-direction.md#5-color-philosophy-and-lightdark)
defines the retained palette's current use.

Mandatory rules:

- Filled primary actions use the established strong-coral/on-accent pairing in both themes; links and selected text may use the scheme-appropriate brand role. Bright Dark coral is not a safe substitute behind white normal text.
- Mint means shared, synchronized, or positively confirmed togetherness.
- Rose marks private or restricted personal space, not automatically an error.
- Errors and destructive actions additionally require a clear warning icon and
  unambiguous text.
- Pastel surfaces may be combined only with sufficiently dark text.
- At most two accent colors SHOULD dominate a view.

### 3.2 Typography

Two self-hosted font families are delivered by the product. See `docs/decisions/0005-typography-delivery.md`.

- **Display:** Literata for selected emotional, editorial, and relationship storytelling moments (Today/Wir hero, memory titles, quotes, drop cap). Delivered by both clients as a self-hosted variable file; nothing is fetched at runtime. Fallback: `Georgia, serif`.
- **UI:** Instrument Sans (400/500/600/700) for navigation, content, forms, controls, planning cards, comments, settings, and utility headings. Delivered by both clients as a self-hosted variable file; nothing is fetched at runtime. Fallback: platform sans-serif.

The [v1 typography roles](./product/design/design-system-direction.md#4-typography-language)
now define the calibrated hierarchy; semantic token adapters deliver the values.
Editorial meaning, practical headings, body prose, supporting copy, and navigation
have distinct roles rather than inheriting one generic card title/meta scale.

- Authentication and setup entry headings MUST use the UI family; the display
  family is reserved for editorial or Story contexts.
- Body text is never smaller than 16 px or 16 sp, respectively.
- Long-form text uses at most 70 characters per line.
- All-caps is allowed only for very short labels.
- Numbers, times, and status values use tabular figures.

### 3.3 Spacing and grid

The base unit is a 4-unit grid.

`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64`

- Compact page gutters follow Product Reference v1 D7: approximately 16 px below ~390 px and 20 px at/above ~390 px; use equivalent density-independent units on native clients. Deliberate image-led edge-to-edge composition may override the gutter while text, focus, and safe-area insets remain protected.
- Medium/Expanded Web may use 24–64 px margins according to composition. Reusable values belong in semantic tokens; D7 implementation is owned by F1, not a page-local override.
- Maximum content width: 1200 px; reading text is limited to 720 px.
- Standard spacing inside a card: 20–24 px.
- Related elements are closer together than separate sections.
- Page modules and major sections use spacing, composition, surface contrast, or elevation for separation. Standalone horizontal or vertical hairlines MUST NOT be added merely to mark a module boundary. Hairlines remain appropriate inside lists, fields/controls, overlay chrome, provenance, and explicit semantic or safety boundaries.
- Web layouts switch to one column below 768 px.

### 3.4 Shape and depth

- Standard card radius: 20 px/dp.
- Large hero surfaces and modal surfaces: 24–32 px/dp.
- Buttons: 14–16 px/dp; pills are reserved for filters and compact status values.
- Shadows remain soft and shallow; surface/depth differences are preferred for page-module boundaries, while purposeful lines remain available for internal or semantic boundaries.
- Avoid more than two visible depth levels per view.

### 3.5 Imagery and illustration

- Personal photography leads where it carries meaning; preserve ordinary, imperfect, portrait, landscape, and text-only content without imposing a decorative photographic style.
- Suitable motifs include paths, memory objects, nature, light, and small everyday moments.
- Do not use interchangeable stock couples or over-staged romance.
- 3D objects may provide orientation and brand warmth but must not obscure UI.
- Screenshots show real, readable UI and at most one central message.
- Images have alt text; purely decorative images are hidden from assistive technology.

## 4. Component rules

### Buttons

- Each view has at most one visually dominant primary action.
- Primary: the established strong-coral/on-accent pairing through semantic theme roles; verify actual contrast in Light and Dark.
- Secondary: light Surface with a clear outline.
- Tertiary: text action without its own surface.
- Destructive: unambiguous warning text; never communicate destructiveness through red alone.
- Loading states retain their width and labeling context.

### Cards

Use a card only for a meaningful grouped object, action, or bounded interaction. Bare page content, reading surfaces, media, compact rows, and timeline items remain distinct choices.

The default priority is **content → meaning → action → metadata**. A photo or thought may lead before its title. Privacy, destructive consequences, and critical state stay visible at the point of decision regardless of their usual visual priority.

Avoid nested cards and uniform card walls. The [system direction](./product/design/design-system-direction.md) defines the current surface and content-composition roles.

### Navigation

- Mobile primary navigation contains at most five primary destinations.
- Web navigation remains shallow and clearly indicates the current location.
- A localized “Back” action and Close must not acquire the same meaning. For de-DE, “Zurück” is the corresponding product label.
- Deep links always lead into an understandable context.

### Privacy and sharing control

- Every shareable entity displays its current visibility state.
- Changes explain their effect before confirmation.
- Private content is not leaked into previews, notifications, or analytics.
- Location is off by default and activated only in context.

### Feedback and system states

Every asynchronous action needs a visible state:

`idle → loading → success | empty | error | offline`

- Optimistic updates are allowed only for reversible, non-critical actions.
- Saving and synchronizing are communicated as distinct states.
- Offline states explain what remains available locally.
- Errors do not remove content the user already entered.

## 5. Responsive behavior

For couple-facing product interaction, the Compact/smartphone experience is designed first and Web/Expanded adapts it; see `docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 0. The following platform behaviors implement that invariant.

### App

- Mobile-first with one-handed core actions.
- System bars, insets, and the keyboard are accounted for.
- Primary actions remain reachable without covering content.
- Large image surfaces load progressively with a stable placeholder.

### Web

- Viewports from 320 px through 1440+ px are supported.
- One column on mobile, up to two content zones on desktop; the second zone adds context or supporting content, not a duplicate set of primary controls.
- Hover may add information but is never required.
- Dialogs become bottom sheets or full-screen steps on small viewports.
- Focus order follows the visible reading order.

## 6. Content and claim rules

- Lead with value before feature names.
- Use one sentence per core message.
- Do not use rankings, prices, user counts, or security claims without a reliable source.
- The de-DE product claims “Verschlüsselt übertragen” and “Ende-zu-Ende verschlüsselt” are not interchangeable.
- Privacy copy states the concrete effect instead of relying on abstract promises.
- Copy must work in German and English without breaking the layout.

## 7. Design Definition of Done

A surface is complete only when every item is satisfied:

- [ ] The primary goal and next action are understandable within five seconds.
- [ ] Private and shared states are unambiguous.
- [ ] All default, empty, loading, error, and offline states are designed.
- [ ] Contrast, text scaling, keyboard operation, and screen-reader behavior were reviewed.
- [ ] Touch and click targets meet the minimum size.
- [ ] Responsive behavior was reviewed on small and large viewports.
- [ ] Copy is concrete, respectful, and claim-safe.
- [ ] Components and tokens come from the shared design system.
- [ ] Motion respects reduced-motion preferences.
- [ ] Screenshots and marketing representation match the actual product state.

## 8. Governance

- Design tokens are the shared source for Web and App.
- Deviations are documented and decided with Product, Design, and Engineering.
- New components require at least usage guidance, states, accessibility rules, and tokens.
- Recurring special cases are moved into the design system.
- This document is versioned and updated for every substantial brand, privacy, or navigation change.

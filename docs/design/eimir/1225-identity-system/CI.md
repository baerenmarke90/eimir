# eimir. corporate identity — issue #1225

**Status:** Selected identity implemented in Web; PR #1244 merged. Issue #1245 is the owner-image fidelity follow-up. Final Product Design acceptance remains with Philipp.
**Authority:** The four owner images below define the app logo, icon inventory, variant examples and icon states. All other visual and interaction rules continue from [Product Reference v1](../../../product/design/product-reference-v1.md), its [design-system direction](../../../product/design/design-system-direction.md), the [partner-app experience standard](../../../PARTNER-APP-EXPERIENCE-STANDARD.md) and the central [design tokens](../../../../design/tokens.json). The owner decision is recorded in [#1225](https://github.com/baerenmarke90/eimir/issues/1225#issuecomment-5797850494).

## 1. Fixed visual references and scope

| Reference | Binding content | Original file |
| --- | --- | --- |
| App logo | The overlapping warm/cool circles, white lowercase `e` loop, navy finish, separate dot, rounded tile, and Light/Dark/monochrome treatments | [Owner app logo](references/owner-app-logo.png) |
| Icon overview | The 30 named symbols in six groups and the compact navigation examples | [Owner icon overview](references/owner-icon-overview.png) |
| Icon variants | Outline, Filled and Duotone examples for Wir, heart, calendar, plane, star and lock; the Original, Natürlich and Warm worlds | [Owner icon variants](references/owner-icon-variants.png) |
| Icon states | Default, Hover, Active, Pressed and Disabled heart examples | [Owner icon states](references/owner-icon-states.png) |

These PNGs are kept byte-for-byte as supplied. They are references, not generated implementation exports. When an illustration and a small rendered SVG differ, the owner image decides the intended motif and the semantic token and accessibility contracts decide its usable implementation. This decision replaces the former interlocking-ring brand mark and the earlier plant proposal as the app logo. The two-circle symbol remains the **Wir** navigation icon.

The scope is identity: logo, icons, semantic color worlds and their existing Web delivery points. It does not change routes, feature behavior, entitlement, copy, image content or screen composition. The current Compact shell has **Wir, Momente, Planen and Mehr**, plus a central add action. **Listen** keeps its own icon under **Mehr > Gemeinsame Listen**; the five-item navigation in the reference is an icon usage example, not a new route decision.

## 2. Brand mark, app icon and wordmark

The mark consists of two distinct filled circles, warm on the left and cool on the right, overlapping behind a white lower-case `e` loop. A navy lower shape finishes the `e`; the dot sits separately at lower right. The circles and loop must remain discernible. Do not substitute the navigation circles, a generic heart, a plant, an infinity symbol or a continuous ribbon for this app mark.

The editable master is [logo-mark.svg](assets/logo-mark.svg) on a 256-unit square. Its mono drawing is [logo-mark-mono.svg](assets/logo-mark-mono.svg). [build-assets.py](build-assets.py) creates the Light, Dark, Natürlich and Warm marks and the 512-unit app tiles from the same geometry, then synchronizes the SVGs used by the Web app. Static brand-art colors live in these masters; the UI's semantic colors live in `design/tokens.json`. The tile has a rounded square boundary with clear inner space. The maskable asset has an additional safe area around the mark. Do not stretch, rotate, crop the dot or apply a second color effect.

Light uses a white loop and a navy finishing stroke. **Dark cuts the loop out against its dark tile and uses a warm-to-cool finishing stroke**, with brighter circles and a lilac dot. Monochrome preserves the same geometry with one ink and a negative loop. Use the complete Dark tile on arbitrary backgrounds so its cutout keeps the correct ground. The full silhouette, overlap, lower stroke and separate dot follow the owner image at both large and launcher sizes.

| Use | Implemented asset and rule |
| --- | --- |
| Light app icon and favicon | `web/public/identity/app-icon-light.svg`, `web/public/favicon.svg`, `web/public/pwa-192.png`, `web/public/pwa-512.png`, `web/public/apple-touch-icon.png` |
| Dark app icon and favicon | `web/public/identity/app-icon-dark.svg`, `web/public/favicon-dark.svg`; startup bootstrap and runtime choose the favicon from the resolved theme, including explicit overrides |
| Monochrome | `web/public/identity/app-icon-mono.svg`; one ink for constrained use |
| Contextual worlds | `app-icon-natural.svg` and `app-icon-warm.svg` are controlled brand variants, not user-selectable app themes |
| Header and entry surfaces | `Brand` uses the complete Light or Dark app tile according to the resolved theme; transparent marks remain editable exports |
| Maskable PWA | `web/public/pwa-maskable.svg` uses the same master motif inside the mask-safe area |

The installed PWA manifest uses the Light PNG and a maskable SVG; installed launchers do not reliably select an icon based on app theme. The Dark and monochrome artwork remain explicit deliverable assets, and the Web favicon switches with the resolved theme.

The consumer name is always **eimir.** in lowercase with the terminal dot. The wordmark uses self-hosted Instrument Sans, bold, with compact letter spacing; the dot uses the semantic identity accent. The mark and wordmark have separate responsibilities: the mark must work alone as an app icon, while wordmark text stays real text in UI. The poster's handwritten phrases and slogan are part of the supplied visual reference; they do not replace existing localized product copy or the established brand claim.

## 3. Icon system

All product icons use a **24 px drawing grid**, about **20 px optical content**, **1.65 px rounded strokes**, rounded joins and a minimum **44 CSS px target** when interactive. Shapes are recognizable in one color. Warm/cool accents clarify a shape; they never carry status or privacy meaning alone. The shared runtime source is [`EimirIcon`](../../../../web/src/components/EimirIcon.tsx), reached by route icons through [`DestinationIcon`](../../../../web/src/components/DestinationIcon.tsx). No second icon library is introduced.

| Group | Symbols in the owner overview |
| --- | --- |
| Core and navigation | Wir, Momente, Planen, Listen, Mehr |
| Relationship and emotion | Thinking of you, Mood, Together, Shared, Private |
| Content and actions | Foto, Video, Erinnerungen, Highlights, Wünsche |
| Planning and travel | Kalender, Reisen, Ziele, Meilensteine, Jahrestag |
| Communication | Benachrichtigungen, Nachrichten, Suche, Einstellungen, Neu/Hinzufügen |
| Other | Privatsphäre, Statistiken, eimir. Pro, Hilfe, Logout |

The existing routes and content also need eight symbols absent from the board: Spiele, Orte, Kapitel, Geburtstag, Profil, Geschenk, Aktivität and a compact add glyph. They use the same registry, grid and semantic colors. **Neu** is the circled add symbol from the owner board; **Hinzufügen** is the simple plus used inside the established central action. `Planen` and `Kalender` are both named entries because their contexts differ while sharing a related calendar silhouette.

| Variant | Rule and implemented examples |
| --- | --- |
| Outline | Default navigation and ordinary content; all 30 board icons and the eight existing-route additions are covered. |
| Filled | Active navigation or a strong semantic motif. The owner examples Wir, heart, calendar, plane, star and lock are implemented; Planen and Mehr also have active variants for the current shell. The heart has a continuous cool-to-warm fill. |
| Duotone | Deliberate warm/cool emphasis only where it helps meaning. The six owner examples (including the private plus-lock) have separate duotone drawings; the heart uses a cool-to-warm transition rather than two hard halves. |

The control owns its accessible name and interaction state; decorative SVGs are hidden from assistive technology. Use the existing localized label, `aria-current` for active destinations, native `disabled` semantics where applicable, and the semantic focus role. Do not place an unlabeled icon alone in a button.

| Control state | Visual treatment | Non-color signal |
| --- | --- | --- |
| Default | Outline, normal text/icon color | Recognizable contour and visible label |
| Hover | Same contour with cool-blue heart stroke and semantic hover surface | Pointer affordance and label retained |
| Active | Filled icon in navigation or selected content | Filled silhouette and `aria-current`/selected semantics |
| Pressed | The filled heart gains a cool lower finishing stroke while the control surface responds | Pressed control surface and stable label |
| Disabled | Reduced emphasis, no active fill | Native disabled behavior and retained readable context |
| Focus visible | Existing focus token/ring around the control | Visible ring independent of color accents |

## 4. Color worlds and Light/Dark

`design/tokens.json > identity` is the only **semantic UI color** value source. Its generated Web adapter is `web/src/design/identity-roles.css`. The static brand artwork has its own SVG master for the approved gradients; components consume semantic roles rather than scattering literal colors. **Original** is the default brand world. **Natürlich** and **Warm** are controlled contextual worlds already used on the relevant personal surfaces; they are not selectable themes and do not change Premium personalization. All three define Light and Dark roles. User choice of System/Light/Dark still controls luminance independently of the contextual world.

The following values identify each world's main roles. `design/tokens.json` also defines elevated, muted text, border, link/action text, on-action, soft surfaces, hover, pressed and focus values for every row; those values are binding and generated, not inferred from this abbreviated display table.

| World / mode | Page | Surface | Text | Action fill | Warm accent | Cool accent |
| --- | --- | --- | --- | --- | --- | --- |
| Original Light | `#E6EBFA` | `#F3F5FC` | `#19233E` | `#4C6ED0` | `#AA4C86` | `#5685D1` |
| Original Dark | `#171B2F` | `#252B43` | `#F6F7FF` | `#42558C` | `#F1B3D7` | `#AED1FA` |
| Natürlich Light | `#F7FCF9` | `#FFFFFF` | `#193D3C` | `#2C8178` | `#A75681` | `#427F9B` |
| Natürlich Dark | `#142B2B` | `#213B3A` | `#F3FFFA` | `#8AD5BD` | `#F2BDD0` | `#A5D7E3` |
| Warm Light | `#FFF9F6` | `#FFFFFF` | `#432E42` | `#A85880` | `#AA4E78` | `#6765AB` |
| Warm Dark | `#2C2334` | `#3A2E43` | `#FFF7FC` | `#EDACC5` | `#F2B4D0` | `#CCC0F5` |

Success, warning, error, information and Premium keep their explicit Light/Dark semantic text-and-surface pairs in `identity.semanticStatus`. The accent worlds must not redefine these outcomes as decoration. Preserve natural exposure and color in personal photographs in every world. Small text and action labels need at least 4.5:1 contrast against their actual surface; essential UI graphics need at least 3:1. The existing representative token-pair check is a baseline, not a claim that all composited images and gradients have been audited.

## 5. The rest of the existing design

The identity is layered onto the already accepted new eimir. product language. The page starts with people, authentic photographs, words and intentions; surfaces and separators are used only when they explain grouping or interaction. Compact is normative, with the current four labeled destinations, central add action, touch reach and safe-area behavior. Expanded adapts the same hierarchy. Do not create a card wall or a new information architecture to display the icons.

Self-hosted **Instrument Sans** remains the UI and reading face; **Literata** remains for selected emotional/editorial moments. Existing typography roles, spacing, radii, motion durations, reduced-motion behavior, component contracts, loading/empty/error/offline/success treatments and privacy labels remain in force through Product Reference v1 and its component contracts. The icon and logo change does not authorize new text, animation, photo treatment, entitlement or feature behavior.

## 6. Delivery, ownership and verification

| CI element | Source and delivered consumer |
| --- | --- |
| Editable logo geometry and variants | `docs/design/eimir/1225-identity-system/assets/` → `build-assets.py` → `web/public/identity/`, favicon and maskable SVG |
| Installed raster icons | Light app tile → 192/512 PWA PNG and 180 Apple touch PNG; exact dimensions checked by `web/scripts/check-pwa-foundation.mjs` |
| Icon names, outlines and variants | `web/src/components/EimirIcon.tsx` → `DestinationIcon`, `AppShell`, Today content and existing route usage |
| Semantic color worlds | `design/tokens.json` → `web/scripts/generate-identity-roles.mjs` → generated CSS and existing theme bootstrap |
| Design evidence | Original PNGs in `references/`; editable board source and generated exports in this directory; real app screenshots in `evidence/` |

Run the existing token, PWA, type, unit and browser checks for affected surfaces. [verify.py](verify.py) validates the owner-image hashes, 30 board names, runtime symbol coverage, SVG syntax, delivered asset consistency, historical export integrity and representative text contrast. The Web build validates its generated token output and PWA dimensions. Review Wir, Momente, Planen, Mehr/Listen and central add in real Compact Light/Dark UI, then the relevant Expanded view. Product acceptance compares those results with the four originals; a green build alone does not approve the visual match.

### Comparison boundaries for #1245

- The app logo is an editable vector reconstruction of the supplied raster. Its color order, circles, loop, lower stroke and separate dot follow the owner image. Pixel equality with the original lighting and anti-aliasing is not claimed; inspect it at 16, 32, 192 and 512 px before acceptance.
- The owner board shows one state sequence for a heart. Runtime icons use its contour, fill, duotone and pressed distinctions with contrast-safe semantic theme colors; the parent control still owns hover, focus, disabled and selected semantics. The PNG exports from the original snapshot predate the #1245 changes and remain historical evidence until regenerated from the updated editable board source.
- Existing app screenshots in `evidence/` predate the #1245 Dark loop and favicon adjustments. Current real Compact and Expanded screenshots must be added before Product Design acceptance; the illustrated design board does not substitute for them.

# eimir. Design System Direction

**Status:** Normative companion to [Product Reference v1](product-reference-v1.md)<br/>
**Approved:** September 15, 2026, by [Product Owner decision #955](https://github.com/baerenmarke90/eimir/issues/955)

This document defines the visual and input language for the [five reference experiences](reference-screens.md) and their later propagation. It specifies the approved result, not the current implementation status. Historical calibration, screenshots, older references and existing UI do not override it. A later explicit Product Owner decision may supersede v1. Clean-Room, security, privacy, accessibility, domain contracts and the [business/freemium model](../../FREEMIUM-FEATURE-MATRIX.md) remain binding.

## 1. Delivery and value ownership

D1 retains the existing palette and self-hosted Literata / Instrument Sans direction. D2 changes composition and the purpose of boundaries. F1 establishes only the missing reusable roles; F2 establishes only the interaction contracts needed by these experiences. Follow the [implementation roadmap](implementation-roadmap.md); this document does not authorize a blanket CSS rewrite, new domain capability or new dependency.

- [Design tokens](../../../design/tokens.json) remain the sole value source. Consume them through platform adapters as specified in [Design System Delivery](../../DESIGN-SYSTEM-DELIVERY.md).
- `color.scheme.light` and `color.scheme.dark` are the current runtime palettes. Older printed `color.semantic` fallback values are not a competing palette.
- Existing spacing, radius, font, motion and color values should be reused. Add a semantic role only when a repeated purpose is missing; do not make one token for every margin or one component for every named surface below.
- A role described here can be an implementation gap. It is not evidence that the token, adapter or component already implements the contract. F1 must reconcile the source, adapters, examples and documentation together.
- Existing [Component Contracts](../../COMPONENT-CONTRACTS.md) continue to govern semantics, keyboard/focus, state ownership and accessibility. Apply their anatomy through v1's content hierarchy, not as a universal metadata-first arrangement.
- Web is the single product UI; Android packages it through Capacitor and adapts only platform mechanics (system bars, insets, Back).

## 2. Surface language

Start with content order, alignment and spacing. Add a boundary only when it explains one independent object, a meaningful group, an interaction layer or a consequence. Repeated white rounded rectangles with borders are not the default grammar.

| Role | Appropriate use and treatment | Boundary / misuse to avoid |
| --- | --- | --- |
| Bare page | Relationship context, headings, chronology and utility categories on the warm page ground; use alignment and section spacing | Do not box a section merely because it has a heading |
| Reading surface | Long memory prose or private notes on a neutral surface or bare ground, with comfortable line length | No permanent tint behind every paragraph; no nested paragraph cards |
| Content surface | One self-contained wish, text keepsake or independently understandable destination | A card must earn its boundary; no whole-feed or whole-form card |
| Emotional / tinted surface | One selected HeartMoment or meaningful highlight with a restrained semantic tint | No automatic rose background for settings, empty results or errors |
| Elevated surface | Floating navigation, contextual controls and transient menus | Depth denotes a different layer; ordinary feed items do not all float |
| Sheet | Short contextual choice or focused edit, attached to the bottom on Compact; title, visible Close and complete modal behavior | No sustained writing or long branching form squeezed into a sheet |
| Modal | Bounded consequence confirmation, with specific action and cancellation | No interruption for ordinary browsing or routine celebration |
| Hero | The single focal composition of the state, using actual image, words, person or intention | A hero need not be a box; no blank oversized frame when content is absent |
| Image-led surface | A real photograph with enough area to be experienced and normally a caption below | Do not reduce the primary memory to a utility thumbnail |
| Compact row | Agenda, settings, notifications or checklist items where scanning/checking is the human task; height grows with text | Do not squeeze authored prose into one line or lead with metadata |
| Timeline item | Actual date/month grouping with photo, prose and event variants in one ordered chronology | No feed card containing item cards; decorative spine does not carry chronology alone |
| Gallery | Several images belonging to one memory, with a meaningful lead/count and complete full view | No autoplay, hidden-only swipe navigation or misleading partial count |

Do not use a card for filter controls, a normal form page, settings category headings, standalone metadata, a one-line date, a paragraph already inside a bounded surface, or an entire Timeline. Ordinary content has no required shadow. Avoid nested cards; page ground plus one necessary content layer is normally enough. A modal is a separate temporary interaction layer.

## 3. Image language

Personal imagery normally outranks UI chrome. Use authorized content and existing media delivery; visual direction does not introduce stock photos into empty relationships, remote image services, inference or additional derivative generation.

- **Featured photography:** one image can carry the focal composition. About 16:10 is a useful featured ratio; 4:3 suits many feed photographs. Portrait content may use 3:4. These are composition defaults, not immutable crops or new upload requirements.
- **Ordinary personal photography:** ordinary quality, varied lighting and portrait orientation are valid content. Preserve its character; do not globally recolor, blur, darken in Dark mode or apply romantic filters.
- **Crop:** previews may use a deliberate cover crop; the full view must offer the complete original. Respect orientation and existing author-selected focus where supported. No automatic face-analysis feature is implied. If text would cover a face, place it below the image.
- **Edges:** focal media may meet page gutters; a deliberate edge-to-edge/fullscreen composition may be flush. Avoid losing usable image width to two layers of card padding. Media may use the existing large radius, independent content the card radius, and fullscreen images no radius.
- **Thumbnails:** appropriate in search, pickers and compact related-content rows, typically around 56–72 px at default text. They do not replace the main photo when remembering is the task.
- **Captions and overlays:** title, body and dates normally sit below. A short featured title may overlay a suitable photo only when arbitrary images and crops remain readable. Reuse existing media scrim behavior; a gradient alone is not proof of contrast. Use an opaque surface when contrast cannot be ensured. No body prose, badge wall or action toolbar over faces.
- **Several images:** show one image directly; for two, use an honest count or a meaningful pair; for larger sets, one lead plus a bounded set of previews and the true total. Always provide the complete gallery through visible controls, keyboard and touch.
- **Text-only memory:** give real words room to be read. Do not reserve photo height or insert a camera placeholder or missing-photo heading. Short excerpts may use editorial type; long prose uses body type.
- **Mixed memory:** choose the dominant content honestly, with supporting text/media after it. Keep one semantic item and one canonical detail. Preview and detail retain recognizable content identity.
- **Loading/failure:** reserve intended media proportions during loading. An image failure retains its caption, content link and relevant retry; it is distinct from no attachment. Use existing appropriate image sizes and progressive offscreen loading.
- **Accessible meaning:** supply the supported alternative description and an understandable link name; decorative imagery is hidden from assistive technology. Do not fabricate visual descriptions or repeat captions unnecessarily.

## 4. Typography language

Literata gives selected relationship meaning an editorial voice. Instrument Sans provides interaction and reading clarity. Both remain self-hosted; their provenance and licenses remain unchanged.

| Role | Direction | Meaning and limits |
| --- | --- | --- |
| Selected editorial display | Literata semibold; Compact reference around 32/38 | One short focal quote or chapter opening, not a mandatory banner on every page |
| Personal heading | Literata semibold; around 28/34 | Couple names or a meaningful short memory title; full title wraps in detail |
| Utility/task heading | Instrument Sans semibold; around 28/34 for pages, smaller for focused task bars | Navigation, planning, settings and precise tasks stay practical |
| Content title | Literata for a memory; Instrument Sans for plan/utility; around 22/28 | Role follows meaning, not the API of a generic card |
| Section heading | Instrument Sans semibold; around 20/26 | A scan point, subordinate to focal content |
| Reading/input body | Instrument Sans regular; at least 16/24 | Long prose, authored input, explanations and controls; no shrinking to fit phones |
| Supporting copy | Instrument Sans regular/medium; around 14/20 | Dates, author, help and privacy remain readable using compliant secondary text |
| Navigation labels | Instrument Sans semibold; around 12/16 at default text | Compact labels retain full touch targets and expand with text scaling |
| Buttons | Instrument Sans semibold; around 16/20 | Concrete verbs, no all-caps; pending labels retain context |
| Story statistics | Selective Literata emphasis; around 32–40/44 | Truthful category counts, never relationship quality scores |
| Practical dates/times | Instrument Sans with tabular figures where comparison benefits | Clear localized schedule, no decorative date ornament required |

These sizes describe the calibrated role hierarchy; implement reusable roles at the token boundary. They are not screenshot locks. Preserve the same body scale across 360/390/430 px. Long localized labels gain lines; 200% text must remain operable. A long thought becomes body prose instead of an enormous heading. No automatic decorative drop cap or complete narrative rendered as `h1`. Expanded can increase selected display emphasis while keeping body text and a reading measure of roughly 60–70 characters, within the existing reading-width limit. Semantic heading levels follow document structure independently of visual size.

## 5. Color philosophy and Light/Dark

D1 keeps the palette. Warm cream and deep aubergine create a recognizable ground; deliberate neutral areas let photographs and words speak. Typically one accent family dominates a local composition. Required warnings or privacy information never disappear to satisfy a color budget.

| Purpose | Existing role direction | Required use |
| --- | --- | --- |
| Page / reading / grouping | `background`, `surface`, `surfaceSubtle` in each runtime scheme | Distinguish the ground, readable content and subtle grouping without a full-page rose wash |
| Raised interaction | `surfaceRaised` and existing overlay roles | Use for actual elevated controls or sheets, not every object |
| Primary / supporting text | `textPrimary`, `textSecondary` | De-emphasize by placement and scale before reducing contrast |
| Filled primary action | Strong coral with the existing white on-accent pairing in both schemes | Do not substitute bright Dark coral while keeping white text |
| Links / selected text | Existing strong coral in Light; bright coral in Dark | Decorative brand coral is not automatically a safe normal-text color |
| Shared / confirmed | Shared and success roles, with clear text/icon | Mint has meaning; it is not arbitrary decoration |
| Private | Private roles plus explicit owner-only text and icon | Privacy is neither a pink page nor an error state |
| Error / warning / focus | Their existing semantic roles | Keep distinct meaning, understandable copy and recovery/focus behavior |

Essential small copy must not default to `textMuted`: the current Light muted/page pair fails normal-text contrast. The current Light decorative brand/page pair and white/bright-Dark-coral pair also fail that threshold. The [calibration evidence](audits/2026-09-15/visual-calibration.md) explains these measurements; they are not an application-wide accessibility result.

Validate actual rendered pairs in both themes: normal text at least 4.5:1, qualifying large text and essential UI graphics at least 3:1, plus visible focus. Do not infer contrast from a semantic name. Dark mode uses intentional surface luminance and outlines, retains original photo exposure and avoids stronger colored glow as a substitute for structure. Color is never the sole carrier of selected, private, error or confirmed state.

## 6. Shape, borders and depth

Reuse the existing radius vocabulary by purpose: `none` for flush content; `small` for small details; `medium` for compact controls; `large` for media, inputs and buttons; `card` for an independent content unit; `sheet` for sheet top corners; `hero` only for a justified large focal surface; `pill` for appropriate filters/tabs and identity shapes. No screen needs to demonstrate every radius.

- Separators aid scanning where adjacency is ambiguous; they are not required between every piece of content.
- Input boundaries and selected/focus indicators remain discernible. A decorative hairline cannot be the sole signal of an interactive target.
- Normally choose surface contrast or a subtle border. Do not stack border and shadow on every resting object.
- Use existing overlay elevation for floating navigation, sheets and menus. In Dark, distinguish surfaces instead of adding luminous colored shadows.
- Avoid nested content surfaces and rounded image frames inside rounded image frames. A sheet's rounding communicates its temporary layer, not a second card around its form.
- Preserve the existing focus role and necessary offset; rounded/clipped containers must not cut it off.

## 7. Layout rhythm and mobile ergonomics

Use a repeatable rhythm: **focal content → compact support → natural content → contextual continuation → breathing space**. This is a compositional grammar. A real upcoming item may precede a focal memory; chronology must not be reordered merely to alternate visual shapes.

- Related text uses the close spacing scale; image/caption and content groups use roughly 12–16 px; separate sections roughly 24–32 px. A major break up to 48 px needs useful content on both sides. Express repeated purpose through semantic aliases to existing spacing values.
- **D7:** use approximately 16 px page gutters below approximately 390 px, and 20 px at/above approximately 390 px through Compact, unless a deliberate edge-to-edge composition is justified. At 360/390/430 px this yields about 328/350/390 px usable width. F1 reconciles the current single gutter token with this approved rule.
- Content height follows content. Absent sections collapse; one item must look intentionally composed. Calm does not mean large empty frames or undersized content.
- Timeline remains one ordered column on phones. Discover can retain its existing varied, month-banded grid. Do not turn chronology into masonry.
- Optional horizontal media strips need a visible continuation cue, keyboard access and an explicit all-items destination. Core text, settings and primary navigation never require sideways discovery.
- Keep the root header compact and the four labeled destinations stable. Reserve the measured navigation height, safe area and content clearance; fixed spacers must not fail when labels scale.
- Primary completion stays within thumb reach and above keyboard/system insets without covering the focused field. If a sticky footer cannot fit safely, use normal flow.
- Expanded preserves the same task and sequence. Add larger media or useful context, not permanent management controls or obligatory three-pane layouts. Retain the current Web shell, which the Android wrapper also renders.

## 8. Motion language

Motion explains causality and preserves orientation. Reuse the existing 120 / 180 / 280 ms duration roles and easing, with 320 ms as the normal upper limit. Semantic state, focus and result ownership must work independently of animation.

| Interaction | Required feedback / restrained motion |
| --- | --- |
| Press or selection | Immediate visible response; optional fast settling, no delayed activation |
| Root navigation | Stable shell and modest content transition; no whole-page horizontal carousel |
| Opening content | Short transition when continuity is stable; no mandatory shared-image flight |
| Create / add media | Selected preview appears in a stable position; preparation and upload status belong to the affected file |
| Save | Immediate labeled pending state; confirmed result and concise status only after persistence is known |
| Completion | Brief confirmed state change; optional meaningful continuation, never compulsory confetti or forced capture |
| Sheet enter / exit | Emphasized enter and standard exit; focus containment, inert background, visible Close and focus restore remain mandatory |
| Filter / reorder | Explain changed scope or position; preserve browsing context; announce the result when useful |
| Gallery / image navigation | Brief transition following an explicit action; no auto-advance or decorative zoom |
| Success | Small non-blocking acknowledgment with a persistent understandable result; no reward loop |
| Delete / undo | Explain consequence; undo appears only with a real reversal contract and restores meaningful position/context |

Reduced motion removes translation, scale, parallax, shimmer and decorative effects. Instant changes or a short opacity transition retain the same status, focus, content, recovery and success information. Haptics may supplement feedback but never carry the only signal. No animation blocks the next useful action.

## 9. Form and input philosophy

**Do not expose the underlying data model as the user's interaction model.** Forms are correct for precise tasks; ordinary relationship capture should feel like keeping something meaningful.

| Mechanism | Prefer when | Contract |
| --- | --- | --- |
| Content-first composer | Photo, thought or shared intention is the task | Main content is visible immediately; metadata is secondary; do not require a title merely because storage has one |
| Inline input/edit | One short contextual addition or explicitly chosen correction | Suitable for checklist add/reply; existing content remains read-first rather than permanently editable |
| Full-screen compose | Sustained writing, media or multiple meaningful steps | Focused task header, content and one completion; root plus/navigation do not compete |
| Bottom sheet | Bounded contextual choices or a short edit | Visible title/Close and proper modal lifecycle; move to a page when keyboard/content makes it cramped |
| Picker | Photo, date/time, bounded known options or related content | Prefer platform controls; long content lists need recognition through names/previews and search |
| Chips | Current scope or quick optional context | Selection/removal is explicit; no hidden audience, validation or consequences |
| Segmented controls | Two to four peer modes, such as Discover/Timeline or Plans/Wishes | Shared tab semantics and visible selected state; not long-term primary navigation |
| Quick create | Entering a known capture task | Stable plus menu or labeled local entry opens the focused task directly; no hash-scroll to a distant form |
| Optional details | Supported enrichment that can wait | Title/context can be optional; the main narrative, consequential audience and usable date summary are not buried |
| Native date/time interaction | Choosing a supported schedule | Preserve localized summary and domain dependencies; reuse the progressive #952 controls |
| Explicit form | Settings, import/export, account/security or another precise multi-value task | Persistent labels, clear save model and visible consequences are appropriate |

Neutral photo-or-text entry must not summon the keyboard automatically. Writing intent does. Inputs remain at least the body size; placeholders supplement persistent labels. Use one clear save model per task: immediate switches announce the actual result; a staged form has one explicit Save. Do not mix them ambiguously.

Validation appears beside the affected input, and critical failure persists inline. Back/Close, route change, picker cancellation and resize must follow the same dirty/pending policy. Preserve in-session work until success is known; do not imply durable offline drafts, an outbox or background sync without an implemented contract. A late response cannot erase newer input. Explain uncertainty before retrying a potentially completed create. Consequential recipients, destructive effects and failures are never hidden under optional details.

## 10. Compose by content type

Share typography, spacing, media, audience and state mechanics. Do not force every domain through one generic Card renderer.

| Content | Primary composition | Supporting action / boundary |
| --- | --- | --- |
| Photo memory | Large actual image, title/caption below | Date/author/count follow; open the canonical memory/gallery |
| Text memory | Actual readable excerpt on page or quiet reading surface | Optional supplied title; date/author after words; no photo gap or whole narrative as heading |
| Mixed memory | One image-led or prose-led object | Remaining media and full text in detail; no duplicate feed entries |
| Plan | Shared intention and actual schedule; nearest plan may be focal | Read, then deliberate scheduling/completion; no Kanban, invented cover image or productivity score |
| Checklist | Readable text and a large check target, with inline Add | Editing/reordering/deletion are contextual; provide non-gesture reordering and truthful undo |
| Wish | A readable desire with existing supported image/link where available | Keep plan conversion and completion understandable; an undated plan stays a plan |
| Reminder | Event/person/time and truthful preference/delivery state | Open actual target or implemented setting; do not advertise unsupported channels |
| Statistic | One grouped story composition of truthful labeled counts | Correct destination and scope; no score, quota pressure or all-history total inferred from one page |
| Game | Clear invitation and premise with actual capability/prerequisites | Explicit start/resume/leave; Games remains under More and subject to its existing Premium boundary |
| Notification | Actor/action/content cue/time in compact readable rows | Read state and canonical destination; distinct from activity history and load failure |
| Private content | Natural photo/text/list shape with explicit owner-only context | Dedicated safe retrieval and editing; no private previews/counts in shared surfaces |
| Couple/shared content | Natural shared memory, wish or plan shape | Audience explicit at capture/detail and before changes; avoid repeated oversized badges in shared chronology |

## 11. State and review contract

All consumers distinguish first use, sparse valid content, filtered no-match, loading, unavailable permission/capability, read failure, write failure, offline availability, uncertain write, confirmed success and conflict. Reuse existing state components with explicit intent; one generic heart illustration does not explain all these states.

Keep loaded content during refresh/failure, preserve drafts during failed writes, and expose only authorized cache data. Unknown capability must not reveal edit actions by guess. Destructive operations retain authentication, consequences and confirmation; visual simplification does not weaken them.

Review each implementation through **open → interact → save/complete → observe result → return**, with exact-build visual evidence and the [reference acceptance matrix](reference-screens.md#shared-acceptance-and-mobile-contract). A screenshot alone cannot prove continuity. Further guidance remains in [UX Patterns](../../UX-PATTERNS.md), [Partner-App Experience Standard](../../PARTNER-APP-EXPERIENCE-STANDARD.md), [Cross-Cutting Quality](../../CROSS-CUTTING-QUALITY.md) and [Accessibility QA](../../ACCESSIBILITY-QA-MATRIX.md).

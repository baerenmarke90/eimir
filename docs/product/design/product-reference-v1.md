# eimir. Product Reference v1

## Status and authority

**Status:** normative; Product Owner approved.<br/>
**Decision date:** 2026-09-15.<br/>
**Decision and program owner:** [#955](https://github.com/baerenmarke90/eimir/issues/955).<br/>
**Scope:** product character, composition and interaction across couple-facing Web, which the Capacitor Android app packages unchanged; approved target direction, not a claim that remediation has shipped.

If historical audits, calibration proposals, screenshots, previous Product References, older issue wording or implementation details conflict with this document, **eimir. Product Reference v1 takes precedence unless a later explicit Product Owner decision supersedes it**. In particular, earlier near-1:1 expectations for Planning (#859) and Moments Timeline (#860) are superseded where they conflict. Historical evidence does not create an alternative design authority.

The [reference experiences](reference-screens.md) and [design-system direction](design-system-direction.md) are normative elaborations of this reference. The [implementation roadmap](implementation-roadmap.md) records the accepted sequence. The [authority register](README.md#authority-register) identifies the lower-level rules that remain binding. Clean-Room, security, privacy, tenant isolation, accessibility, provenance, licensing, engineering language and the business/freemium model are cumulative constraints; this reference cannot weaken them.

Changes to the direction require a linked explicit PO decision and an update to the affected normative documents. Record what is superseded and why. A screenshot refresh, component reuse or an implementation PR alone cannot redefine the product.

## Product North Star

> eimir. is a personal, living relationship album with familiar mobile interaction.
>
> Clarity without sterility. Warmth without kitsch. Personality without decoration for decoration's sake.

People, their photographs, words, shared memories and anticipation give the interface its identity. A couple should recognize their own life before noticing the machinery used to organize it. A meaningful photo can carry a view; a text memory receives equally deliberate reading space. Planning makes the next shared experience tangible. Utility remains clear and calm.

Calm means a composed sequence with useful detail, not vacant hero frames or missing functionality. Warmth comes from personal content, material rhythm, imagery, typography, purposeful color and restrained motion working together. Manufactured romance, stock couples, repetitive instructions and decorative hearts cannot substitute for those qualities. The product invites connection without streaks, relationship scores or guilt.

## Product principles

1. **Consumer product.** Begin with remembering, anticipating, sharing or finding; do not make couples administer records.
2. **Mobile First as product architecture.** Design the Compact task, action reach, keyboard and return path before Expanded layout. A desktop screen that merely reflows is insufficient.
3. **Established mobile patterns.** Use recognizable navigation, native pickers, labeled actions, contextual sheets and ordinary Back behavior. A custom mechanism needs a human-task justification.
4. **Recognition over Recall.** Show relevant state, audience, destination and available actions; do not depend on memorized gestures, hidden modes or unexplained icons.
5. **Content before Chrome.** Personal content receives more meaningful visual area than toolbars, banners or metadata.
6. **Progressive Disclosure.** Reveal optional complexity when needed while keeping privacy, pending state, errors and consequences visible.
7. **Emotional but mature.** Respect different relationships, moods and ways of expressing affection; utility and sensitive decisions need precision.
8. **Reuse good patterns, fix weak patterns, retire bad patterns.** Reuse outcomes that serve the task. Existing components are not proof of appropriate design.
9. **Accessible consumer experience.** Keyboard, assistive technology, large text, contrast and reduced motion are integral. Accessibility is not a reason to replace content with enterprise/admin presentation.

## Design DNA

| Rule | Binding implementation and review consequence |
| --- | --- |
| 1. Lead with the person or the meaning. | The first meaningful composition identifies whose experience, thought or intention matters here. Utility can lead with its practical task. |
| 2. Personal content gets the largest meaningful area. | A memory is not reduced to a small thumbnail beside a dominant control panel. Controls recede until needed. |
| 3. Compose by content type. | Photos, prose, plans, wishes, checklists and statistics retain distinct shapes and interaction priorities. |
| 4. Create, find and return form one promise. | Creation leads to the actual saved result, a recognizable home and a reliable return to the originating context. |
| 5. One dominant task per state. | Browse, read, compose, edit and confirm have clear boundaries; competing equal-weight action clusters fail review. |
| 6. Content → meaning → action → metadata. | Default reading order leads with content. Safety, privacy and critical failures may move forward when needed to understand a consequence. |
| 7. Reading comes before editing. | Opening an item opens its content; edit/delete/unlink controls are contextual, not permanent form fields around every item. |
| 8. Disclose complexity, never consequences. | Optional enrichment can wait; audience, validation, destructive effects and unsaved work cannot. |
| 9. A card must earn its boundary. | Use a boundary for an independently meaningful unit or destination. A heading, section, filter or date alone is not a reason for a card. |
| 10. Warmth is composed. | Content, material rhythm, imagery, type, purposeful color, motion and composition supply personality together. Decoration alone does not satisfy the rule. |
| 11. Planning feels like anticipation. | The next shared experience leads; operational status and management controls support it. |
| 12. Standardize proven outcomes. | Prove new primitives on bounded real journeys, then propagate them and retire obsolete mechanisms. Do not standardize a weak pattern because it is already common. |

## Interaction DNA

### Navigation and thumb reach

Keep four labeled destinations: the localized equivalents of **Wir, Momente, Planen, Mehr**. The central plus is an action, not a fifth destination. Games remain under More; Chapters belong to Moments even where a compatible URL retains a planning prefix. Profile and Settings have named, discoverable More entries; an avatar may remain a shortcut.

Primary Compact actions must remain comfortably reachable, with product targets of at least 44 CSS px on Web and 48 dp on Android. Respect safe areas, large text, small-height screens and the software keyboard. Do not hide primary actions behind horizontal discovery or hover. A focused composer uses task-specific Back/Close and completion controls so root navigation and global create do not compete with saving. Expanded preserves the same task and route meaning.

### Task boundaries and progressive disclosure

A content surface with one clear destination opens from the content itself, with proper link/button semantics. Nested controls remain independently operable. Read surfaces expose deliberate Edit/More actions. Editing preserves identity and offers explicit completion and cancellation; it does not silently mutate because an unrelated field loses focus.

Use a bottom sheet or contextual surface for a bounded choice, filters or short edit. Sustained writing belongs on a full task page. Every modal surface needs a name, initial focus, contained keyboard focus, inactive background, visible dismissal, Escape/Back behavior and focus restoration. On Compact bottom sheets, a centered grab handle may be the only visible dismissal chrome when that handle is itself an operable, named semantic control with a product-sized interaction target: pull-down is the primary touch gesture, while keyboard/assistive activation and Escape/Back remain available. Expanded centered modals keep an explicit close control. A nested sheet closes before the underlying task exits; dirty or pending work still follows the task lifecycle.

### Save, result and return continuity

The acceptance journey is **Open → interact → save/complete → observe result → return**. Show pending state immediately and prevent duplicate submission. Report success only after the authoritative operation confirms it. Open or identify the actual created resource; do not send the user to an unrelated overview with only a disappearing toast. Partial media failure must not masquerade as complete success or discard usable input.

Visible Back and browser/system Back must agree about the originating destination, selected tab, applied scope and meaningful position. Preserve valid same-account, same-Space context across detail/edit visits. Validate supplied return destinations; an untrusted or absent origin uses the canonical content home. Deep links must remain usable without prior browsing history. Do not put sensitive draft/query content into URLs, logs or cross-account state.

### Draft and interruption safety

Retain entered content during failure, picker cancellation, resize and normal in-task interruptions. Dirty exits offer an understandable choice; pending operations have explicit exit behavior. Clear only the successfully submitted draft, never text typed after that submission. Lost authorization, sign-out and account/Space changes must not leak drafts into another context.

The baseline is bounded in-memory task state and supported offline reads. Durable drafts and offline write synchronization are not promised by this reference. Before adding persistence, a slice must decide storage, privacy, lifetime and clearing semantics under the existing architecture. Offline copy must state when nothing has been saved.

### Scope and filtering

Show the active period/type/filter scope outside collapsed controls. Opening a filter surface must not apply an accidental intermediate selection; Apply/Cancel or immediate application needs a clear, consistent contract. Clearing filters restores a recognizable default. Discover and Timeline must not inherit hidden filters from one another. Return from content preserves the scope that led to it, including a sparse or empty result.

### Feedback and recovery

Distinguish initial, loading, empty, no-match, unavailable, offline, failed, pending and confirmed-success states. A failed request is never an empty collection or a fabricated zero. Retain usable cached content during refresh failure and explain its freshness. Give errors an actionable recovery without erasing input. Use non-blocking feedback and announce meaningful state changes to assistive technology.

Undo is offered only with a real reversal/restore contract. Otherwise explain destructive consequences before confirmation. Motion reinforces the same visible result and focus behavior; reduced motion removes translation/scale and retains all information and actions.

## Visual language

The complete role contracts are in [Design-system direction](design-system-direction.md). These are binding principles, not a second token catalogue:

- **Surfaces:** start with bare page and readable content; use tint for selected emotional emphasis and elevation for a different interaction layer. Avoid repetitive white rounded rectangles with borders.
- **Images:** authorized personal imagery normally outranks chrome. Preview crops preserve content; full viewing permits the whole image. No photo changes the composition to text, not to a photo-shaped gap. Mixed media has a clear lead and honest gallery access.
- **Type:** Literata supplies selected relationship/editorial meaning; Instrument Sans supplies navigation, controls, utility clarity and readable long prose. Do not turn long authored text into a display heading.
- **Color:** retain the current palette, using emotional, neutral, interactive and semantic roles deliberately in both themes. Keep imagery natural in Dark. Quiet text must remain readable; color alone cannot convey a state.
- **Shape/depth:** radii follow roles; separators help scanning; borders identify necessary boundaries; shadows indicate elevation. Avoid nested containers and clipped focus outlines.
- **Rhythm:** focal content → compact support → natural content → contextual interaction → breathing space. Content, chronology and urgency determine the exact order; do not repeat identical cards to fill a page.
- **Motion:** restrained, causal navigation, content opening, creation, saving, completion, sheet/image transitions, success and genuine undo. Never block the next action or require motion to understand an outcome.

Reusable visual values belong in [semantic tokens](../../../design/tokens.json) and platform adapters. Role guidance is not permission for scattered component literals or blanket CSS replacement. D7's approved target does not claim the current adapter already implements it.

## Form and input philosophy

> Do not expose the underlying data model as the user's interaction model.

Forms are allowed when they serve the task. A settings, account/security or precise configuration task may need an explicit labeled form. An ordinary memory starts with a photograph or words, not a metadata checklist.

| Mechanism | Choose it when |
| --- | --- |
| Content-first composer | Capturing a memory, thought or idea; personal content is visible immediately. |
| Full-screen compose | Writing is sustained, media needs space, or multiple meaningful steps need one protected task. |
| Inline editing | One small contextual action, such as adding a checklist item or writing a reply; not permanent editing of every existing row. |
| Bottom sheet | A bounded contextual choice or short edit fits comfortably with keyboard and large text. Escalate to a task page when it does not. |
| Picker | Selecting photos, known content, dates or times; use familiar native/platform interaction and recognizable choices. |
| Chips | Showing active scope or quick optional context; never hide privacy or errors inside them. |
| Segmented control | Switching a small set of peer modes with complete keyboard and selected-state semantics. |
| Quick create | Entering a known type-specific capture task directly, not jumping to a distant embedded form. |
| Optional details | Enrichment that can wait; narrative content, audience and consequences are not optional disclosure. |
| Explicit form | Precision and consequence require labeled fields, review and validation. Keep fields proportional to the human task. |

Do not activate the keyboard before a neutral photo-or-text choice. Keep input text at a readable scale, labels persistent and Save reachable above the keyboard or in a safe normal-flow footer. Minimize typing through sensible defaults without inventing data. Optionality follows existing domain contracts: a shared Memory does not gain a private toggle merely because another type supports one.

## Compose by content type

| Content | Expected presentation and interaction |
| --- | --- |
| Photo memory | Large meaningful image, then title/caption, context and canonical detail/gallery; management is secondary. |
| Text memory | Readable authored words with editorial emphasis only where brief; no missing-photo decoration. |
| Mixed memory | A chosen image or prose lead with supporting media/text and truthful gallery count. |
| Plan | Experience/intention first, understandable date/range next; contextual schedule/status/completion, no permanent management form. |
| Checklist | Checkable items and quick add; explicit edit/organize mode, accessible reorder, safe failure recovery. |
| Wish | An idea with breathing room and an obvious optional next step toward a Plan; not a status dashboard. |
| Reminder | What and when, with understandable scope, channel/quiet-hours context where supported and honest delivery state. |
| Statistic | Truthful grouped reflection with meaningful category links; no relationship score, fabricated count or KPI wall. |
| Game | Recognizable invitation/session/result and safe return, respecting existing capability and content-eligibility boundaries. |
| Notification | Actor/action/content meaning before read-management; safe canonical target and distinct unavailable/error states. |
| Private content | Content appropriate to its type plus a clear owner-only label; no existence leakage through counts, previews or shared discovery. |
| Couple/shared content | Shared meaning and relevant authorship remain recognizable; editing rights follow actual capabilities, not an assumed symmetry. |

These are composition roles. They do not authorize new domain features, a universal Card abstraction, broader sharing or new entitlement boundaries.

## Accepted Product Owner decisions D1–D8

All eight decisions are **accepted by #955**; their implementation remains tracked separately.

| ID | Accepted direction | Review implication |
| --- | --- | --- |
| D1 | Retain current palette and font direction as the base. | Evolve roles and album composition; no wholesale visual identity reset. |
| D2 | Break repetitive card walls. | Natural content shapes and purposeful surfaces replace mandatory section wrappers. |
| D3 | Content-first capture. | Photo/text first, optional enrichment, visible outcome and safe task lifecycle. |
| D4 | Explicit, predictable Timeline scope and return. | Visible filters/period, separate Discover scope and preserved originating context. |
| D5 | Planning is anticipation first. | Upcoming shared experience leads; preserve useful capability and #952 schedule improvements. |
| D6 | Profile/settings stay discoverable. | Named More entries and predictable utility navigation; avatar-only discovery is insufficient. |
| D7 | Approximately 16 px gutters below ~390 px and 20 px from ~390 px upward within Compact. | Deliberate edge-to-edge content is allowed; encode the mapping centrally, with proportional native units and safe-area treatment. Expanded uses the same hierarchy with suitable width. |
| D8 | Foundations → capture → moments → planning → today → utility → propagation/cleanup. | F1 → F2 → R1 → R2 → R3 → R4 → R5 → P1 → P2 → C1. The former P3 native-screen parity slice is retired by ADR 0011; follow the roadmap dependency details. |

## Five reference experiences, not pixel locks

[R1–R5](reference-screens.md) define hierarchy, composition, interaction model, content priority, surface usage, visual rhythm and mobile behavior. They are not immutable screenshots. Implementation may improve richness and detail while preserving content dominance, Mobile First, hierarchy, accessibility, predictable interaction and this Design DNA. Calm reference areas must not become empty or sterile implementation.

R1 captures a new moment; R2 browses and rediscovers history; R3 expresses anticipation; R4 is the emotional entry point now; R5 provides calm, recognizable utility. Mobile Web is the normative implementation; the Capacitor Android app reuses these screens and adapts only platform affordances such as system bars, insets and Back.

## Review and final acceptance

Before UI code, each slice records its Mobile Interaction Contract or Product Design Preflight under the [Partner-App Experience Standard](../../PARTNER-APP-EXPERIENCE-STANDARD.md), references the applicable R1–R5 contract, inventories reusable patterns and records business/freemium and cross-cutting consequences. Existing functional tests do not approve a new design automatically.

For every material journey, review **Open → interact → save/complete → observe result → return**, including failures and interruptions. Capture representative empty, sparse, dense, loading, error/retry, offline and success states where applicable. Validate around 360/390/430 px, 320 CSS px reflow, small height, large text, keyboard/assistive technology, Light/Dark, reduced motion and relevant Expanded layouts. Ordinary Web product changes require no separate native-screen acceptance because the same React/Vite UI ships through Capacitor. Real-device evidence is required when a change touches the Capacitor wrapper or a native platform capability. Record exact commit/build and evidence limits.

[#946](https://github.com/baerenmarke90/eimir/issues/946), including its intuitive-mobile-interaction addendum, is the final product gate. It must use this v1 direction and the current normative extensions rather than reconstructing superseded references. Screenshots alone and green CI alone cannot establish product acceptance. Documentation adoption does not complete #955 or #946.

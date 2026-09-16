# eimir. Component Contracts

**Status:** Binding product foundation  
**Version:** 1.2<br/>
**As of:** September 15, 2026

Component Contracts describe the behavior and meaning of shared UI building
blocks independently of the technical framework. WebApp and smartphone app may
use different implementations, but they must satisfy the same contracts.

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 1. Contract structure

Every component documents:

1. **Purpose** – which problem it solves.
2. **Anatomy** – required and optional parts.
3. **Variants** – deliberately supported variants.
4. **States** – visible and interactive states.
5. **Behavior** – input, output, and transitions.
6. **Accessibility** – name, role, focus, and operation.
7. **Content** – rules for labels and error messages.
8. **Analytics** – allowed events without sensitive content data.

New visual variants are added only when they express a new meaning or
interaction.

## 2. Shared state models

```text
LoadState       = idle | loading | content | empty | error | offline
SyncState       = local_draft | submitting | synced | failed | conflict
PrivacyClass    = SPACE_SHARED | OWNER_ONLY | TEMPORARY_SHARED | EPHEMERAL_CONTEXT | SYSTEM_METADATA
PermissionState = unknown | explaining | requesting | granted | denied | blocked
ActionState     = idle | submitting | success | error
```

- `LoadState` describes loading a view.
- `SyncState` describes persistence of already visible content.
- `PrivacyClass` describes the domain access class. Presentation shortcuts such
  as `private` and `shared` are not API values.
- States are not collapsed into an ambiguous boolean such as `isLoading` when
  multiple transitions are possible.
- Error states expose a stable technical error code and a human-readable
  message.

## 3. Action components

### 3.1 Button

**Purpose:** Triggers one clearly named action.

**Variants:**

- `primary` – the single visually dominant action for the current view/state; sections do not each gain an equally dominant action.
- `secondary` – important alternative.
- `tertiary` – lightweight contextual action.
- `destructive` – potentially irreversible action.

**States:** `default`, `hover`, `focus`, `pressed`, `disabled`, `submitting`,
`success`, `error`.

**Contract:**

- The label should start with a verb where possible; de-DE example:
  **„Erinnerung speichern“**.
- A button does not change width while loading.
- `submitting` prevents duplicate activation and exposes understandable textual
  activity.
- `disabled` does not replace validation or permission explanations.
- Minimum target size: 48 dp in the app, 44 CSS px on Web.
- The accessible name matches the visible label or meaningfully extends it.

### 3.2 Icon Button

- Used only for established, frequent actions such as close, back, search, or
  overflow.
- Always has a tooltip on Web and an accessible name on every platform.
- Critical or uncommon actions also include text.
- Badge, icon, and status do not change the interactive target size.

### 3.3 Link

- Navigates to a destination; a button changes state or triggers an action.
- Links remain identifiable through text styling, contextual underlining, or an
  additional distinguishing characteristic.
- External destinations and downloads are announced when their behavior would
  otherwise be surprising.

## 4. Input components

### 4.1 Text Field and Text Area

**Anatomy:** label, input, optional help, character counter, status, and error
message.

- The label remains visible; a placeholder does not replace a label.
- Validation occurs no later than field exit and again on submission.
- An error explains both the problem and the correction next to the field.
- Input type, autocomplete, and virtual keyboard match the content.
- Text Area grows to a defined maximum height and then remains scrollable.
- Sensitive content is not logged or prefilled without a documented purpose.

### 4.2 Selection controls

- Checkbox: multiple independent options.
- Radio Group: exactly one option from a manageable set.
- Switch: immediately effective on/off state; not a form-submission mechanism.
- Select/Combobox: larger or searchable set of options.
- Segmented Control: two to four equivalent views or modes, not long-term
  navigation.

### 4.3 Date, Time, and Duration

- Platform-native selection is allowed if result format and validation remain
  equivalent.
- Time zone and all-day events are handled explicitly.
- A human-readable summary appears before saving.

## 5. Navigation components

### 5.1 Navigation Item

**Anatomy:** icon, visible label, optional badge, active indicator.

- States: `default`, `hover`, `focus`, `active`, `disabled`.
- Active state is not conveyed by color alone.
- Order and naming are stable across platforms.
- An item leads to a place, not to a one-time action.

### 5.2 Tabs

- Switch between peer content within one area.
- The active tab is programmatically identifiable.
- Arrow-key behavior follows the native platform pattern.
- Tabs do not wrap across multiple rows; if space is insufficient, simplify the
  information model instead.

### 5.3 Breadcrumbs

- Web only and only from at least three understandable hierarchy levels.
- Supplement primary navigation and never replace the page title.

## 6. Content components

### 6.1 List Item

**Anatomy:** title, optional metadata line, leading visual, trailing status or
action.

- The whole row may open one single primary destination.
- Additional actions are separately focusable and clearly named.
- The title is limited to two lines; full content remains available in detail.
- Selection, unread, and sync states are distinguishable.

### 6.2 Content Card

- A card summarizes one meaningful bounded object or action, not decoration alone. It is not the default abstraction for photos, thoughts, plans, statistics, or every section; choose the content-type composition and surface role from Product Reference v1 first.
- Nested cards are not allowed.
- Clickable cards have visible focus and exactly one primary destination.
- Secondary actions live in a clearly separated area.
- Card radius, padding, and shadow come exclusively from tokens.

### 6.3 Timeline Item

- Leads with photo, text, or mixed content according to its meaning. Date, author, content type, visibility, and sync state remain available at the appropriate hierarchy; critical privacy or save state is never hidden. Metadata is not a required leading row on every item.
- The visual line is decorative; semantic order remains in document flow.
- Multiple events on the same day may be grouped without losing individual
  targets.

### 6.4 Checklist Row

- Checkbox and text form one understandable control.
- Completed entries remain readable and can be reopened.
- Concurrent online changes use `version`; conflicts never overwrite silently.
- Delete is available through a menu and may additionally be exposed as a
  gesture.

### 6.5 Product Reference v1 visual roles

These are additive platform adapter roles, not a universal content renderer.
The [F1 delivery and evidence](product/design/f1-visual-foundations.md) records
the concrete APIs, usage, existing consumers and validation scope.

- Personal/content headings use the existing editorial family selectively;
  utility headings, authored prose, support and actions use the UI family.
  Semantic heading levels follow reading order independently of visual size.
- Supporting text uses a compliant secondary-text role. Link text uses the
  scheme-appropriate strong/bright coral pairing; filled actions retain
  strong coral and on-accent. Existing legacy consumers are not silently
  reclassified as migrated.
- Page, readable content, meaningful tint and raised overlay retain separate
  purposes. Spacing and content order normally separate sections; an ordinary
  photo/text item does not gain a resting shadow or nested card boundary.
- Media uses the existing large radius, independent bounded content the card
  radius and sheets the sheet radius. Caption text remains readable below the
  image. A full image view exposes the complete image; absent media differs
  from loading or failed media.
- Compact page gutters resolve to the tokenized narrow or comfortable value
  from available width. Resizing does not reset content/selection. Insets and
  keyboard protection remain platform responsibilities.
- Fast feedback, ordinary transitions and contextual reveals use existing
  duration/easing roles. Reduced motion retains status, meaning and actions.

The internal Web fixture and Android debug Activity exercise photo, text,
utility, loading/error/retry and overlay roles with synthetic data. Their
detail/return and fixture-completion actions demonstrate the bounded proof;
they do not implement production capture, persistence or F2 task lifecycle.
Do not expose these fixtures as a public product destination or infer that
R1–R5 have been migrated from their presence.

## 7. Privacy and status components

### 7.1 Visibility Control

**MVP values, when supported by the domain:** `OWNER_ONLY`, `SPACE_SHARED`.

- Shows icon and text. Intentional de-DE product labels are **„Nur für mich“**
  and **„Für uns beide“**.
- Display state uses a chip/status; forms use a real selection control.
- Changing visibility explains recipients and effect.
- Pink denotes private/protected context and green denotes shared context;
  textual indication remains mandatory.
- Memory, Wish, and Plan show their status only; the current Core does not allow
  changing their privacy class. HeartMoment may offer both MVP values.

### 7.2 Status Badge

- Supported categories: `info`, `success`, `warning`, `error`, `private`,
  `shared`.
- Badges contain at most two short words or one number.
- Status is not conveyed by color alone.
- Badges are not clickable; interactive filter chips are a separate component.

### 7.3 Sync Indicator

Intentional de-DE product copy:

- **„Wird gespeichert“**
- **„Gespeichert“**
- **„Aktion nötig“**
- for a failed offline write attempt: **„Noch nicht gespeichert“**

`Synced` may visually recede after a short time. `failed` and `conflict` remain
visible until resolved or deliberately discarded.

## 8. Overlay components

### 8.1 Dialog

- Has a title, understandable content, a primary action, and an optional
  secondary action.
- Focus starts on the first meaningful element, remains trapped inside the
  dialog, and returns to the trigger afterward.
- Escape/Back closes only when no critical changes would be lost.
- Destructive confirmations name the object and consequence.

### 8.2 Bottom Sheet

- Used on Compact for short selections or contextual actions.
- Has a clear heading and a visible close option.
- Drag-to-dismiss is supplementary only; keyboard and screen reader support
  remains complete.
- Long or complex flows move to a dedicated page.

### 8.3 Side Pane

- Used from Medium upward for details, preview, or short editing.
- Width follows layout tokens; content has its own scrollable region.
- Closing restores focus and list selection.

## 9. Feedback components

### 9.1 Inline Message

- Preferred for persistent errors, warnings, and blocking information.
- Appears near the affected content and offers a concrete action when needed.
- The message contains problem, impact, and next step.

### 9.2 Snackbar

- For brief, non-critical confirmation or a reversible action.
- At most one action; de-DE example: **„Rückgängig“**.
- Critical errors and required decisions are never shown only here.
- Duration accounts for reading length and assistive technologies.

### 9.3 Skeleton, Empty State, and Error State

- Skeleton matches the expected content shape and uses subtle animation.
- Empty State distinguishes first use, empty search, and missing permission.
- Error State offers de-DE **„Erneut versuchen“** when retry is meaningful.
- Existing content is not removed because of background errors.

## 10. Media components

### 10.1 Media Tile

- Shows preview, type, upload status, visibility, and alternative description.
- Failure and retry are per file.
- Crop and editing never modify the original without making that clear.
- Videos have a poster frame, duration, and subtitle status.

### 10.2 Avatar Pair

- Two people are represented equally; neither is visually dominant by default.
- Initials or neutral placeholders are available when no photo exists.
- Status or role is supplemented with text when relevant.

## 11. Relationship components

These signature building blocks represent the core relationship-first identity of `eimir.`, ensuring that partnership is woven natively into the interface rather than treated as a peripheral profile setting.

### 11.1 PartnerAvatarPair

**Purpose:** Renders the two partners of a shared space as an interconnected unit with overlapping circles and connection state.

- **Anatomy:** Primary user circle, overlapping secondary circle (partner or waiting invitation placeholder), connection status pip.
- **Variants:** `connected`, `waiting` (partner pending/invitation slot), `offline`.
- **States:** Default, hover/press on invitation slot, disabled.
- **Accessibility:** Group container provides a composite accessible description combining user and partner names or announcing pending invitation status. Interactive invitation triggers use `role="button"` and clear accessible labels.
- **Tokens:** Overlap offset derived from size (`-28%`), border uses `--color-surface` / `eimir.Theme.colors.surface` for crisp visual separation.

### 11.2 CouplePresence

**Purpose:** Anchors the top of the relationship home view (`/today`), presenting shared space identity, partner presence, and milestone duration.

- **Anatomy:** `PartnerAvatarPair`, space name heading, live status pip with descriptive text, relationship duration link, and optional contextual action slot.
- **Variants:** `connected` (shared status), `waiting` (brand invitation prompt), `offline` (subtle muted indicator).
- **Behavior:** Clicking the relationship duration navigates to the relationship milestone details.
- **Accessibility:** Headings use appropriate levels (`titleLarge`), interactive duration triggers announce their action explicitly.
- **Tokens:** Use existing semantic typography, spacing, and identity tokens. The relationship masthead does not require a bounded elevated card; a radius, border, or elevation is used only when its selected v1 surface role needs that boundary.

### 11.3 ThinkingOfYouButton

**Purpose:** A tactile, low-friction micro-interaction to send an affectionate impulse to the partner.

- **Anatomy:** Heart glyph (`♥`), state text, tactile press scaling, and confirmation checkmark (`✓`).
- **Variants:** Standard (text and icon), compact (icon-only for condensed toolbars).
- **States:** `idle`, `sending` (pulsing animation, disabled interaction), `sent` (optimistic confirmation, transitions back to idle after 2.5s).
- **Accessibility:** Explicit button role and localized action description. Reduced-motion queries disable heartbeat and spring animations.
- **Haptics:** Android implementation performs tactile haptic feedback (`LongPress`) on trigger.

### 11.4 VisibilityBadge

**Purpose:** Communicates the exact access and privacy domain of an item (shared space vs. private draft vs. temporary shared view).

- **Anatomy:** Purpose-built vector glyph (interlocking rings, padlock, clock) and localized label.
- **Variants:** `SPACE_SHARED` / `shared`, `OWNER_ONLY` / `private`, `TEMPORARY_SHARED` / `temporary`.
- **Sizes:** `small`, `medium`.
- **Accessibility:** Uses `role="status"` with explicit aria-labels matching privacy terminology. Icons are scalable vector drawings without dependence on platform-specific emoji fonts.
- **Tokens:** Colors map strictly to semantic token roles (`--color-shared`, `--color-private`, `--color-discovery`).

## 12. Analytics contract

Allowed events include:

```text
screen_viewed
primary_action_started
primary_action_completed
primary_action_failed
permission_explained
permission_result
sync_conflict_opened
```

Free text, search text, message content, image content, exact private dates,
direct resource IDs, and other sensitive user content are not allowed.
Technical/pseudonymized references are transmitted only for a documented
purpose and never as content characteristics.

## 13. Definition of Done

A shared component is ready when:

- its contract, variants, and states are documented,
- Design Tokens are used instead of local values,
- Web keyboard operation and focus behavior are verified,
- screen-reader name, role, and status are correct,
- large text and text zoom work,
- Compact and Expanded layouts are verified,
- Error, Disabled, Loading, and Offline states are covered,
- privacy and analytics consequences are resolved,
- visual regressions are automated or reproducibly testable.

## Related documents

- [Design Principles](./DESIGN-PRINCIPLES.md)
- [Information Architecture](./INFORMATION-ARCHITECTURE.md)
- [UX Patterns](./UX-PATTERNS.md)
- [Screen Templates](./SCREEN-TEMPLATES.md)
- [Design Tokens](../design/tokens.json)
- [API/UI Contracts](./API-UI-CONTRACTS.md)
- [Design System Delivery](./DESIGN-SYSTEM-DELIVERY.md)

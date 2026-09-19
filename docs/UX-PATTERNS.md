# eimir. UX Patterns

**Status:** Binding product foundation  
**Version:** 1.4<br/>
**As of:** September 15, 2026

This document defines recurring interaction patterns for the WebApp and
smartphone app. Both surfaces share the same information architecture,
semantics, and state logic. Concrete presentation adapts to platform, window
width, and input method.

The patterns below are platform-appropriate defaults, not a mandatory formula: the human task decides the pattern, and a table/list/master-detail composition is used only when it is genuinely the correct interaction for that task (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` sections 0 and 16).

[Product Reference v1](./product/design/product-reference-v1.md) is the normative current product-design direction approved in [#955](https://github.com/baerenmarke90/eimir/issues/955). It governs conflicting older design guidance, screenshots, issue wording, and implementation details unless a later explicit Product Owner decision supersedes it. This document remains binding for its compatible lower-level rules; privacy, security, accessibility, business/entitlement, and technical contracts are not weakened. See the [authority and legacy-reference register](./product/design/README.md).

## 1. Core rules

1. **Same task, same terminology.** A feature uses the same product term on all
   platforms.
2. **Platform-appropriate, not pixel-identical.** Navigation, dialogs, and
   gestures may differ as long as meaning and result remain equivalent.
3. **Privacy is visible.** Private and shared content is clearly identified
   before, during, and after an action.
4. **Current state is observable.** Loading, saving, synchronization, offline
   state, and errors are never hidden.
5. **One primary action per view.** Additional actions are visually secondary.
6. **No dead ends.** Every empty or error state provides a meaningful next step.
7. **Progressive disclosure.** Frequent tasks remain directly accessible;
   uncommon options appear contextually.
8. **Established interaction patterns first.** Common smartphone tasks use
   platform/mobile conventions such as Back, Bottom Navigation, native/system
   pickers, contextual Bottom Sheets, overflow actions, and system sharing unless
   the documented human task requires a different pattern. eimir. differentiates
   through relationship meaning, content, composition, language, imagery, and
   brand treatment rather than by reinventing standard mechanics.
9. **Recognition over recall.** Normal tasks do not depend on memorized gestures,
   hidden modes, unexplained icons, or internal/domain terminology. Important
   state and available actions remain discoverable in context.
10. **Minimize typing and keyboard burden.** Free text is required only when the
    user's actual content is textual or no lower-friction equivalent exists.
    Prefer direct selection, appropriate native pickers, media, sensible defaults,
    and progressively disclosed optional details where the domain permits it.
11. **Direct interaction before redundant controls.** Where safe and
    understandable, the content itself is the primary interaction target. Avoid
    redundant `Open`, `Details`, or `Edit` controls when selecting the content
    naturally performs the expected action; secondary actions remain explicit and
    accessible.

## 2. App Shell and navigation

| Window class | Primary navigation | Secondary navigation | Detail view |
|---|---|---|---|
| Compact, up to 599 px | Bottom Navigation with at most 5 destinations | contextual tabs, filters, or task-appropriate navigation | new page |
| Medium, 600–839 px | Bottom Navigation | task-appropriate local navigation | new page or optional supporting pane |
| Expanded, from 840 px | Web horizontal header (also inside the Android wrapper) | local navigation in content area | full page or justified supporting pane |

The Web header follows the accepted [A1 shell decision](./design/eimir/SHELL-RESCUE-A1.md); the Android wrapper renders the same Web shell ([ADR 0004](./decisions/0004-android-uses-bottom-navigation-at-every-size.md) is historical). Product Reference v1 governs content hierarchy and interaction outcomes; it does not reintroduce a sidebar or require a pane at a particular width.

- Primary destinations are the intentional de-DE product labels **Wir, Momente,
  Planen, Mehr**. Discovery experiences remain product behavior inside `Momente`
  and do not consume a persistent primary-navigation slot. `Spielen` is a
  first-class product area entered under `Mehr`; while inside Games, `Mehr`
  remains the active primary destination. See
  `docs/INFORMATION-ARCHITECTURE.md`,
  `decisions/0009-games-primary-navigation-and-premium-capability.md`, and
  `decisions/0010-games-secondary-navigation-under-more.md`.
- Search and Activity are not primary destinations. Search is a global utility
  in the header/app bar; Activity lives underneath the personal account
  navigation (`/today/activity`).
- The active destination is identifiable through shape, color, and text state,
  never through color alone.
- Badge counts are used only for current, actionable information.
- On Web, every primary function is keyboard-accessible and focus remains
  visible.
- Back navigation stays inside the current workflow rather than unexpectedly
  returning to the start.

## 3. Canonical interaction patterns

| Task | Smartphone | WebApp |
|---|---|---|
| Primary navigation | Bottom Navigation | Compact/Medium Bottom Navigation; Expanded horizontal header |
| List and detail | separate pages | focused page or justified List-Detail layout |
| Short input | Bottom Sheet or Dialog | Dialog or Side Pane |
| Long form | dedicated page | dedicated page or wide Side Pane |
| Filters | Filter Sheet | Popover or persistent filter bar |
| Context actions | Overflow menu; gestures supplementary only | Overflow or context menu |
| Confirmation | Dialog for high-risk actions | Dialog for high-risk actions |
| Feedback | inline plus Snackbar when useful | inline plus Snackbar when useful |

These are defaults, not permission to force every domain into list/form UI. The
human outcome and the partner-app standard decide whether a list, feed, media
composition, focused capture flow, picker, sheet, or another established
pattern is appropriate.

### 3.1 List–Detail

- One row or card opens exactly one detail object.
- The row/card itself is the primary open target when that is the natural mobile
  interaction; an additional `Open` button is normally unnecessary.
- Selection state remains visible on wide layouts.
- Filters, sorting, and scroll position are preserved when navigating back.
- On Compact, detail replaces the browse surface; on Expanded, the browse surface may remain visible only when it supports the same human task. Reading does not expose editing controls by default.
- Direct links open the target object and activate the appropriate navigation
  context.

### 3.2 Create and edit

- Start from the human capture task rather than the persistence model. A Memory
  may begin with media, a HeartMoment with a thought, and a plan with the shared
  intention; a generic title-first field stack is not the default.
- Choose content-first compose, inline editing, a picker, or a contextual sheet from the task. Field count alone does not justify a form. Explicit forms remain appropriate for structured tasks such as settings or account setup.
- Long, branching, or media-heavy capture: a dedicated page. Create and edit are distinct tasks; reading comes before editing.
- Request only information required for the current step. Optional metadata is
  progressively disclosed and must not delay the primary capture unnecessarily.
- Prefer appropriate native/system pickers and direct selections to free-text
  entry for dates, times, media, bounded choices, and permissions.
- Do not focus a text field or summon the software keyboard merely because a
  screen contains optional text input. Keyboard appearance follows user intent,
  and the completion action remains reachable while the keyboard is visible.
- Required fields are marked textually; errors appear next to the affected
  field.
- Changes are autosaved only when the state is unambiguous, visible, and
  recoverable.
- If unsaved changes exist, the app asks before leaving.
- After successful creation, show the persisted result and make it easy to find again. Return to the originating product context with scope, filters, selection, and scroll restored where applicable; explicitly offer a way to see the new item if the current filter excludes it. A success toast alone is insufficient continuity.

### 3.3 Dialog, Bottom Sheet, Side Pane, or page

| Pattern | Use for | Do not use for |
|---|---|---|
| Dialog | irreversible decision, short confirmation | multi-step forms |
| Bottom Sheet | mobile selection, short contextual action | critical long-form text |
| Side Pane | Web detail, preview, short edit | central full-screen task on Compact |
| dedicated page | focused, complex, or shareable task | single yes/no question |

Use the platform's established implementation of these patterns where available.
A custom interaction requires a documented reason when an equivalent conventional
pattern already solves the task.

### 3.4 Search, filters, and sorting

- Search starts only after meaningful input or a short delay; in-flight requests
  are replaced.
- Active filters are visible as removable chips.
- The intentional de-DE label **„Zurücksetzen“** appears only when at least one
  filter is active.
- Result count and empty-search state explain the outcome.
- Sorting changes no data and remains clearly distinct from filtering.
- Search terms, filters, and sorting remain available throughout a session.

## 4. States for every data-driven view

Every data-driven component and screen supports these states:

| State | Presentation | Primary response |
|---|---|---|
| Initial | stable base structure | no action yet |
| Loading | Skeleton matching expected content | wait for content |
| Content | actual content | perform core task |
| Empty | explain cause and value | create or discover content |
| Error | understandable cause where known | retry |
| Offline | last authorized read cache plus timestamp/age | read; clearly block writes |
| Syncing | subtle persistent status | continue working |
| Conflict | explain differences and consequences | consciously choose a version |

- A spinner alone does not replace a stable loading state.
- Existing content remains visible during background refresh.
- Critical errors are inline; a Snackbar alone is insufficient.
- Success feedback disappears automatically when no further action is needed.

## 5. Saving, synchronization, and undo

- Safe reversible changes may be represented optimistically.
- If saving fails, the local draft is preserved.
- Intentional de-DE synchronization copy is **„Wird gespeichert“**,
  **„Gespeichert“**, or **„Aktion nötig“**.
- Android supports offline reading in the MVP, but no offline writes and no local
  Outbox. A write attempt ends with **„Noch nicht gespeichert“**; a secure form
  draft may be retained.
- Deletions should be recoverable through de-DE **„Rückgängig“** where feasible.
- Conflicts are never overwritten silently.
- Timestamps are supplementary; understandable state comes first.

## 6. Privacy and sharing

- Every object has a domain privacy class. The UI maps `OWNER_ONLY` to the
  intentional de-DE label **„Nur für mich“** and `SPACE_SHARED` to
  **„Für uns beide“**.
- A privacy choice appears only in domains supporting multiple classes; Memory,
  Wish, and Plan remain `SPACE_SHARED` in the current Core.
- Visibility state appears near the title, form completion area, or primary
  action.
- Where selection is allowed, the most data-minimizing permitted class is the
  default unless the product specification defines otherwise.
- Before first sharing, the UI explains recipient, content, and effect.
- Changing private content to shared is a deliberate action and receives clear
  confirmation in the result.
- Changing back to private explains whether already synchronized copies or
  notifications are affected.
- Security and encryption claims are shown only when technically substantiated.

## 7. Permissions

- System permissions are requested **just in time**, immediately after an
  understandable user action.
- Before the system prompt, the app explains value and alternatives.
- Denial blocks only the affected feature, not the entire app.
- Settings provide an understandable path to change permissions later.
- Camera, photos, location, contacts, and notifications are justified
  separately.

## 8. Destructive and sensitive actions

- Destructive actions are named in text and visually distinct.
- Confirmation is required when data is not directly recoverable or another
  person is affected.
- The confirmation names the concrete object and consequence; de-DE example:
  **„Erinnerung endgültig löschen“**.
- Swipe gestures are shortcuts only; the same action remains available through
  a visible menu.
- Sign out, disconnect relationship, and delete account are separate actions
  with different risk levels.

## 9. Media upload

Media passes through `selected → preparing → uploading → processing → ready` or
`failed`.

- Before upload, preview, file type, and removal are available.
- Progress is shown per media item.
- A failure affects only that item and offers the de-DE action
  **„Erneut versuchen“**.
- Cancellation and reselection remain possible before final save.
- Alt text or a description is available for semantically relevant images.
- Metadata and location information follow the documented privacy rule.

## 10. Notifications

- Push previews contain no sensitive content by default.
- Users choose event type, channel, and preview level.
- Every notification leads to one concrete destination.
- Grouping prevents a stream of separate notifications for the same activity.
- In-app notices do not replace system-level error presentation.

## 11. Motion and feedback

- Animation explains hierarchy, causality, or movement between places.
- Reuse the semantic duration roles `fast` (120 ms), `standard` (180 ms), and `emphasized` (280 ms); `maximum` (320 ms) is the normal upper bound. Do not invent local duration ranges.
- `prefers-reduced-motion` and the platform reduced-motion setting are
  respected.
- No content is readable only during an animation.
- Haptic feedback supplements a visible state change and never replaces it.

## 12. Accessibility

- Touch targets are at least 48 × 48 dp in the app and 44 × 44 CSS px on Web.
- Text and essential symbols meet at least WCAG 2.2 AA.
- Focus order follows visual and semantic order.
- Web components use native HTML elements before adding ARIA roles.
- Every icon button has an accessible name.
- Information is never conveyed through color, position, motion, or haptics
  alone.
- Dynamic status messages are announced to assistive technologies without
  moving focus unnecessarily.

## 13. Anti-patterns

- Cards nested inside cards without real hierarchy.
- Multiple equally strong primary actions.
- Icon-only treatment for uncommon or critical actions.
- Essential actions available only through swipe, long-press, or another hidden
  gesture.
- Delete available only through swipe.
- Critical errors shown only as transient Snackbars.
- Disabled buttons without explanation of missing prerequisites.
- Horizontal scrolling used as hidden primary navigation.
- Different terminology for the same feature on Web and Mobile.
- Privacy claims not backed by technology and operations.
- Desktop layout merely compressed onto a smartphone.
- Requiring free-text entry for a value that has an established picker or
  bounded selection without a documented reason.
- Automatically opening the keyboard before the user has chosen a text-entry
  task.
- Redundant `Open` / `Details` buttons on content that already has one obvious
  primary destination.
- A list, table, or card grid chosen because multiple records exist, rather than because it is the correct task pattern.
- An existing row/card/table/form component reused for a couple-facing task it was never designed for, merely because it already exists (`docs/PARTNER-APP-EXPERIENCE-STANDARD.md` section 17).
- Expanded/Web adding more columns, boxes, or permanent actions than Compact merely because width is available.

## 14. Acceptance criteria

A new flow is ready for implementation only when:

- Compact and Expanded behavior are described,
- Loading, Empty, Error, Offline, and Success are covered,
- privacy and permission consequences are resolved,
- keyboard, focus, screen reader, and large-text behavior are considered,
- an established platform/mobile interaction pattern is reused or the deviation is documented,
- typing and keyboard burden are minimized for Compact where applicable,
- important actions and states can be recognized without relying on hidden gestures or memorized UI knowledge,
- one primary action and a clear way back exist,
- destructive actions are reversible or consciously confirmed,
- analytics events contain no sensitive content data.

## Related documents

- [Design Principles](./DESIGN-PRINCIPLES.md)
- [Information Architecture](./INFORMATION-ARCHITECTURE.md)
- [Component Contracts](./COMPONENT-CONTRACTS.md)
- [Screen Templates](./SCREEN-TEMPLATES.md)
- [Design Tokens](../design/tokens.json)
- [Critical User Flows](./USER-FLOWS.md)
- [API/UI Contracts](./API-UI-CONTRACTS.md)

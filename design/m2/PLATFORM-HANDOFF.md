# M2 Platform Handoff

**Purpose:** same domain contract, platform-appropriate implementation  
**As of:** August 24, 2026

## 1. Shared core

Web and Android share:

- route and screen terminology,
- privacy classes and visible copy,
- field and error semantics,
- API DTOs and concurrency rules,
- media lifecycle and retry categories,
- analytics names and data minimization,
- Story sorting, filters, and cursor behavior,
- acceptance data set and privacy canaries.

Platforms may adapt presentation and system integration, but not domain meaning or authorization.

## 2. Window classes

| Class | Width | Navigation | Story | Detail | Create |
|---|---:|---|---|---|---|
| Compact | up to 599 px | Bottom Navigation, max. five destinations | single column | new page | new page, full width |
| Medium | 600–839 px | Navigation Rail | wider list | new page or narrow Side Pane depending on space | centered form |
| Expanded | 840 px and above | Sidebar | list + optional detail pane | 320–480 px pane | centered form, Reading Max 720 px |

On large Web windows, text lines do not grow without limit. Content Max remains 1200 px and Reading Max remains 720 px.

## 3. Component mapping

| Task | Web | Android | shared contract |
|---|---|---|---|
| primary navigation | Sidebar/Rail/Bottom Nav | Navigation Bar/Rail | `navigation-item` |
| select type | Menu or Dialog | Modal Bottom Sheet | three described options |
| choose privacy | Radio Group / Selection Cards | Radio/Selection Controls | required, never color-only |
| Story card | semantic article/link | clickable Content Card | type, author, date, preview |
| detail | Side Pane or page | new Destination | neutral 404, stable back navigation |
| media | Grid/List with file actions | Media Tiles, System Picker | status, retry, remove, reorder |
| comment | Inline Composer | Inline/Bottom Composer | allowed targets only |
| error | Inline Message + optional Summary | Inline Message/Snackbar | outcome + next step |

Existing component contracts remain authoritative; M2 does not introduce a parallel component library.

## 4. Web-specific

- Use native links for navigable Story cards; opening a new tab re-evaluates authorization.
- Keyboard: Tab/Shift+Tab, Enter/Space, Escape, and arrow keys according to the component contract.
- Expanded List/Detail preserves selection, filters, and scroll position.
- Browser Back is a product path, not an emergency exit.
- A Service Worker or Query Cache must not retain owner/space data across logout or space changes.
- Do not persist signed media URLs in durable caches, History State, analytics, or DOM data attributes.
- Forms use appropriate autocomplete semantics only for non-sensitive standard fields.

## 5. Android-specific

- Prefer the System Photo Picker; request permission only from an intentional “Foto hinzufügen” context.
- System Back closes a Sheet/Overlay first, then Detail, then the Destination.
- TalkBack reads a card as coherent content with separate, clearly named actions.
- Media reordering by drag has Move-up/Move-down alternatives.
- App Switcher/Recents protection for private screens is documented as a security/UX decision.
- Do not store private content or Read URLs in unencrypted Shared Preferences, general backups, the clipboard, or the Share Sheet.
- WorkManager must not simulate silent Offline Write synchronization in the MVP.

## 6. Responsive Story

### Compact

- Month group above a vertical card list.
- Search and filters use a dedicated surface or Bottom Sheet.
- Use a Floating Action only if it does not cover navigation or content; otherwise use a clear Toolbar action.
- Detail replaces the list; Back restores state.

### Expanded

- The Story list remains the primary surface.
- The detail pane opens on the right and has its own heading and close action.
- Search/filters live in the local Story toolbar.
- The Create Form does not displace both list and detail into three competing columns at once.

## 7. Accessibility budget

These criteria block the M2 release:

| Area | Web | Android |
|---|---|---|
| target size | at least 44 × 44 CSS px | at least 48 × 48 dp |
| text scaling | 200% without loss of function | largest supported font/display size |
| operation | complete keyboard operation | TalkBack, Switch Access, external keyboard |
| focus | visible, logical, restored after overlay | stable semantics focus and back path |
| contrast | WCAG 2.2 AA target according to QA contract | same semantic color pairs |
| status | Live Region only for relevant change | polite status announcement |
| media | description/alt-text contract | Content Description/Description |
| motion | `prefers-reduced-motion` | system reduced-motion option |

Automated checks supplement but do not replace keyboard, screen-reader, and large-text acceptance.

## 8. Product performance budgets

Budgets are internal targets measured on agreed reference devices and networks.

| Measurement point | Budget | Note |
|---|---:|---|
| route shows stable structure | ≤ 150 ms after navigation | App Shell + screen frame, before network data |
| cached Story usable | ≤ 700 ms p75 | no private cache from the wrong context |
| Web LCP | ≤ 2.5 s p75 | representative mobile-Web test |
| Web INP | ≤ 200 ms p75 | filters, cards, form actions |
| Web CLS | ≤ 0.10 p75 | media reserves space |
| Android warm start until usable | ≤ 1.0 s p75 | agreed mid-range device |
| Android cold start until usable | ≤ 2.5 s p75 | no blocking on media prefetch |
| first visible media preview | ≤ 1.5 s p75 | after authorized content on reference network |
| local UI response | ≤ 100 ms | selection, privacy, remove file |
| visible loading indicator | from 300 ms | short operations do not flicker |
| upload progress | no later than 500 ms | status instead of invented percentages |

Budgets must not be achieved by preloading another user's or private content. Privacy filtering and authorization take precedence over speed.

## 9. Telemetry

Allowed:

- screen/flow ID,
- platform and app version,
- coarse duration and error class,
- online/offline as a technical state,
- success/cancel.

Forbidden:

- content, emotion, search text, and comments,
- original filename, MIME details, and image characteristics,
- resource, attachment, space, or partner IDs in product analytics,
- Read URLs, tokens, or signatures,
- private/shared combinations when they could enable re-identification.

## 10. Release handoff

Before a client flow is merged, provide:

1. screenshots or visual tests for Compact, Medium, and Expanded.
2. keyboard/TalkBack recording of the core path.
3. large-text and long-content test.
4. evidence for Offline, 401, 404, 409, 429, and 5xx states.
5. privacy-canary test from the demo scenario.
6. measurement against the relevant performance budgets.
7. comparison with the published OpenAPI contract.

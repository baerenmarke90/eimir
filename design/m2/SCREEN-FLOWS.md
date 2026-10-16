# M2 Screen Flows

**Purpose:** implementable end-to-end paths for Web and Android  
**As of:** August 24, 2026

## 1. Navigation model

The global order remains unchanged:

```text
Heute · Story · Planen · Entdecken · Mehr
```

M2 lives primarily in `Story`. `Heute` may show contextual entry points such as “Moment festhalten” or a recap, but it does not introduce a second M2 navigation structure.

### M2 routes as a product contract

| Route ID | View | Visibility | Compact | Expanded |
|---|---|---|---|---|
| `story` | shared timeline | space members | page | list + detail pane |
| `story/search` | search and filters | space members | overlay/page | toolbar + result list |
| `memory/new` | create memory | space members | new page | centered form page |
| `memory/:id` | Memory detail | space members | new page | detail pane |
| `heart-moment/new` | create HeartMoment | space members | new page | centered form page |
| `heart-moment/:id` | HeartMoment detail | according to visibility | new page | detail pane |
| `private-moments` | personal HeartMoments | owner only | new page under `Mehr` | protected area under `Mehr` |
| `milestone/new` | create milestone | space members | new page | centered form page |
| `milestone/:id` | Milestone detail | space members | new page | detail pane |

Technical URL paths will follow the router design. Route IDs describe navigation and deep-link behavior; they do not automatically define backend routes.

## 2. “Moment festhalten” entry point

**Entry points:** Quick Action on `Heute`, primary action in `Story`, contextual action in the empty Story state.

```text
Moment festhalten
├── Erinnerung
├── Herzmoment
└── Meilenstein
```

- Compact: Bottom Sheet with three clearly described options.
- Expanded: small menu or dialog anchored to the triggering control.
- Focus returns to the triggering action when the picker is cancelled.
- The selection is not remembered; every new item starts with an intentional choice.
- “Privat” is not preselected in the picker because only HeartMoment supports that choice.

## 3. Flow M2-A – View, filter, and open Story

**Goal:** read the shared history chronologically without hinting at private content.

1. The person opens `Story`.
2. The timeline loads using cursor pagination and groups items by month.
3. Filters provide type, year, and sort order; search is server-side.
4. Selecting a card opens the original resource.
5. Compact uses a new page; Expanded keeps the timeline visible and opens a detail pane.
6. Back restores search text, filters, cursor, selection, and scroll position.

**Story contains:** Memory, Milestone, `SHARED` HeartMoment.  
**Story never contains:** `PRIVATE` HeartMoment, hidden attachment relation, or partner canary.

**Card content**

- type and author,
- title/text preview according to the domain,
- `happenedOn` as the domain date,
- at most one quiet media preview plus count,
- comment count only for allowed targets,
- no redundant “shared” badge on every shared Memory; show a privacy indication where a choice exists.

## 4. Flow M2-B – Create Memory with media

**Privacy:** always `SPACE_SHARED`; no hidden private mode.

1. Select type “Erinnerung”.
2. Enter title, text, and domain date.
3. Select zero or more media files.
4. Every file immediately appears as a local tile with a status.
5. Validation failures are shown per file; other files and text remain intact.
6. Before saving, “Mit Partner geteilt” is visible.
7. Save online; success opens the new Memory.
8. Story updates as soon as the domain content is available; media may follow with an explicit status.

### Media states in the form

```text
selected → validating → uploading → processing → ready
                  └──────────────→ failed → retry | remove
```

| State | Presentation | Allowed action |
|---|---|---|
| selected | preview + file type | remove |
| validating | “Datei wird geprüft …” | cancel, if technically safe |
| uploading | progress without false precision | cancel/remove according to contract |
| processing | “Foto wird verarbeitet …” | leave form only with a warning |
| ready | preview, order, description | move, remove |
| failed | understandable reason category | retry or remove |

A failed media item does not automatically discard the Memory draft. Whether the Memory may be saved before all uploads finish follows the media/API decision and is not improvised in the client.

## 5. Flow M2-C – Private or shared HeartMoment

1. Enter text and emotion.
2. Select visibility explicitly:
   - **Nur für mich** – the partner does not see this moment.
   - **Mit Partner teilen** – the moment appears in the shared area.
3. Optionally add one attachment.
4. Before the first share, the UI briefly explains the consequence.
5. After saving, show the privacy label and sync state.

### Private route

- Success leads to the personal area `private-moments` or the owner-only detail.
- Shared `Story` is not offered as a return path.
- No comment action, partner avatars, or shared activity indicator.
- Private content must not appear in general search, “recently opened”, Push Preview, or a shared Share Sheet.

### Shared route

- Success opens the shared detail and makes the item visible in `Story`.
- Comments are allowed.
- Changing `SHARED → PRIVATE` is online, version-checked, and explains that already-read content cannot retroactively become unseen.
- Existing-comment behavior follows `M2-D07` in the Decision Log.

## 6. Flow M2-D – Create Milestone

1. Select type “Meilenstein”.
2. Enter title, optional text, and domain date.
3. Show a clear indication of shared visibility.
4. Saving opens the Milestone detail.
5. Story presents the Milestone as its own type, not as a decorated Memory.

M2 contains no Chapter, Place, or Recap controls. The UI keeps structural room for them but does not show disabled future features.

## 7. Flow M2-E – Comment and notify

**Allowed targets:** shared Memory, Milestone, shared HeartMoment.

1. The person opens an allowed detail.
2. Comments load after domain authorization.
3. “Kommentar schreiben” opens an Inline Composer (Compact) or fixed detail area (Expanded).
4. Sending shows exactly one optimistic state only if the API contract safely provides idempotency; otherwise show “Wird gesendet …” until confirmation.
5. Success adds the comment and keeps focus on the new item or Composer according to the action.
6. A comment on another person's content emits a minimal domain event; Push Preview remains generic.

A `404` reveals neither target existence nor the privacy reason. When content becomes private, the shared comment path disappears completely.

## 8. Flow M2-F – Offline Read and blocked Write

### Read

- The last authorized view may be shown with “Offline · Stand von {Zeit}”.
- Media without a safe local cache uses a neutral placeholder.
- Space change, logout, or session revocation removes or locks space- and owner-bound caches.

### Write

- Input may remain as a local draft in the current secure context.
- Submit never ends in “Gespeichert” or “Synchronisiert”.
- Copy: “Noch nicht gespeichert. Verbinde dich mit dem Internet und versuche es erneut.”
- After reconnection, retry occurs only through an explicit action.
- Privacy changes are not allowed offline.

## 9. Flow M2-G – Version conflict

1. Update receives `409`.
2. The current server state is loaded safely.
3. UI shows “Dieser Inhalt wurde inzwischen geändert.”
4. The person can view the current state and copy/reapply their own input.
5. No automatic last-write-wins.
6. For privacy-relevant conflicts, an older visibility value is never saved again.

## 10. Deep links and return paths

- A deep link checks authentication, membership, and resource visibility before rendering.
- Not found and not authorized share the same neutral `404` state.
- After re-authentication, return only to a destination that is still allowed.
- Expanded: closing the detail pane restores focus and list selection.
- Compact: System Back returns to the previous filter/scroll position.
- A deep link to `PRIVATE` resolves only in the owner context.

## 11. Analytics boundaries

Allowed data is event class, success/error category, platform, and coarse duration class. Titles, body, comments, search text, original filename, media content, Read URL, concrete emotion, resource ID, and partner identifier are forbidden.

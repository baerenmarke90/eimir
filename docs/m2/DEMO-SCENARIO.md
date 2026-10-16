# M2 Demo & Acceptance Scenario

**Purpose:** reproducible, entirely fictional dataset for Demo, visual QA, and End-to-End tests  
**As of:** August 24, 2026

All names, content, and Media are synthetic. Production data or real private memories must never be used as test fixtures.

## 1. People and Spaces

| Code | Person | Space | Role |
|---|---|---|---|
| `LEA` | Lea Sommer | `ALPHA` – Lea & Alex | member/author |
| `ALEX` | Alex Winter | `ALPHA` – Lea & Alex | partner/member |
| `MIRA` | Mira Berg | `BETA` – Mira & Sam | foreign member |
| `REVOKED` | Robin Test | former `ALPHA` | revoked Membership |

Demo reference date: **August 24, 2026**.

## 2. Seed content

The titles, bodies, and quoted UI strings in this section intentionally remain de-DE localized fixture content.

### Shared Memories

| Key | Author | Title | `happenedOn` | Media | Comments |
|---|---|---|---|---:|---:|
| `MEM-LAKE` | LEA | Sonnenaufgang am See | June 14, 2026 | 3 photos | 2 |
| `MEM-KITCHEN` | ALEX | Unser erster Pastateig | May 3, 2026 | 1 photo | 1 |
| `MEM-RAIN` | LEA | Spaziergang im Sommerregen | July 19, 2026 | 0 | 0 |

### HeartMoments

| Key | Author | Text | Emotion | Visibility | `happenedOn` | Attachment |
|---|---|---|---|---|---|---|
| `HM-SHARED` | ALEX | „Danke, dass du heute einfach zugehört hast.“ | APPRECIATED | SHARED | August 21, 2026 | no |
| `HM-PRIVATE` | LEA | `CANARY-PRIVATE-LEA-7421` | GRATEFUL | PRIVATE | August 22, 2026 | `private-lea-7421.jpg` |

`HM-PRIVATE` is intentionally technically recognizable and may appear only in Lea's Owner context.

### Milestones

| Key | Author | Title | `happenedOn` |
|---|---|---|---|
| `MS-GARDEN` | ALEX | Unser erster gemeinsamer Garten | April 10, 2026 |
| `MS-HOME` | LEA | Ein Jahr in unserer Wohnung | August 1, 2026 |

### Comments

| Key | Author | Target | Body |
|---|---|---|---|
| `COM-1` | ALEX | `MEM-LAKE` | „Den frühen Wecker war es wert.“ |
| `COM-2` | LEA | `MEM-LAKE` | „Nächstes Mal mit heißem Kaffee.“ |
| `COM-3` | LEA | `HM-SHARED` | „Das bedeutet mir viel.“ |

No Comment fixture references `HM-PRIVATE`.

## 3. Media fixtures

| File | Purpose | Expected result |
|---|---|---|
| `lake-01.jpg` | valid landscape | READY |
| `lake-02.jpg` | valid portrait | READY |
| `lake-03.jpg` | slow processing | PENDING/PROCESSING → READY |
| `pasta.webp` | valid supported format | READY if allowlist permits |
| `private-lea-7421.jpg` | Private Canary | visible only to LEA |
| `spoofed-jpg.exe` | MIME spoof | FAILED |
| `oversize-image.jpg` | size limit | FAILED |
| `broken-image.jpg` | decoder error | FAILED |

Binary fixtures are created only after Allowlist and Limits are finalized. Filenames are not Storage Keys.

## 4. Story expectation

For LEA and ALEX, the shared Story contains descending:

1. `HM-SHARED` – August 21, 2026
2. `MS-HOME` – August 1, 2026
3. `MEM-RAIN` – July 19, 2026
4. `MEM-LAKE` – June 14, 2026
5. `MEM-KITCHEN` – May 3, 2026
6. `MS-GARDEN` – April 10, 2026

`HM-PRIVATE` from August 22, 2026 does **not** appear. It creates no empty group, Count difference, or Cursor shift.

## 5. End-to-End scenarios

Quoted labels and entered content below intentionally remain de-DE localized product/fixture content.

### E2E-01 Read Story

1. ALEX opens Story.
2. Expected six items appear in stable order.
3. Filter „Erinnerung“ shows three Memories.
4. Reset restores Timeline and scroll position.
5. DOM, Network responses, cache, and Analytics contain no Private Canary.

### E2E-02 Create Memory with Media

1. LEA starts „Moment festhalten → Erinnerung“.
2. Enter title „Picknick unter den Linden“, date August 23, 2026, and two valid photos.
3. Add one broken file; only that file shows an error.
4. Remove broken file and save.
5. Detail opens exactly one new Memory with two Media items.
6. Story places it correctly; duplicate submit creates no duplicate.

### E2E-03 Private HeartMoment

1. LEA creates a HeartMoment with „Nur für mich“.
2. Owner-only detail shows Privacy label and no Comment action.
3. ALEX tries known ID, Story, Search, Comments, Attachment, and Export.
4. All paths show neutral 404 or no hit.
5. Logs, Events, and Push contain neither text nor filename.

### E2E-04 Shared HeartMoment

1. ALEX creates a Shared HeartMoment.
2. First-share explanation appears once.
3. Entry appears in Story.
4. LEA comments.
5. ALEX receives at most one generic Notification without Comment text.

### E2E-05 Milestone

1. ALEX creates „Erste gemeinsame Bergtour“ with date.
2. Milestone detail and own Story type appear.
3. No disabled Chapter/Recap controls are visible.

### E2E-06 Offline Read/Write

1. ALEX opens Story online, then enables airplane mode.
2. Cache shows „Offline · Stand von …“.
3. ALEX starts a Memory; submit remains „Noch nicht gespeichert“.
4. Input remains; no Story card or Success Event is created.
5. After reconnecting, deliberate retry creates exactly one Memory.

### E2E-07 Version Conflict

1. LEA and ALEX open `MEM-LAKE` with the same version.
2. LEA saves a change.
3. ALEX receives `409` on save.
4. UI shows the current state and preserves Alex's input separately.
5. No automatic last-write-wins.

### E2E-08 Cross-Tenant and Revocation

1. MIRA tries known Alpha IDs and Cursors.
2. All accesses remain neutral and mutate nothing.
3. REVOKED tries old Token, Read URL, and cache.
4. API denies; URL residual window follows documented TTL; local cache is locked/deleted.

## 6. Visual QA variants

Each core screen is captured with:

- Compact 360 px, Medium 720 px, Expanded 1440 px,
- standard and 200% Web zoom / largest Android font,
- light/dark where Dark Theme exists,
- empty, normal, long content, missing Media, partial failure,
- keyboard focus/TalkBack focus visible,
- Online, Offline Read, Offline Write blocked,
- Privacy-safe 404.

## 7. Accessibility walkthrough

- Read and open Story completely through keyboard/TalkBack.
- Set and clear filters without relying on visual orientation.
- Understand and select Privacy group.
- Add Media, detect error, remove, and reorder without Drag.
- Send Comment and hear status.
- Resolve 409 without losing own input.
- Back navigation restores context and focus.

## 8. Analytics expectation

Allowed examples:

```text
story_opened
story_filter_applied { type_class }
memory_create_started|completed|failed { failure_class? }
attachment_upload_failed { failure_class }
heart_moment_create_started|completed|failed
milestone_create_completed
comment_send_completed|failed
```

Fixture and Canary values must appear in no Analytics payload.

## 9. Definition “Demo passed”

The Demo passes only when functional success, failure recovery, Privacy, Offline behavior, Accessibility, and Cross-Tenant isolation are visibly demonstrated. A pure Happy Path screenshot is insufficient.

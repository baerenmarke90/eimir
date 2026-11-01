# Shared diary capture and reading

Owner: [#1457](https://github.com/baerenmarke90/eimir/issues/1457). The Product Owner requested a diary experience and authorized implementation on 2026-10-26. Related: #601, R1/R2, F2 and ADR 0012.

## Repository-aware preflight

Baseline: main `3955f44435f880fb9424602f7a2dcfbd17726148`. The issue records the Mobile Interaction Contract and reuse/business/cross-cutting decisions before runtime implementation. The [generated reference](diary-composition.webp) was committed as `fd7565e0b9b331f599175b42ba9923a2f58e680f` and linked in the issue before UI code.

Reviewed production consumers: MemoryCreatePage, MemoryProductPage, StoryProductPage/StoryList, AttachmentDraftPicker/useAttachmentDrafts, ContextTagEditor, session persistence and read-cache isolation. Current semantic tokens remain authoritative over illustrative colors, counts and icons in the generated image.

The owner's diary direction evolves the former R1 media-first ordering: date and sustained prose now lead, followed by optional photos and optional title/context. Existing photo-only, title-only, text-only and mixed capture remain valid. The existing chronological Story route is labeled as the diary; its filtering, pagination, month grouping, canonical links and origin restoration remain unchanged. There is no new Diary domain.

## Mobile Interaction Contract

| Concern | Contract |
| --- | --- |
| Human goal | Keep an ordinary thought or a longer story and return to read it later. |
| Pattern | R1 full-page Create/Edit task and R2/read-first Detail, existing task shell, native date/file input and ShortTaskSheet. |
| Compact | Compact task header, visible date summary/change, growing narrative, existing media picker, explicit optional title/context disclosure, local-draft status, fixed shared audience and one primary save action. |
| Expanded | Same task and bounded reading measure; no permanent metadata sidebar. |
| Capture | No automatic keyboard on neutral entry. Persistent labels, native picker cancellation, backdating and multiple entries per day remain supported. |
| Photos | Existing upload/validation/limits, owned preview URLs and cancellation. Labeled earlier/later controls preserve identity and announce the actual new position. Immediate reordering and stable keyed previews avoid a competing movement effect during composition; reduced motion retains the same result. |
| Draft | Explicit recovery choice, local status and deliberate retain/discard when closing. Saving locally is distinct from publishing to the shared Space. |
| Save | Duplicate-submit lock, exact request identity, existing uncertain/partial outcomes, canonical confirmed result, then the valid originating context. |
| Reading | Natural paragraphs in the existing reading font, no decorative initial-letter mutation, no empty photo/body placeholder. Existing gallery, tags, authorship, capabilities and partner comments remain authoritative. |
| Accessibility | Existing task focus/history primitives, native disclosure semantics, visible labels, at least 44 px photo actions, reflow, large text and both themes. |
| Feedback | Immediate pending labels; local success only after an IndexedDB transaction commits; shared success only after the existing server operation confirms it. Existing navigation/sheet motion tokens remain unchanged. |

## Local draft storage and lifecycle

- IndexedDB structured cloning stores the selected Files alongside title, narrative, context labels, unfinished label text and date. No file bytes or authored content enter URLs, history, analytics, logs or the shared read cache.
- One recoverable composer draft per normalized API instance, Account and Space. A new tab explicitly resumes the prior draft and atomically takes writer ownership. Stale writers cannot overwrite, delete or publish that task.
- A seven-day inactivity window limits recovery. Expired records are rejected and removed on the next draft-store access. Explicit discard and confirmed shared save clear the owned draft. Erasing all draft content clears previously stored words rather than resurrecting them later.
- Logout, Account replacement and Space changes use the existing session boundary to synchronously invalidate writer leases and rotate the durable generation, followed by an asynchronous purge. The purge preserves records belonging to a later generation. Disabled storage never produces a claim of durable recovery.
- Browser storage remains local application data, with no new encryption claim. Clearing site/app data, removing the app or browser eviction removes local recovery. Local drafts are not included in the server export or backup and are not an offline synchronization outbox.
- An attempted create is checkpointed before the POST, including its original idempotency key, exact payload and start time. Recovery uses the existing bounded verification window. A confirmed create with incomplete attachment association stores its existing Memory identity and retries only association.
- Server READY uploads expire after 60 minutes while unbound. On a recovered save/verification, current attachment metadata is checked. A missing upload is recreated from its retained local File using the existing transport/validation pipeline; the attachment association is updated while the Memory request identity and payload stay unchanged. Existing bound files are reused. Recovery work is cancelled when its task ends.

## Reuse and consistency

Native browser IndexedDB/structured cloning and the existing session invalidation boundaries were selected over Web Storage for file bytes, a new editor framework, a provider service or a server draft domain. Web Storage carries only the opaque invalidation generation. There is no new runtime dependency, backend endpoint, migration, configuration or native capability.

ContextTagEditor now optionally exposes its controlled draft and an explicit commit handle. The composer uses that same normalization/validation contract for a restored unfinished label, rather than duplicating context-label rules. Attachment reordering/restoration extend the existing attachment primitive and retain its resource ownership, queue, capacity and request-generation guards.

## Business/freemium consistency

Memory CRUD/Timeline and image attachment upload remain Free/Core under the current feature matrix. Local draft recovery is resilience of that capability and has no entitlement or managed-server quota of its own. Self-Hosted and Cloud use the same client behavior. Existing server media quotas, commercial ownership, downgrade, export and content rights remain unchanged.

## Evidence

The browser fixture uses production React consumers, real browser IndexedDB/File cloning and mocked authorized APIs. It proves the local recovery and interaction paths; it does not replace live-backend or physical-device release acceptance.

See the owning PR for final test counts, source identity and representative Compact/Expanded Light/Dark captures. Existing evidence under R1 remains historical and is not overwritten.

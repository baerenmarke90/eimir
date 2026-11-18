# Shared authored moments and conversation delivery

Owning issue: [#1626](https://github.com/baerenmarke90/eimir/issues/1626).
Baseline: main `633fc6afa3e74bb3bf58b4c79649c1be0d7c6b21`.

The Product Owner supplied [this generated visual reference](po-reference.webp)
with the request. Issue #1626 records it before UI implementation. Product
Reference v1 R1/R2/R3 and the existing Compact shell remain authoritative. Do not
copy the illustration's obsolete mobile header, invented counters or media.

## Composition and interaction

Happiness/Time Travel responses use one existing Memory projection in Journal and
Discover, with distinct readable authored surfaces and an Edit pencil only on the
viewer's answer. Detail preserves each answer's media bindings and reactions;
there is no copied content or gallery. The other partner can add an answer through
the existing protected capture/result workflow. Reading and editing remain
distinct. Optional place management stays inside Edit. The Plan location link
retains its pin, name, address and destination without the redundant label.

Discover introduces stable full-width photo accents, including multi-day/media
memories and alternating selected images, among natural-height smaller entries.
Sparse CSS placement preserves source/focus order. Existing reveal feedback,
reduced-motion behavior, tabs, filters, retrospective, renewal and canonical
return paths remain. Expanded keeps the same content hierarchy.

Comments retain recognizable names and own-edit authority without a redundant
self marker. Ascending `(created_at, id)` keyset pagination keeps the earliest
comment at the top across pages, including timestamp ties. Cursor bindings carry
the new order version so pre-upgrade cursors cannot silently reverse direction.

## Data, concurrency and compatibility

Migration 0105 adds only an indexed opaque `experience_root_id`; protected text,
authors, individual response IDs, receipts and attachment ownership are retained.
An authorized, Space-scoped lazy metadata reconciliation pairs equal prompted
questions on the same effective date, with distinct authors. Free-form captures
and repeated contributions from one author remain separate. The existing
transaction advisory-lock primitive serializes reconciliation and explicit reply
creation across API workers. An explicit reply reference is authorized and
reuses its source question/date; a duplicate own response returns a conflict.

Legacy encrypted content is accessed through the normal ProtectedPayload ORM
boundary, never decrypted by an Alembic migration. The ungrouped partial index
makes steady-state reconciliation an existence probe. Answer/author/gallery
projections are batched. Ordinary Memories retain collaborative editing;
experience body and gallery writes enforce answer authorship in the domain.
The shared question/date is immutable to an individual response edit. Deleting
one's response retains the partner's response and moves the shared discussion if
a new canonical root is needed. Export retains the original authored sources;
import does not replay partner notifications. Older response contracts still show
the existing body/gallery instead of an empty screen. Response deep links retain
their identity while intentional-view receipts resolve to the shared canonical
source, including older clients posting the response ID.

## Cross-cutting review

No new provider or dependency. Existing `games.couple`, retained-history access,
Core local-media behavior, Self-Hosted parity and non-destructive downgrade are
unchanged. Names/body/media remain within authorized response/read-cache scopes.
No private text enters event metadata, lock keys, URLs, logs or lockscreen wakes.
Existing create identity, draft isolation (including reply source), task lifecycle,
Offline/read-denial states, semantic tokens and keyboard/assistive navigation
remain. See the [current module notification inventory](../../notification-workflow.md)
for the full attention audit and immediate-comment Push correction.

## Verification

Representative Compact/Expanded Light/Dark screenshots and behavioral results
are recorded with the final implementation revision in the PR. Browser journeys
cover Journal → shared detail → own edit → confirmed result → restored Journal,
unchanged partner text, chronological comments, no read-mode place action and
axe accessibility checks. Backend acceptance covers author/cross-Space negatives,
legacy and encrypted responses, stable pagination, deletion, duplicate replies,
concurrent partner answers, Activity and real provider-adapter queue semantics.
Physical-device FCM acceptance is not represented by mocked browser/provider tests.

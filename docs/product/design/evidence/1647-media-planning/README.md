# Media, planning and Vibe correction evidence (#1647)

Baseline: main `107c9db7ac7d9e8bf38aea54311fc9a633b51e01` after #1644.
The [whole-composition generated reference](../../references/1647-media-planning/reference.png)
was published in the owning issue before UI implementation, in preflight commit
`f1590f17c4b37a1dd203b9b662c8361f1d977257`. Product Reference v1 R1/R3/R4,
existing creation/selection entries and the five-slot Compact shell remain authoritative.
Final source and CI revision binding are recorded in the PR.

## Product result

Wish titles use one unboxed vertical list, quieter authorship and a compact
existing shared-selection invitation. Both Plan scopes and Wish scopes load
bounded pages on scroll. The inactive segment does not fetch; already loaded
ranges and return position survive detail navigation. A failed continuation
keeps existing content and permits deliberate retry. A cold Plan snapshot is
labelled while authoritative revalidation is pending, preserving the former
warm overview behavior.

The seven-choice Vibe sheet adds Very good without changing optional notes,
Energy, Mutual Reveal, current-day freshness or commercial history boundaries.
Association changes are available inside Edit; readable sources remain on the
detail. Explicit Wish adoption preserves the unsaved Plan title and uses the
updated version on the later save. Dropped files use the same draft, privacy,
cancellation, ordering and save pipeline as system selection. Avatar areas
remain single-photo intake.

The sensitive cover and reveal control have no lock glyph. Conceal/reveal,
accessible names, classification and volatile reveal reset remain in place.

| Evidence | Observed behavior |
|---|---|
| [360 Light](wishes-360-light.png), [390 Dark](wishes-390-dark.png), [430 Light](wishes-430-light.png) | Long Wish titles, retained filters/create/selection entries, single-column order |
| [Expanded Dark](wishes-1280-dark.png), [320 / 200% text](wishes-320-light-large.png) | Same content hierarchy, scrollable reflow without horizontal overflow |
| [Vibe choices](today-vibe-seven-labeled-symbols-390-light.png), [saved Very good](very-good-confirmed-390-dark.png) | Seven named symbols; actual save and route-return persistence with Energy unchanged |
| [Plan association](plan-edit-link-choice-390-light.png) | Existing Wish selection entered through Edit; unsaved text and fresh If-Match retained |
| [Dropped photo in Edit](memory-edit-drop-ready-390-light.png), [saved result](memory-drop-saved-390-light.png) | Browser DataTransfer → existing upload → save → read-only detail; association trigger absent from reading |
| [Sensitive overview](plan-cover-overview-390-portrait-dark-false-true.png), [after explicit reveal](plan-cover-detail-390-portrait-dark-false-true.png) | Concealment and reveal retained, glyph absent |
| [Cold Plan restore](planning-warm-snapshot-390.png) | Saved content shown immediately and labelled until current revalidation completes |

## Validation

The new feature-owned browser spec collects **9 tests** and passes without
retries (37.4 seconds locally, one Chromium worker). It covers 32-item browsing
with a 20-item first page, no inactive-domain request, append and source return,
retry, Edit-only association and save-version safety, real media drop/save,
Light/Dark, reduced motion, Expanded and 320px/200% text, with axe checks.

The broader local selection collected 94 tests. One cold-snapshot indicator
regression was fixed with an opt-in restore/revalidation contract and dedicated
unit/browser protection. Nine other failures were diagnosed as local disk
exhaustion or parallel-load timeouts; all ten affected cases then passed with
one worker, unchanged product assertions and no automatic retry (1.3 minutes).
Old fixtures now model the additive overviewScope contract and enter Edit for
association mutations; no browser journey was removed.

The complete validated inventory collects **1,045 tests in 91 specs**. This
change conservatively selects all specs (70 PR shard files plus 21 additional
files) because generated API/shared foundations and dependencies changed.
The new nine-case viewport/feature evidence stays FULL_REGRESSION, with reviewed
production roots in both inventories; it does not expand the always-run core.
All 38 browser planner/runner regressions passed.

PostgreSQL verifies bounded chronological traversal, day-boundary stability,
filter/Space/account cursor binding, invalid cursor rejection, the additive
Vibe constraint and compatible downgrade, plus selective stranded-job recovery.
A fresh interpreter verifies the real standalone video worker can prepare ORM
persistence without the API/test model bootstrap. Upgrade from an empty database
through 0110 and Alembic drift checking pass. The dedicated CI codec job must
supply and test the restricted FFmpeg binaries; local codec-dependent skips
are not counted as acceptance.

[Development-worker results](local-codec-result.json) and
[production-build/CSP results](built-compression.json) use the repository's
synthetic one-second H.264/AAC fixture, padded beyond the 8 MiB optimization
threshold. They verify the real codec worker returns a smaller MP4 with one
video track, one AAC audio track and the original duration. Padding deliberately
exercises the pipeline; these numbers are **not a realistic compression benchmark**.
The compiled worker executes under the exact production CSP with zero policy
violations, without blob/remote workers, inline scripts or eval. Unit tests cover
original fallback, abort of active/queued work, output bounds and timeout.

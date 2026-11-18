# Validation evidence — 2026-10-29

## Delivered scope

- Warm, bounded shared Today/Plan overviews after current Account/Space authorization; background refresh and explicit cached timestamp; no write queue or auth/entitlement persistence.
- Android root Back minimizes the task instead of destroying its WebView; a fresh process still revalidates the session and membership.
- Plan overview prose bounded to 180 graphemes/three lines; optional shared image using the existing attachment lifecycle.
- One staged Plan editor saves content, schedule, image, place and countdown atomically with If-Match. Countdown and fixed audience context are absent from ordinary reading. Completion remains an explicit experience action.
- Opt-in Leaflet/OSM map task with bounded authenticated Photon search, pan/zoom/tap/keyboard selection, confirmation, cancellation and isolated failure/retry.
- Pro passport with shared identity, anniversary/day landmarks, bounded shared rediscovery, next Plan and personally optional counters. No relationship scoring or inferred private history.

## Checks and limits

| Check | Result |
|---|---|
| Complete Web suite, Node 22.23.2 | 2,259 passed, two existing skips; 246 passing test files |
| Focused Plan/version-conflict and map failure/retry tests | Eight passed; included in the complete final run |
| Plan/media/backend integration and provider/OpenAPI tests against PostgreSQL 17 | 93 passed, no skips |
| Additional complete transfer/privacy/encryption/offboarding regression after composite-FK correction | 43 passed, no skips; overlaps with the Plan/media run |
| Browser journey selection | 68 distinct cases: 63 passed in the broad run; the five failures were corrected/rechecked and passed in the follow-up |
| Final Compact Light / Expanded Dark map + image + single-save journey, including axe | Two passed, no axe violations |
| Web build, typecheck, token/PWA and Capacitor foundation checks | Passed |
| Ruff / format, strict mypy | Passed; 311 source modules checked |
| OpenAPI application/schema and generated TypeScript drift | Passed |
| Migration empty database → head → 0090 → head; Alembic metadata check | Passed, no new upgrade operations detected |
| Browser inventory and whitespace/diff check | Passed |

The broad browser run identified the completion form's 320px/200% intrinsic
width and obsolete management-disclosure expectations. Both were corrected.
One login test encountered a development reload while files changed, and the
lazy map encountered Vite's Outdated Optimize Dep response; the final fresh
server recheck passed with Leaflet explicitly pre-optimized. The production
map remains lazy and has its own reused error boundary so a failed SDK request
cannot replace the parent Plan editor. Tests retain the chosen location while
retrying. The final map rendering uses deterministic tile fixtures; it does not
establish uptime of the public providers.

Existing build warnings about module-level use-client directives and the large
main bundle remain. The map SDK is a separate lazy chunk and adds no map request
to startup. Browser evidence does not certify an installed Android APK, OEM
process-death behavior, soft-keyboard geometry or a newly published test release.
No release has been published from this task.

## Visual review

The actual renders in `evidence/` include Compact 320/360/390/430, Expanded,
Light/Dark, large text, reduced motion, Pro/Free, a slow cold reload, Plan
completion and one complete image/map edit. The selected map screenshots are
viewport captures; full-page screenshots naturally stitch fixed navigation at
its viewport position. The source image fixtures and generated preflight
provenance are documented in `docs/DEPENDENCIES.md`.

## Shared-checkout coordination

The separate authorized place/chapter-dialog work owns PlanningRelationManager,
RelationMomentPreview, sharedPlanning's relation loading, ChapterProductPage,
the `ownerName` prop at PlaceProductPage, the `relations` locale block and the
Today/settings module-availability suppression. Those changes are preserved
in this checkout and belong to its separate PR #1501. The passport preference
and presentation here consume that agreed suppression. The initial implementation left the shared checkout unstaged. The subsequent
PO-authorized publication/merge follow-up saved all changed and untracked files
before creating a separate Git worktree. Only this task's patch and new files
were transferred with a three-way merge onto PR #1501 plus merged #1500.
Relation-picker/runtime files remain unchanged from their owning PR; the
shared original checkout is never staged, reset or switched by this follow-up.

## Publication follow-up checks

The isolated integration with #1500 and #1501 passed the complete 2,259-test Web
suite and 26 additional browser journeys on its own server port, including
#1501's place/chapter picker, the complete passport/Plan image-map flow and
session retention. The shared checkout still matched every backed-up file.

The first GitHub runs exposed two frozen API expectations (Plan media parent and
explicit place lookup) and the exact CSP checker missing the one approved tile
origin. The route/enum equality assertions remain closed, the attachment
manifest now includes PLAN, and a bounded-request/response contract regression
was added. All 27 focused contract/provider tests passed. Four header probes
accept only the approved exact policy and reject an added origin, unsafe-inline
script and duplicate header. No security rule or assertion was relaxed.

The final media-lifecycle review extended the shared binding classifier to Plan
covers. Twelve PostgreSQL tests, including leaving the Space and accepted
Account deletion with a Plan cover, verify retained shared bytes, consistent
cleanup and continued partner read access. Strict mypy and Ruff passed on the
final runtime addition. Current-head GitHub checks still gate the merge.

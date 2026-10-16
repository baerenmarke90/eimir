# Browser QA continuation — 2026-10-12

This dated continuation supplements the [initial bounded QA record](README.md). Runtime UI code and its seven screenshots remain unchanged. Additional test-fixture work is recorded at `ae4d13eb19e5655e8343cb57c6203349fe54dbba`.

## Current-main comparison

The [completed Browser QA run on main](https://github.com/baerenmarke90/eimir/actions/runs/38052035541), at the same `dd46f6d1c6df3bb8c684715266b832334b6354e6` baseline, had 17 full-regression failures. Six were the obsolete Momente expectations/mocks repaired by the initial package. The remaining eleven consisted of:

- Five People/Important Dates cases, one private-visibility contrast case and four product-reflow cases: their strict fixtures did not model the established shared-shell `GET /spaces/{spaceId}/partner-nickname` request.
- One 200% navigation/Memory-composer case: its body-height scroll heuristic left Cancel outside the asserted viewport despite being a reachable control.

The initial PR revision `e8cb4266f845182e6b5ba6d92ebd28da214f330b` passed all selected PR checks, including both PR-critical browser shards and the changed-spec job. The additional changes below repair the remaining demonstrated main-suite setup defects without changing product behavior.

## Shared contract and setup repair

`mockEmptyPartnerNickname` is one narrow fixture for shared shell metadata. It uses the generated `PartnerNicknameView` contract, one exact Space URL, an explicit partner identity (or null for an unpaired fixture), and a null nickname/version zero. GET is handled; other methods fall through to the existing strict mock. Discover, People/Important Dates, private contrast and reflow reuse it. Unexpected-request assertions remain intact; nickname customization tests retain their own domain-specific fixtures.

Protected routes can already have `/today` in their URL while showing the login form. The People and reflow helpers' URL assertion therefore did not prove sign-in completion. Like the gallery helper, they now wait for the login form to disappear before subsequent navigation. The private-contrast helper uses the same established Playwright assertion. No delay or retry was introduced.

The Memory Cancel test now scrolls the actual control into view using Playwright's standard interaction helper. The body-height heuristic and 100ms delay were removed. Its exact viewport-bound checks, hidden-root-navigation check and remaining collision/keyboard assertions are unchanged.

## Validation and limits

- **54 distinct local browser cases passed:** the original 43, plus all eleven additional main-suite cases listed above. The Discover cases were also rechecked with the shared fixture.
- The final ten-case People/private/reflow batch passed its behavior assertions; one screenshot write was interrupted by ENOSPC. That single case passed again after deleting the unused backend runtime created for this task. Failed/incomplete invocations are not counted as successful evidence.
- The shared fixture typechecks against the existing generated API contract. Formatting, lint, browser inventory and diff checks pass.
- The initial 60 unit/component/contrast tests and production build remain applicable: the continuation changes only browser-test setup, not runtime source.
- Backend/PostgreSQL tests remain unexecuted: eight were explicitly skipped locally, and standard Web-only PR CI skips the backend shards. No new server-side privacy acceptance is claimed.

The first report remains a historical record for its own revision. This continuation does not introduce a second living project-status source, change business/freemium behavior, activate #946, merge or deploy.

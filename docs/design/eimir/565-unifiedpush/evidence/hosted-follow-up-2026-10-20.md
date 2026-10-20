# Hosted verification follow-up: 2026-10-20

## Completed baseline verification

All current PR workflows have completed successfully or intentionally skipped
for exact head `26b0d5c4399d8a0fdea65f096d49af0bfb52f724`, based on main
`50dcc7fcc39fec288fc800615ea7948fde30e5fe`. This supersedes the pending-CI
observation in the earlier device report without changing its local failures
or physical acceptance limits.

- [Web Reference Flow](https://github.com/baerenmarke90/eimir/actions/runs/39470811837/job/118794083451):
  **2052 passed, one existing skip**, plus build/foundation checks.
- [Backend CI](https://github.com/baerenmarke90/eimir/actions/runs/39470811715):
  backend checks, all four integration shards and their aggregate, Supply Chain
  and required source checks succeeded.
- [Android launcher](https://github.com/baerenmarke90/eimir/actions/runs/39470811874):
  **four tests passed on API 28 and four on API 36**, including the fixed-URI
  cases. This independently supplies the hosted result missing from the
  historical local instrumentation run; it does not rewrite that failed run.
- [Release Evidence](https://github.com/baerenmarke90/eimir/actions/runs/39470811730):
  unsigned APK/AAB packaging and configuration verification passed. The
  exact-artifact attestation job was intentionally skipped. No signed release
  was published.
- CodeQL, real Web client flow, Product Design and Reuse checks succeeded.

## Browser first-attempt results

[Browser QA](https://github.com/baerenmarke90/eimir/actions/runs/39470811949)
is successful with **435 direct passes and three retry passes**, not a
retry-free acceptance:

| Job | Direct passes | Retry passes | First-attempt failure |
| --- | ---: | ---: | --- |
| [PR-critical 1/2](https://github.com/baerenmarke90/eimir/actions/runs/39470811949/job/118794082923) | 218 | 1 | Sign-out then `page.reload()` reports `ERR_ABORTED` |
| [PR-critical 2/2](https://github.com/baerenmarke90/eimir/actions/runs/39470811949/job/118794082802) | 217 | 2 | Place coordinate accessibility journey times out; shared-photo byte-reuse assertion records an extra thumbnail request |

The Place case is tracked separately in #1386. Successful shard diagnostics
do not retain Playwright trace ZIPs; their visual evidence is not a navigation
trace. No assertion, timeout or retry setting has been relaxed.

## Test lifecycle investigation preflight

The two repeatedly failing session/photo cases are checked against the real
product document lifecycle before changing tests. A visible login field can
belong to the old document while sign-out still owns a pending navigation to
`/`. A test helper that logs in on the destination route and then navigates
there again can create two independent document lifetimes; the media cache is
deliberately session-memory-owned and need not survive a full reload. Neither
observation alone proves the historical CI failure's exact timing.

Reuse the existing completed-navigation pattern from
`private-area-reference.spec.ts`, the production bundle and existing media
cache contract. Any correction must preserve the genuine post-sign-out reload,
pending-session/privacy checks and exact thumbnail/original byte-reuse
assertions. These are test sequencing changes with no product UI, provider,
dependency, API, entitlement, cost or data-lifecycle change. No new visual
composition or generated reference is required. Validate focused real-browser
journeys with retries disabled and attribute their results to the tested tree.

## Reproductions and corrections

The existing production bundle was used unchanged, with official Chrome
Headless Shell 151.0.7922.34. Bundle `index-CFn5bXCA.js` SHA-256 is
`fff236e1f8b74997e8716866a36f33858fde7763e148c4a85d41e8143294b242`;
`index.html` SHA-256 is
`5a1692d1acf7f2b252accda3ac84ec838e39b2a9639aec166055632fb55f80fb`.

**Sign-out:** the baseline test against `26b0d5c4`, repeated three times with
retries disabled, produced one `ERR_ABORTED` and two passes. The retained local
trace places the successful login-field assertion at 2391.194 ms in the old
`/today` document and `page.reload()` at 2394.399 ms. Navigation to `/` aborts
at 2397.768 ms and a `/today` document reload follows. The test now uses the
existing repository pattern of awaiting `/` with `waitUntil: 'load'` before
checking public entry and performing the genuine reload. All original pending
state, credential, private-content and post-reload assertions remain.
The corrected case passes **three of three repetitions, retries zero**.

**Shared photos:** the original case passed three local baseline repetitions;
no naturally occurring local failure is claimed. A temporary diagnostic copy
waited for the already legitimate visible first thumbnail before the helper's
existing second `page.goto()`. That event-driven schedule reproduced exactly
`['thumbnail', 'thumbnail', 'original']`: first thumbnail at 18:46:38.451Z,
second document request at .592Z, second thumbnail at .822Z and original at
.941Z. Removing the redundant full navigation leaves the authenticated
destination document in place and retains the existing gallery-heading
readiness assertion. The same diagnostic schedule then passes with exactly
one thumbnail and one original. The actual corrected byte-reuse case passes
**three of three repetitions**, and the **complete six-case shared-photo file
passes**, all with retries disabled. Access rechecks, detail return, focus and
byte-reuse assertions are unchanged. The production cache needs no change.

Changed-spec Biome checks, browser inventory and `git diff --check` pass.
Four pre-existing non-null warnings in the photo fixtures remain unchanged.
Local diagnostic logs and traces are retained separately; full CI on the new
follow-up commits must be evaluated independently of the baseline results above.

## Remaining acceptance

PR #1271 stays Draft. First-attempt gCompat-UP delivery after Account replacement
still needs physical verification; a separate deterministic native ordering
defect is documented in
[Account-replacement follow-up](account-replacement-follow-up-2026-10-20.md).
The combined final-APK folded/unfolded/Dark/enlarged-font acceptance remains
incomplete. The user explicitly prohibited enlarging the font again; that
instruction remains binding. No Android device was connected when this
continuation began. Test.13 still lacks the native Push receiver.

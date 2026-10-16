# Private reorder recovery focus — #1302

Baseline: `main@fc326b0a9985643a868d1afe5a4d62df51d1d6fe`, 2026-10-12.
No open product PR overlaps the private reorder test or its runtime.

## Finding and reproduction

The original [Full regression 3/4 job](https://github.com/baerenmarke90/eimir/actions/runs/38182550346/job/114598019194)
failed at the second `move()` immediately after the write-error Retry. Its
`toBeEnabled()` passed, `focus()` returned, and `toBeFocused()` observed an
inactive handle for the unchanged five-second assertion timeout. The existing
workflow retry passed. Successful jobs upload selected visual evidence, so the
failure trace was not retained by the `if: failure()` diagnostic upload.

Current-source review found no deferred focus restore in `useListItemReorder`
or the private collection Retry. Retry invalidates the existing detail query;
its `isFetching` state temporarily disables writes and handles. TanStack Query
5.85.5 batches observer notifications through its installed zero-delay
scheduler. A successful enabled assertion can describe the state before that
read notification reaches React; it is not evidence of completed recovery.

A temporary zero-retry Chromium diagnostic exposed this interleaving on the
unchanged production build. After the initial 500 rollback, it held the Retry
detail GET and used Playwright's clock to separate scheduled notification from
the earlier enabled check. It then delivered that notification before calling
`focus()`:

| Observation | Disabled | Focused | Active element |
| --- | --- | --- | --- |
| Focus attempted during the held read | true | false | BODY |
| Read completed; original DOM node still present | false | false | BODY |
| Positive control: focus deliberately attempted after recovery | false | true | BUTTON |

The final focused assertion failed with the same `Received: inactive` signature.
The DOM-node identity check passed, excluding handle replacement/index drift
from this reproduction. Repeating the same diagnostic with deliberate focus
after the completed recovery establishes the corresponding positive control.
The clock is a diagnostic control, not a production or retained-test change.

## Correction

Only the existing browser fixture/test changes. Retain both immediate and held
recovery variants. Hold and observe the actual detail GET for both recovery
stages in the latter. Confirm that the held read blocks the
handle, preserves the collection-title draft and sends no write. After release,
wait for the visible error-action transition that belongs to the completed
recovery before beginning another keyboard movement:

- write-error Retry: its error action disappears after the awaited invalidation
  and mutation reset;
- failed-read Retry: the query error action disappears while the original
  failed-write action remains, reducing the count from two to one.

Each deliberate move still asserts an enabled and focused handle before
ArrowUp. The locator now names the intended item by its stable fixture ID.
The complete sequence retains rollback/order checks, 409 recovery, unchanged
three-write count and the new-decision root versions `1`, `1`, `7`. Final
read recovery explicitly checks focus, draft and confirmed order without
submitting another write. No retries, delays, timeouts or focus assertions are
weakened. The existing runtime correctly supports this recovered interaction;
no runtime bug is established by this finding.

## Reuse, product and quality assessment

Reuse the existing held-route fixture, Playwright assertions, native keyboard
interaction, Query invalidation and shared reorder hook. A delayed focus
restore, new lock or new dependency would change runtime ownership without a
demonstrated runtime cause. No provider or external component is introduced.

**No user-facing UI / UX impact:** no product source, composition, motion,
localization, token or capability changes. Existing Product Reference v1
checklist/private-content rules, Detail View/Edit templates and the
[private-reorder preflight](../product/design/references/508/private-list-reorder-preflight.md)
remain applicable; no material feature/composition calls for another generated
reference. Historical acceptance records are not rewritten.

**No business/freemium impact:** existing private Core content and
non-paywallable accessibility/owner-only isolation retain their matrix
classification, entitlement and identical Cloud/Self-Hosted behavior. There
is no quota, cost, ownership, retention or downgrade change.

Cross-cutting review covers keyboard focus, draft safety, asynchronous read
readiness, write-count and version correctness, no write replay, existing
owner-only authorization and localization. The new fixture uses synthetic
authorized data only. No API/schema, persistence/cache, telemetry, packaging
or deployment change. This is bounded Web verification, not native-device
or final #946 acceptance.

## Validation

The production build, token/PWA checks and 54 existing focused component tests
covering private completion/reorder, shared reorder and Dashboard settings
passed. Both controlled characterization runs used Chromium 151.0.7922.34,
one worker and zero retries; the negative assertion failed as intended and
the positive control passed. Final repeated/browser/CI validation is recorded
in the pull request after execution.
The temporary failing diagnostic and incomplete development-server runs are
characterization only and do not count as passing acceptance evidence.

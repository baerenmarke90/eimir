# Deliberate offline checklist recovery — #508

Runtime and tests: `316314b3` (2026-10-16), based on
`main@57d6d2fe1c40de58bf7213020d132c058a318830`.
The evidence commit adds only this record and real browser captures.

## Observed behavior

Eight Chromium journeys passed with zero retries: shared/private checkbox and
reorder, each at 390 px Light and 1280 px Dark, reduced motion enabled.

Each journey opens the actual authenticated collection, waits for authorized
content, activates offline and observes rollback plus the existing localized
error. There is no API write during the failed attempt or automatic write on
reconnect. Private Retry reloads the current list and a separate toggle/move
writes once. Shared Retry explicitly resubmits the failed intent using its
existing version/conflict policy. Confirmation and return preserve the result.
Full-page Axe WCAG 2.2 AA and horizontal-overflow checks pass in all eight error
states. Requests use the existing fixture API; this is real production Web UI
behavior, not a live-backend or native-device claim.

The first browser execution found two setup assumptions in the new tests:
private content must load before going offline, and the application does not
promise an automatic detail read on reconnect. The corrected tests synchronize
on visible loaded content and disappearance of the global offline banner.
No production delay, retry, forced scroll or relaxed accessibility assertion
was added. The enabled Dark delete control exposed an existing 1.7:1 contrast
failure; the shared danger selector now uses the existing error foreground,
surface and border pairing. All full-page Axe assertions remain enabled.

## Captures

For each row, `offline` shows the rolled-back error state and `confirmed` shows
the result of the later deliberate online action. These are full-page captures;
fixed navigation remains in the original viewport rather than the image bottom.

| Flow | Compact Light | Expanded Dark |
| --- | --- | --- |
| Private checkbox | [offline](private-checkbox-offline-390-light.png), [confirmed](private-checkbox-confirmed-390-light.png) | [offline](private-checkbox-offline-1280-dark.png), [confirmed](private-checkbox-confirmed-1280-dark.png) |
| Private reorder | [offline](private-reorder-offline-390-light.png), [confirmed](private-reorder-confirmed-390-light.png) | [offline](private-reorder-offline-1280-dark.png), [confirmed](private-reorder-confirmed-1280-dark.png) |
| Shared checkbox | [offline](shared-checkbox-offline-390-light.png), [confirmed](shared-checkbox-confirmed-390-light.png) | [offline](shared-checkbox-offline-1280-dark.png), [confirmed](shared-checkbox-confirmed-1280-dark.png) |
| Shared reorder | [offline](shared-reorder-offline-390-light.png), [confirmed](shared-reorder-confirmed-390-light.png) | [offline](shared-reorder-offline-1280-dark.png), [confirmed](shared-reorder-confirmed-1280-dark.png) |

## Automated verification

- Ten new characterization cases failed against the original runtime: six
  private offline/cancellation cases and four shared offline cases.
- All 118 focused component cases pass after repair, including the pin, gesture,
  Energy and Vibe consumers of the extracted connectivity check.
- Complete Web unit/component suite: 1,455 passed, one existing skipped test.
- Production build/TypeScript, scoped lint/format, engineering-language audit
  and its 24 tests, and diff checks passed.
- The existing component cases retain success/conflict, duplicate input,
  unrelated updates and scoped private-cache behavior. New settlement cases
  cover success/failure after connectivity is lost without retaining a pending
  write for recovery.

The [preflight](../../../references/508/checklist-offline-repair.md) reuses the
owning issue's existing generated compositions and Mobile Interaction Contracts.
No Free/Premium, Cloud/Self-Hosted, API, persistence or native capability changed.
This bounded repair does not close #508 or claim final #946 Product Acceptance.

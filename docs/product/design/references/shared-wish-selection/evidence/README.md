# Shared Wish selection acceptance evidence

Source revision: `d1d63cdc05d9320a90f35ad53d86417572f45185`, integrated with
main `9e7ef004`. The evidence commit changes documentation and PNGs only.
All content is synthetic and localized through the existing German fixture.
The [manifest](manifest.json) records the image hashes and test source.

## Product journey

The eight Playwright cases exercise the real application routes with strict
HTTP fixtures. They cover entering from the existing Planning hub, assembling
a round, unsaved personal favorites, explicit sharing, a partner publication,
server-projected common favorites, a dated canonical Wish-to-Plan save, the
actual Plan detail, and return to the selection without a duplicate Plan.

[Planning hub](wish-selection-hub-390-light.png) ·
[Round setup](wish-selection-setup-390-light.png) ·
[Private selection](wish-selection-private-390-light.png) ·
[Common favorite](wish-selection-result-390-light.png) ·
[Plan preparation](wish-selection-plan-390-light.png) ·
[No common favorite](wish-selection-no-match-390-light.png)

The negative journey retains input after a failed publication, refuses offline
writes and verifies that reconnecting does not replay them. The no-match journey
labels individual proposals and checks dirty cancellation. Unit tests separately
cover late responses after account changes, source review, withdrawn publication,
round changes, source changes during an active private draft, undated saves and
existing-Plan links. The focused-task mode remains stable during background
updates; adopting new source state requires deliberate draft confirmation. Real PostgreSQL/API tests
verify separate participants and authorization; HTTP browser fixtures do not
claim to establish backend privacy.

## Responsive and accessibility acceptance

[360 Light](wish-selection-result-360-light.png) ·
[390 Dark](wish-selection-result-390-dark.png) ·
[430 Light](wish-selection-result-430-light.png) ·
[Expanded Dark](wish-selection-result-1280-dark.png) ·
[320 with 200% text and reduced motion](wish-selection-result-320-light-large-reduced.png)

Every responsive case checks horizontal overflow and Axe WCAG A/AA issues.
Keyboard/native selection semantics are retained. Motion uses existing feedback
roles and is suppressed with reduced motion. The actual result keeps secondary
utilities in a native disclosure so the Wish and Plan action remain dominant.
Images were visually inspected alongside behavioral assertions.

## Reproduction and limits

From `web/e2e`, run `EIMIR_E2E_PORT=4196 SCREENSHOT_EXPORT_DIR=<this-directory>
node node_modules/@playwright/test/cli.js test tests/shared-wish-selection.spec.ts
--workers=1 --reporter=line`. The server belongs to this worktree.

An initial parallel local launch failed before login with Chromium
`ERR_NETWORK_CHANGED`; inspected traces showed failed module downloads. The
unchanged cases passed serially, then were rerun against the recorded revision.
An earlier fixture returned the same Plan for all status queries; its status
filter was fixed instead of relaxing the product assertion.

This change adds no native capability. No physical-device, live production,
real-couple or deployment acceptance is claimed. Capacitor receives the same Web
flow; existing release/device gates continue to apply.

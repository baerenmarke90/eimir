# Reliable horizontal tab keyboard navigation (#1549)

## Baseline and scope

Follow-up to #1548, based on `b76338d875cae3c07a3f3193e06da5e3cb15b52a`.
The issue records the preflight against the initial #1548 head; its later
lockfile and two unrelated browser-test corrections were incorporated before
delivery. Primary navigation, View Transitions and native startup remain owned
by #1548. This correction changes keyboard event ordering, not the composition,
labels, content, layout, tokens or animation design.

Product Reference v1 R2, the Story/Discovery screen templates and the existing
tab component contract apply. The issue contains the Mobile Interaction
Contract and business/reuse review. A new generated composition is not needed
for this behavior correction; the actual browser states below retain the
existing Compact and Expanded product.

## Confirmed causes

The original handler computed the next tab from the last rendered route value.
Focus moves immediately, while the router can still be waiting to commit that
selection. A second arrow key can consequently select and focus the same tab
again. A second independent guard then discarded a valid reversal because its
destination equaled the previous rendered view.

`StoryProductPage.keyboard.test.tsx` holds the real data-router loader with an
explicitly released promise. Before the fix, two ArrowRight events fail the
second focus assertion. Correcting the event-relative destination alone fixes
focus but fails the final URL assertion: Discover wins instead of the requested
Diary reversal. Removing the stale route guard makes both assertions pass.
No elapsed-time delay, retry, timeout increase or weaker assertion is used.

## Shared contract

`handleTabKeyDown` owns enabled direct native-button tabs in a horizontal tablist.
It derives Home/End/ArrowLeft/ArrowRight destinations from the event's actual tab,
wraps arrows, ignores disabled/hidden tabs and leaves browser/IME shortcuts alone.
An already focused Home/End destination is a no-op. Selection is delegated to the
consumer; no router, domain state, API or generic component framework is added.

Momente, Plan/Wish and recap Month/Year controls reuse this responsibility.
Momente's route setter accepts the final keyboard intent even before a prior
route commits. Existing pointer activation of the selected tab remains a no-op.
Media-gallery arrow handling stays separate because its interaction is different.

## Validation and evidence

- 38 targeted unit/component tests passed, including four held-commit sequences,
  both directions, Home/End, final selected panel, roving tabindex, preserved
  filters, browser Back and selected-tab pointer no-op.
- Seven targeted Chromium browser cases passed: the original Momente journey,
  Plan/Wish keyboard navigation and five recap-library/reader width/theme cases.
- The original Momente journey then passed again on the final source after the
  keyboard evidence captures were added. It includes an atomic two-key burst,
  320/360/390/430 Compact widths, 1440 Expanded, Light/Dark, reduced motion and axe.
- Typecheck, scoped lint/format, browser inventory, engineering-language audit and
  `git diff --check` passed.

Local browser execution uses the existing scratch Chromium 153 harness with
zero retries. Repository browser pins and CI settings are unchanged. Fresh CI
on the published source is required; this is not physical Android acceptance
for #1548's separate native cold-start work.

| State | Actual browser evidence |
| --- | --- |
| Compact, Dark, reduced motion: selected Discover with keyboard focus | [390 px](keyboard-390-dark.webp) |
| Expanded, Light: focus, selected view and filter URL after the two-key burst | [1440 px](keyboard-1440-light.webp) |

All images contain synthetic test fixtures. They were captured from the tested
implementation and serialized losslessly as WebP; no generated or private
relationship content is used as acceptance evidence.

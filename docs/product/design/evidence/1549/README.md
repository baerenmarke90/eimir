# Reliable horizontal tab keyboard navigation (#1549)

## Baseline and scope

Follow-up to #1548, updated to `ad9cbf379016f11540631ed92ba19b194fc418ef`.
The issue records the preflight against the initial #1548 head; its later
lockfile and two unrelated browser-test corrections were incorporated before
delivery. Primary navigation, live-content motion and native startup remain owned
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

## Dependency synchronization after hosted browser failure

The first hosted #1550 run used the older #1548 source. Its primary-swipe case
failed twice at `floating-bottom-nav-scroll.spec.ts:1134` because document-level
View Transition snapshots disabled hit-testing: no readable main-content surface
was available for the next gesture. The same case fails identically locally.
This is separate from the corrected secondary-tab keyboard race.

The updated #1548 source removes the document snapshot overlay and animates the
live main-content element, cancelling motion when the next gesture starts.
The dependency is integrated with an ordinary merge commit, retaining both PR
histories. The six primary-touch journeys pass on the combined source at
360/390/430/1280 px, including reduced motion, immediate consecutive swipes,
Timeline/Planning return context, native-history bounds, and vertical/horizontal
gesture ownership. No test wait, retry or assertion is changed.

Combined local validation: 107 unit/component tests passed, including the shell,
primary swipe and original keyboard regressions. The seven keyboard/library
browser cases were rerun on that combined source as well. Typecheck and scoped
formatting passed. Fresh hosted checks are required for the synchronized commit;
successful checks from the older source are not reused.

The subsequent dependency audit found two remaining accessibility cases that
still expected the old hero H1. #1548 now records the actual page contract:
exactly one localized Wir H1 and the distinct relationship hero H2. Both Compact
and Expanded keyboard/Quick Create/Back/axe journeys pass locally with those
stronger assertions. The audit also checked the existing session/freshness,
Today and partner browser suites for equivalent heading assumptions; no other
obsolete hero-as-H1 assertion remains. These test-only corrections are included
through the dependency merge, bringing the targeted browser evidence to 15
passing cases without changing the product or its accessibility requirements.

| State | Actual browser evidence |
| --- | --- |
| Compact, Dark, reduced motion: selected Discover with keyboard focus | [390 px](keyboard-390-dark.webp) |
| Expanded, Light: focus, selected view and filter URL after the two-key burst | [1440 px](keyboard-1440-light.webp) |

All images contain synthetic test fixtures. They were captured from the tested
implementation and serialized losslessly as WebP; no generated or private
relationship content is used as acceptance evidence.

## Motion-bounds follow-up before merge

A green hosted browser job on the synchronized source contained a real first-attempt
failure: translated live content temporarily enlarged a 360px document to 368px.
Its configured retry hid that transient state. This was reproduced deterministically
by pausing the native main-element animation at its first frame, without adding a
delay or changing the existing overflow assertion. The old source fails at 368px;
the corrected source remains within the viewport and accepts the next real swipe
while the first animation is still paused.

Entrance and sub-threshold snap-back motion now share their existing shell owner
and clipping lifecycle. Completion, cancellation, a replacement animation, the
next gesture, unmount and changes to reduced motion release the bounds safely.
An obsolete completion callback cannot clear a newer animation's bounds. This
changes containment, not the established composition, duration or gesture contract.

#1548 and #1550 merged while this follow-up was being verified. The additional
motion-bounds correction is delivered as a separate follow-up to their merged
`main` source. The final combined source passes 109 targeted unit/component cases
and all 41 cases in the full navigation and accessibility browser suites with
zero retries. Fresh hosted
checks are required for the published combined source; earlier green statuses are
historical evidence only. The affected physical Android device remains outside
this browser correction's acceptance claim.

Actual return-to-Wir screenshots from the zero-retry full browser run:
[360px Light](motion-return-360-light.webp) and
[1280px Dark](motion-return-1280-dark.webp). Synthetic fixtures include the
existing unavailable-insights state; screenshots document composition and fixed
chrome, while the held-frame and real-touch assertions prove transient bounds.

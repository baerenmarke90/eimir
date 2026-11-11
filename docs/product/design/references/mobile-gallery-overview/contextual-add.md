# Contextual creation on Compact

Product Owner follow-up to [#1740](https://github.com/baerenmarke90/eimir/issues/1740)
in [PR #1741](https://github.com/baerenmarke90/eimir/pull/1741).
Reviewed main `3f15be74bc3df6f7f376bd96a4912530cbdb7469` and PR head
`471e31f57f24aa25311b0181a342f94542dea601`. The reviewed app surfaces
were Wir and its partner actions, Momente discovery/diary/map and
Planning's Plans/Wishes/Occasions, the docked navigation, and their existing
create, sheet, detail and return flows.

![Moments and Planning with a contextual plus above four destinations](reference-contextual-add.png)

The built-in ImageGen reference uses the PR's real Compact screenshots. Prompt:
“Compose Momente/Tagebuch and Planen/Anlässe using the attached app screens.
Preserve the cool lavender surfaces, headings, segments and authored content.
Keep four evenly spaced labeled destinations at the bottom. Place one small
filled blue circular icon-only plus at bottom right above the navigation.
Remove both the heading and navigation add buttons on these views.” The lake
photographs are synthetic; production content, icons and tokens are authoritative.

## Mobile interaction contract

- Keep four evenly spaced, docked destinations with the existing active and
  unread states. One icon-only, named create action floats above the measured
  bar on Wir, Momente discovery/diary and Planning. Reserve room to scroll
  and focus the final item above it. It uses the same position across views
  and a minimum 48 dp app touch target.
- Wir and Momente use the existing Moment choices for a diary entry, heart
  moment or milestone. Use the composer terminology for the diary choice.
  Keep the named partner-message entry available apart from partner gestures.
  Existing entitlement and recipient-consent checks govern its destination.
- Planning opens Plan, Wish or Occasion creation directly from the active
  segment. Keep the map action in the heading. More and secondary utilities
  expose their existing named, local actions. Detail, editor and full-screen
  tasks use their own controls.
- Expanded puts local actions in the page heading. The existing Expanded
  browser shortcut is gated by runtime platform. Mobile browser and Capacitor
  share the contextual action and the bottom navigation.
- Reuse the filled add control, shell safe-area geometry, existing Short Task
  Sheet, routes and task origins. Escape/system Back close sheets first.
  Keep draft safety and success/detail return, restoring segment, filter,
  scroll and the invoking action. Preserve loading, sparse, error, offline and
  permission semantics. Keep the bottom action out of the way while a modal
  or keyboard owns the interaction.
- Update the optional tour to demonstrate the Moment action on its actual page.
  Authored content, partner context and active segments remain the focal points.
  Keep existing short pressed/focus feedback and reduced-motion behavior.

## Product, reuse and verification

Product Reference v1 R2–R5 and the Today, Story Timeline and Plan Hub templates
apply. The Product Owner's icon-only preference supersedes the visible-label
requirement for the floating control. Its accessible name remains localized.
Reuse semantic button/link elements, React, CSS fixed positioning and the
existing sheet and task origin mechanisms. A new shell menu, native plugin or
dependency would duplicate these capabilities.

No business/freemium impact. Creation remains subject to the existing Core,
Pro, privacy and Space boundaries. No new provider, transport, operating cost,
quota, export, retention or Cloud/Self-Hosted distinction is introduced.

Validate four tabs, contextual names and direct destinations; sheet dismiss and
focus; save/result/return with a filtered list; Compact and Expanded Web and
the Capacitor runtime boundary; 320 px reflow, large text, light/dark and
keyboard/fullscreen clearance. Capture representative runtime evidence.

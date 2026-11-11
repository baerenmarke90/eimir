# Contextual creation on Compact

Product Owner follow-up to [#1740](https://github.com/baerenmarke90/eimir/issues/1740)
in [PR #1741](https://github.com/baerenmarke90/eimir/pull/1741).
Reviewed main `3f15be74bc3df6f7f376bd96a4912530cbdb7469` and PR head
`471e31f57f24aa25311b0181a342f94542dea601`. The reviewed app surfaces
were Wir and its partner actions, Momente discovery/diary/map and
Planning's Plans/Wishes/Occasions, the docked navigation, and their existing
create, sheet, detail and return flows.

![Moments and Planning with a contextual plus above four destinations](reference-contextual-add.png)

The built-in ImageGen reference uses the PR's real Compact screenshots.
The lake photographs are synthetic. Production content, icons and tokens are
authoritative.

<details>
<summary>ImageGen prompt</summary>

> Use case: ui-mockup, repository design reference for the eimir. Android app. Compose two readable front-on smartphone viewports side by side, Momente/Tagebuch and Planen/Anlässe, using the attached actual app screens as composition references. Preserve the cool lavender surfaces, editorial navy headings, named segments, list of authored content and dates, filter affordance, and subtle selection backgrounds. Replace the green fixture placeholders in Momente with a quiet realistic lake photograph. Match the screenshots' compact layout at ordinary phone scale and crop each to one viewport. In both screens remove the add action in the page header and the plus in the docked navigation. At the bottom keep four evenly spaced icon-with-label destinations exactly 'Wir', 'Momente', 'Planen', 'Mehr' in this order, flush with the viewport, with the current tab marked. Place one small circular filled canonical blue button containing a white plus glyph at bottom right, floating clearly above the tab bar with a gap and safe-area clearance. The floating control is icon-only and has no text, tooltip, badge or caption. Show no other plus. Do not change the page or section structure. No external annotations, no device brand, no headline outside the app, no decorative chrome.

</details>

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

## Runtime evidence

These synthetic fixture captures come from implementation revision
`58a429f15673cf60e764d53beaeb435162217549`.

- [Wir at 360 px, with the create and photo reveal controls separated](evidence/contextual-wir-360-light.png)
- [Moments at 360 px in Light](evidence/contextual-moments-360-light.png) and [390 px in Dark](evidence/contextual-moments-390-dark.png)
- [Moment choices at 390 px in Dark](evidence/contextual-moment-choice-390-dark.png)
- [Planning at 390 px with the Plans segment active](evidence/contextual-planning-390-light.png)
- [The Moments heading action in Expanded Web](evidence/contextual-moments-1280-dark.png)

The browser review covered safe-area and final-control clearance, 320 px
reflow, 200 percent text, Light/Dark and reduced motion. It exercised direct
planning destinations, the Moment sheet, result and filtered return, and the
partner message entry with gestures disabled. The Capacitor platform check
used the production Web shell with an Android runtime fixture.

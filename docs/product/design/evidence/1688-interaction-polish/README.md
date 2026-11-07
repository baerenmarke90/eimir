# Interaction polish evidence — #1688

## Source and provenance

Captured by the bundled Chromium journeys in [run 42365861713](https://github.com/baerenmarke90/eimir/actions/runs/42365861713) on source commit `6aec6f21c77b10a6a85a1997fd2ae4d26b263339`, integration commit `20db7c8cae54ac4f10286431a5cc8d519f2791ca`, baseline main `43cec016ce399acdfcbb2ef8cfca9edeeb06059e`.

These images show the implemented product, not a generated concept or native-device acceptance. The follow-up changes only browser test cleanup, the Today layout fixture clock and this evidence; its production UI is identical to the captured source.

Media come from existing repository demo assets and existing deterministic avatar fixtures. The map uses real Leaflet with intercepted one-pixel tiles, so these captures establish map composition, markers and controls rather than cartographic appearance. The gesture test separately checks real pan displacement and pinch-triggered tile zoom. No user attachment is part of this evidence.

## Reviewed states

| Capture | Observation |
| --- | --- |
| [Occasions, 390 Light](occasions-390-light.png) | The standalone add-day action is filled, has a stable touch target and retains focus after creation; chronological content and peer tabs remain. |
| [Map, 360 Light](map-360-light.png) | Compact fullscreen geometry, map ownership, handle and explicit dismissal. |
| [Map, 390 Dark](map-390-dark.png) | Theme roles, marker and persistent controls. |
| [Map, 1280 Dark](map-1280-dark.png) | Same modal task on Expanded, explicit close and larger map. |
| [Map, 320 Dark, large text](map-320-dark-large.png) | Narrow/large-text control and footer reflow. |
| [Partner actions, 390 Light](partner-actions-390-light.png) | Check-in description removed; existing gestures and one-time-message context remain. |
| [Partner actions, 1280 Light](partner-actions-1280-light.png) | Expanded contextual surface retains the same action hierarchy. |
| [Gallery, 390 Dark](gallery-390-dark.png) | X close control, preserved photograph/counter and touch gallery. |
| [Profile photo, 1280 Dark](profile-photo-1280-dark.png) | Shared gallery X and image-focused viewing after the profile-photo action. |

## Behavioral evidence and correction batch

- Initial Web S8: 2,769 unit/component tests passed, 2 skipped; type, lint, format, foundation checks and production build passed.
- Initial browser run: 3 PR shards passed; the remaining shard had 217 passes and three map cases reaching the final cleanup with a duplicate CDP `touchEnd`. Pan and pinch assertions had already passed. The correction ends only an active contact sequence and retains all assertions.
- The additional-spec job had 270 passes and one existing Today single-photo layout failure. Its hardcoded day-four fixture had crossed the product's three-day attention expiry. The layout suite now fixes its calendar to 2026-10-06 while leaving timers and motion running; no product expiry, assertion, timeout or retry is weakened.
- Important-date open/create/save/read/return, visible button surface/size, 200%/400% reflow and axe journeys passed in the initial run.
- Partner-photo handoff uses the localized “View profile photo” action, opens the shared gallery and restores avatar focus without sending a gesture. Existing cooldown, entitlement, pending and error journeys remain.
- Gallery assertions check an icon-only close control with the localized accessible name/tooltip and at least 44 × 44 CSS px.
- Final post-correction checks and exact head are recorded in [PR #1689](https://github.com/baerenmarke90/eimir/pull/1689). The initial run is not represented as fully green.

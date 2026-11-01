# Automatic relationship duration

Baseline: `921f5eb4c80cff165a005691306d782b1266f13a` (main, 2026-11-01).

This bounded correction keeps the existing R4 CouplePresence masthead and R5
relationship Settings composition (Screen Templates 3 and 8). It removes the
format selector and derives shared time automatically. It does not introduce a
new feature, screen, component, animation, token, provider or entitlement.

## Display contract

- Before the first calendar anniversary: total elapsed days only.
- After a full year with no completed month in the current year: years and
  remaining days.
- With completed years and months: years, months and remaining days.
- Zero remaining days stay visible. Zero months are omitted.
- Calendar arithmetic clamps anniversaries to the end of shorter months,
  including February 29 in non-leap years. Month anchors retain the original
  start day, preventing cumulative drift.
- The shared calculation and localized formatter serve Today and the Settings
  preview. Today derives its reference day from the authoritative server
  `startedOn` and `daysTogether` snapshot, including cached/offline views.
- Legacy display-mode values remain compatible API metadata. Existing records
  need no migration, and saving Settings preserves that required API field.

## Interaction and state review

The relationship and shared-time text remain the focal point. Existing named
navigation, native date input, visibility checkbox, explicit Save action,
version precondition, pending/dirty state, success feedback and Dashboard
invalidation are reused. There is no new keyboard input or gesture. Loading,
missing-date, error and offline handling retain their existing contracts.
Existing semantic styles and wrapping apply on Compact and Expanded; no new
motion is introduced, and browser journeys use reduced motion. Privacy,
relationship ownership, Core eligibility and deployment-model parity remain
unchanged.

## Validation

- 119 focused Web tests passed across the duration helper, Today, relationship
  Settings, Profile and SettingsPage. Cases cover threshold boundaries, zero
  days, singular/plural units, later anniversaries, month ends, leap days,
  missing/invalid/future dates, and both legacy display modes.
- Four browser journeys passed: 360 Light, 390 Dark, 430 Light with 200% root
  text, and 1280 Dark. Each opens Today, verifies the duration, opens relationship
  Settings, verifies the absent selector and identical preview, disables and
  saves visibility, observes the hidden duration on Today, then re-enables,
  saves and returns to the visible duration. Both writes preserve legacy mode
  and use the current version precondition. No horizontal document overflow.
- Typecheck, changed-file lint/format, token and PWA checks, and the production
  Web build passed. Existing bundler directive/chunk-size warnings remain.
- Browser fixtures use synthetic accounts and dates; these captures do not
  claim live-service or physical-device acceptance. All four final-source
  journeys passed. The engineering-language audit also passed after replacing
  newly introduced legacy-copy literals in tests with the existing locale
  resource and explicit selector identity. No CI retry was used.

| State | Today | Relationship Settings |
| --- | --- | --- |
| Compact 360 Light | [Capture](duration-360-light.png) | [Capture](duration-settings-360-light.png) |
| Compact 390 Dark | [Capture](duration-390-dark.png) | [Capture](duration-settings-390-dark.png) |
| Compact 430 Light, 200% text | [Masthead capture](duration-430-light.png) | [Capture](duration-settings-430-light.png) |
| Expanded 1280 Dark | [Capture](duration-1280-dark.png) | [Capture](duration-settings-1280-dark.png) |

No release was built for distribution, published, or requested by this change.

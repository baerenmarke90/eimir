# Gentle prompts — runtime evidence

These are actual Chromium screenshots of the implementation with repository-owned
authorized API fixtures, not generated product references. The fixture contains an
existing two-person Space, ordinary content and a separate daily invitation.
No personal data or credentials are included. [Source fingerprints](sources.json)
identify the tested UI, controller, copy and browser journey. Dependency #1619 at
`977f9c9d07e52c21b6ddd635a5a026173cf85758` is integrated with inspected main
`9bb7bd4673ffbc19965baffbbf07ce6c4ef21d4a`.

| View | Notification settings | Existing Wir context |
| --- | --- | --- |
| Compact 360, Light | [Settings](notification-settings-gentle-360-light.png) | [Writing invitation](today-gentle-360-light.png) |
| Compact 390, Dark | [Settings](notification-settings-gentle-390-dark.png) | [Writing invitation](today-gentle-390-dark.png) |
| Compact 430, Light | [Settings](notification-settings-gentle-430-light.png) | [Writing invitation](today-gentle-430-light.png) |
| Expanded 1280, Dark | [Settings](notification-settings-gentle-1280-dark.png) | [Writing invitation](today-gentle-1280-dark.png) |
| Narrow 320, Dark, 200% text | [Settings](notification-settings-gentle-320-dark.png) | [Writing invitation](today-gentle-320-dark.png) |

All five browser journeys pass with reduced motion and unchanged assertion
deadlines. They verify initial off state, rejected save retaining off, successful
save, persisted/reloaded consent, a single contextual invitation, explicit
dismissal and focus on confirmation, dismissal surviving reload, a distinct later
occasion, blank canonical composer, suppressed already-opened occasion and
coalesced interaction collection. Axe and horizontal-overflow assertions cover
both destinations. The 200% root font is restored by the fixture across reloads
and is asserted on settings and Wir; it is not a screenshot-only style.

The complete 27-case product accessibility spec also passed before the final
coalescing and large-text fixture refinement; the five affected cases then passed
again on the fingerprinted source. Seven focused component tests cover consent,
authorized Memory open, failure/retry, contextual personal exclusion, duplicate
featured-content suppression and a late open completion after leaving to an
editor with an existing draft. The full settings component suite is also covered.

The generated [preflight reference](../compact-reference.png) and
[Mobile Interaction Contract](../README.md) preceded UI implementation. Current
composition keeps one saved personal switch and a quiet contextual continuation;
existing notification groups, device controls, shell and authored content lead.
Confirmed actions reuse inline feedback and semantic focus. No new keyboard task,
configuration matrix, unread surface or celebratory motion is introduced.

Browser fixtures and fake provider calls do not establish real PostgreSQL,
physical device, provider delivery, cold-start or long-background acceptance.
These environmental limits are recorded in the pull request; hosted database,
contract/migration, security and browser checks remain required before merge.

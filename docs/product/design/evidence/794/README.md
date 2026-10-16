# #794 implementation evidence

Captured from the real Web Profile and Wir components with `web/e2e/tests/partner-nickname.spec.ts` and intercepted API fixtures on 2026-09-27. The fixture represents two active partners and models the versioned nickname endpoint; screenshots verify client composition and flow, while PostgreSQL integration tests verify server privacy and concurrency.

| State | Screenshot |
| --- | --- |
| Partner profile before editing, Compact 390, Light | [First-name fallback](nickname-profile-390-light-before.png) |
| Editing, Compact 390, Light | [Focused draft](nickname-profile-390-light-edit.png) |
| Saved, Compact 390, Light | [Saved nickname](nickname-profile-390-light-saved.png) |
| Saved, Compact 430, Light | [430 saved state](nickname-profile-430-light-saved.png) |
| Saved, Compact 360, Dark, 200% text and reduced motion | [Large-text state](nickname-profile-360-dark-large-text-reduced-motion.png) |
| Wir after saving, Compact 390, Light | [Relationship label propagation](nickname-wir-390-light.png) |
| Removed, Expanded 1280, Dark | [Fallback after removal](nickname-profile-1280-dark-removed.png) |

The browser journey opens the partner profile, edits and saves the viewer's nickname with the current If-Match version, observes the updated label in Profile and Wir, returns, removes it, and observes the first-name fallback. The 360/200% state has no horizontal overflow and keeps the action available; reduced motion does not change meaning. The fixture has no shared preference content, so the existing empty state appears around the nickname editor. The screenshot set is implementation evidence, not a replacement for the generated preflight reference.

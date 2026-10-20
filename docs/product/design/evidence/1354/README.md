# Native invitation origin correction

Baseline main: `599e6dd29380c4c79bbe9c8e5fb34ac4e78c227b`. Runtime source: `a2924bdc1e6471260545c55e58084758b3c16b2a`, containing fix `2cd617e552b776740d519bee56eea4d1a222519c`.

This patch changes only the origin passed to the existing invitation URL builder. The Partner Connection composition, controls, text, focus, styling and motion remain unchanged. Product Reference v1 R5 and the existing Settings utility pattern remain the reference; this is not a new or materially changed visual feature.

## Browser evidence

The existing Cloud onboarding browser journey was reused with synthetic API responses: consume signup proof, create the first Space, enter the real relationship Settings route, create a synthetic invitation and inspect the actual panel.

- [Compact 390 px, Light, reduced motion](compact-light.png)
- [Expanded 1280 px, Dark, reduced motion](expanded-dark.png)

The captures show the current production component with a synthetic one-time token. Browser links intentionally use the local browser test origin. They do not claim a public localhost origin for Android: the real consumer regression separately simulates a localhost WebView with a remote configured API and asserts the rendered and copied remote invitation URL. The browser-with-separate-API regression asserts preservation of the actual Web origin. Both preserve URL token encoding.

The journey passed and both sizes have no document-level horizontal overflow. The Compact component capture includes the fixed app navigation because the section is taller than the viewport; normal scrolling keeps the controls reachable. No markup/CSS changed in this patch. Native unit/lint and same-signer APK checks passed, but physical device upgrade, real email links and invitation acceptance remain pending.

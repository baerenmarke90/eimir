# eimir. Pro row in Settings › Account (#1907 D1)

## Generated visual reference (before implementation)

Composed on the real `/more/settings/account` route of `main` `e874c32ae`
(e2e harness with the mocked story timeline fixture, DOM only, nothing saved).

- `00-before-390-light.jpg`: previous state, the full `ProInformationPanel`
  (features, prices, plans link) at the top of the category.
- `01-after-390-light.jpg`, `02-after-390-dark.jpg`: the panel replaced by one
  row in the existing Settings index row pattern (`settings-category-link`,
  Pro icon, title `profiles.premium.title`, one secondary line).
- `03-after-360-light-large.jpg`: 360 px with 200 % root font size.

Kept unchanged: page heading and intro, the sensitive-actions zone (leave the
shared space, delete account) and the bottom navigation. The row opens the
existing Pro page (`ProPaywallPage`, route `/more/pro`), which carries
features, prices, purchase and, with Google Play, the subscription management
action (`proPaywall.manage`). With an active Pro entitlement the secondary line
uses `profiles.premium.rowActive`.

## Implementation evidence

Captured from the implementation branch with reduced motion:

- `10-impl-390-light.jpg`, `11-impl-390-dark.jpg`: Free Space
  (`profiles.premium.rowInactive`).
- `12-impl-360-light-large.jpg`: 360 px, 200 % root font size.
- `13-impl-1280-light.jpg`: Expanded.
- `14-impl-390-light-pro-active.jpg`: Premium entitlement
  (`profiles.premium.rowActive`).
- `15-impl-390-light-opens-pro.jpg`: the row opens the Pro page; Back returns
  to the category.

# eimir. Pro row in Settings › App und Konto (#1907 D1)

Generated visual reference for #1907 D1, composed before implementation on the
real `/more/settings/account` route of `main` `e874c32ae` (e2e harness with the
mocked story timeline fixture, DOM only, nothing saved).

- `00-before-390-light.jpg`: current state, the full `ProInformationPanel`
  (features, prices, plans link) at the top of the category.
- `01-after-390-light.jpg`, `02-after-390-dark.jpg`: the panel replaced by one
  row in the existing Settings index row pattern (`settings-category-link`,
  Pro icon, title `profiles.premium.title`, one secondary line).
- `03-after-360-light-large.jpg`: 360 px with 200 % root font size.

Kept unchanged: page heading and intro, the sensitive-actions zone (leave the
shared space, delete account) and the bottom navigation. The row opens the
existing Pro page (`ProPaywallPage`), which carries features, prices, purchase
and, with Google Play, "Abo in Google Play verwalten". With an active Pro
entitlement the secondary line says Pro is active for both partners.

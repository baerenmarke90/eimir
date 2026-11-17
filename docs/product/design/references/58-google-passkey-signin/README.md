# #58 Sign-in with Google and passkeys: visual reference

Product Owner decision (2026-11-17): add **Google** and **passkey** to sign-in and registration,
including Cloud signup through Google and the native Android passkey bridge (#630). Baseline `main`
`657984b6a`. This folder is the visual preflight required by `AGENTS.md` before UI work starts; no
client code exists yet. The backend half is implemented on the branch `feat/oidc-google-cloud-signup`.

[`prototype.html`](prototype.html) renders one 390 px state per hash (`#signin`, `#signup`,
`#signup-unchecked`, `#exists`, `#settings`, `#android`, `#selfhost`; append `-dark` for Dark). The
images are captures of it, drawn with the tokens of `web/src/theme.css`. It is a composition
reference, not a pixel lock; fonts fall back to the system serif.

| Image | State |
| --- | --- |
| [01](01-signin-cloud-390-light.png), [08](08-signin-cloud-390-dark.png) | Cloud sign-in: Google, passkey, then the e-mail link with the one filled action |
| [02](02-signup-cloud-390-light.png) | Cloud start-together tab: terms first, then Google or the e-mail link |
| [03](03-signup-terms-first-390-light.png) | Same, terms not yet accepted: both ways are disabled with a one-line reason |
| [04](04-google-address-exists-390-light.png) | Google signup refused because the verified address already has an Account |
| [05](05-settings-sign-in-methods-390-light.png), [09](09-settings-sign-in-methods-390-dark.png) | Account settings: sign-in methods with the mailed link, Google and passkeys |
| [06](06-signin-android-390-light.png) | Android app: no passkey button until the native bridge works on that device |
| [07](07-signin-selfhost-390-light.png) | Self-Hosted password sign-in with passkey, mailed link and a generic provider |

## Reviewed baseline screens and functions

Current `main`, `web/src/components/IdentityEntry.tsx` and `LoginExperience.css`, with local Vite and a
mocked `/api/v1/instance/status` at 360, 390 and 430 px, Light and Dark.

- One component renders every unauthenticated state: sign-in, invitation registration, mailed-link
  request, password recovery request, recovery, verification, signup proof and terms acceptance.
- Cloud shows the sign-in / start-together toggle and a passwordless form; Self-Hosted shows
  e-mail and password, the mailed-link action and the forgot-password action.
- Every state above keeps its function. Nothing is removed; Google and passkey are added.
- Defects found and fixed in the same change: The forgot-password action renders as a second filled primary
  button (`.login-card button:not(.secondary)` also matches `.tertiary`); a wrong password shows the
  session-expired copy with a pointless back-to-start link while the intended copy
  (`login.errorFallback`) is unused; the hero headline and the in-card eyebrow, heading and body push
  the first field to the bottom edge of a 390 × 844 screen.

## Mobile Interaction Contract (Compact first)

- Focal point: the sign-in card. One filled action per state (the e-mail link); Google and passkey are
  quiet, equal-weight provider buttons above it, separated by an "or with e-mail link" divider.
- Hierarchy: brand, one shorter headline, the card. The in-card eyebrow and heading are dropped on
  Compact because the toggle already names the mode; the explanation moves below the action.
- Signup: the terms checkbox comes first because Google needs the acceptance before it leaves for the
  provider. Passkeys cannot be created before an Account exists, so signup offers Google and the
  e-mail link only; the settings row and a quiet hint point to passkeys afterwards.
- Account settings list the mailed link, Google (connect/disconnect) and passkeys, with the
  shared filled add-passkey action. Removing the last way in is refused with a plain
  sentence (backend `SIGN_IN_METHOD_LAST`).
- Expanded: same card, centred, `28rem` wide; no second column.
- States: loading while leaving for or returning from Google (a short redirect message), cancelled
  at the provider (back on the form, no error), provider unreachable, address already registered,
  e-mail not verified by the provider, terms outdated, offline, rate limited.
- Motion: reuses the existing card entry; the provider return shows the same loading state as the
  mailed link. No new motion; reduced motion unchanged.
- Privacy: nothing about the partner or Space before sign-in; the provider receives no e-mail address
  from us; a provider name is never shown for other people's Accounts.

## Android and the Capacitor wrapper

- Google runs in the system browser tab (`@capacitor/browser`) and returns through the registered
  native callback (`client: android`). The button appears only when the instance status says
  `nativeAvailable`.
- Passkeys need Credential Manager and Digital Asset Links (#630). Until the bridge reports support on
  the device, the passkey button and the add-passkey action are hidden, not disabled.
- A one-line note that Google opens briefly in a browser tab is shown only in the app.
- Browser-only controls stay hidden from the platform, not from the viewport width.

## Business / freemium and reuse

- Free/Core, non-paywallable access methods (`docs/FREEMIUM-FEATURE-MATRIX.md` v1.31). Self-Hosted
  keeps generic OIDC and passkeys; Cloud adds Google. No quota, storage or downgrade effect.
- Reuse: standard OIDC authorization code with PKCE (already implemented), WebAuthn through
  `py_webauthn` (already used), Android Credential Manager and `@capacitor/browser` for the native
  halves. No Google SDK and no new backend identity code.

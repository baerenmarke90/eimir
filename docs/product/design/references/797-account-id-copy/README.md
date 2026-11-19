# Account ID copy on More (#797)

The Product Owner decided on 2026-11-16 that operators find an account by its
ID instead of by a person's name, so that names can become protected content.
The ID has to be reachable in the app without being a feature anyone notices.
The Product Owner chose the existing account ID with a copy action over a new
short code, and approved this reference before implementation.

## Visual reference

Composed from the real More page of `main` at `9a18f4917` in the browser test
harness, with only the proposed line inserted:
[Compact light](more-account-id-390-light-idle.png),
[Compact dark](more-account-id-390-dark-idle.png),
[after the tap](more-account-id-390-light-copied.png),
[whole page light](more-account-id-390-light-full.png),
[whole page dark](more-account-id-390-dark-full.png).

Reviewed on that page and kept as they are: the root heading, the search entry,
the four destination groups with their rows, badges and unread state, the
sign-out button, the legal links of a Cloud instance, the brand signature and
the Compact bottom navigation. Nothing is removed or reordered.

## Mobile Interaction Contract

- **Human goal:** give support a way to find my account.
- **Placement:** the More footer, directly below sign-out and above the brand
  signature; the same place at every width.
- **Focal point and hierarchy:** none of its own. More stays a destination
  overview with sign-out as its only prominent footer action. The line is
  supporting text in the secondary text colour, without icon, border or fill,
  so it reads as a footnote. It is the one deliberate exception to the filled
  action presentation: it creates nothing and must not compete with sign-out.
- **Action:** one tap copies the account ID (`more.accountId.copy`). No sheet,
  no navigation, no typing. The touch target is 44 px high.
- **What is shown:** the ID itself is never displayed. It only appears,
  selectable, when the device cannot copy (`more.accountId.failed`).
- **Feedback:** the label changes to `more.accountId.copied` for about two
  seconds and returns on its own; a polite status region announces it. No
  motion is added, so reduced motion needs no variant.
- **States:** no loading or empty state, because the ID is part of the signed-in
  session; offline behaves the same. Failure is the fallback above.
- **Compact and Expanded:** identical. Light and Dark use the existing tokens.
- **Privacy:** the ID is an opaque identifier of the signed-in person only. It
  names no partner, Space or content and is not sent anywhere by this action.
- **Native app:** shown in browsers and in the native app alike.

Reused: the More footer layout, `--color-text-secondary`,
`--font-supporting-copy`, `--color-focus`, `--radius-card`, the spacing tokens
and the `sr-only` utility. No new token or component.

## Evidence

Captures of the implemented line by `mobile-header-more.spec.ts`:
[Compact light](../../evidence/797-account-id-copy/more-account-id-390-light.png),
[Compact dark](../../evidence/797-account-id-copy/more-account-id-390-dark.png),
[after the tap](../../evidence/797-account-id-copy/more-account-id-390-dark-copied.png),
[360 px](../../evidence/797-account-id-copy/more-footer-360-light.png),
[430 px](../../evidence/797-account-id-copy/more-footer-430-light.png),
[320 px with large text](../../evidence/797-account-id-copy/more-footer-320-dark.png),
[Expanded](../../evidence/797-account-id-copy/more-footer-1280-light.png).

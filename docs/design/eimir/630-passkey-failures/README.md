# Android passkey registration failures: visual evidence (#630)

Evidence for pull request #2015. Settings, "App und Konto", Sign-in methods: the existing error
notice shows one of three specific messages instead of the generic one. Layout, components and
tokens are unchanged; only the notice text differs.

Captured against the Web build with a stub of the native `Passkeys` bridge (the same synthetic
native transport the browser journeys use) and mocked API responses. They are not device
screenshots. Device acceptance with the signed test build is still required.

| Message key | Cause | Trigger in the capture |
| --- | --- | --- |
| `accountSettings.passkeyAppNotLinked` | `NOT_TRUSTED` | bridge rejects `create` with `NOT_TRUSTED` |
| `accountSettings.passkeyAlreadyOnDevice` | `ALREADY_REGISTERED` | bridge rejects `create` with `ALREADY_REGISTERED` |
| `accountSettings.passkeyServerRejected` | `PASSKEY_CEREMONY_INVALID` | finish call answers 422 with that code |

Views per message: `compact-390-light`, `compact-390-dark`, `compact-360-large-text` (root font
size 200 %), `expanded-1280-light`. File names: `<cause>-<view>.png` where cause is `not-trusted`,
`already-registered` or `server-rejected`.

Observations:

- No horizontal overflow in any capture (asserted while capturing).
- The notice wraps cleanly at 200 % text size.
- At 200 % text the bottom navigation label "Momente" hyphenates. That is existing navigation
  behavior and not part of this change.
- The browser journey that produced these captures is not committed: the change is a text swap
  on an existing notice, so it does not add a browser journey to the PR selection plan.

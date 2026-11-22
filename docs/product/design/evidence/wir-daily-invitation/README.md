# Wir daily invitation next to the plus: evidence

Captured on 2026-11-22 from the running branch: local Vite dev server against
the local API, demo Space, signed in as the demo person Lea, in headless
Microsoft Edge through the DevTools protocol. Each state was a real page load.
A frame probe recorded the position of the quote, the invitation and the plus
on every animation frame. This is not a device capture.

| File | State |
| --- | --- |
| `360-light-1-invitation.webp` | Invitation next to the plus, 360 px, Light |
| `360-light-large-text-1-invitation.webp` | The same at 200 % root font size |
| `390-light-1-invitation.webp` | Invitation, 390 px, Light |
| `390-dark-1-invitation.webp` | Invitation, 390 px, Dark |
| `390-dark-2-into-plus.webp` | The invitation shrinking into the plus |
| `390-light-3-settled.webp` | After it left: the quote has not moved |
| `390-light-4-after-check-in.webp` | After a saved check-in: the row is open and the quote moved down |
| `390-dark-reduced-1-invitation.webp` | Reduced motion, Dark |
| `430-dark-1-invitation.webp` | Invitation, 430 px, Dark |
| `1024-light-1-invitation.webp`, `1024-dark-1-invitation.webp` | Expanded, Light and Dark |

Measured at 360, 390, 430 and 1024 px in Light and Dark, at 390 px with reduced
motion in Light and Dark, and at 360 px with 200 % text:

- The visible quote stayed at one vertical position through the whole opening
  and the departure of the invitation in every run.
- The invitation was vertically centred on the plus with a 4 px gap, did not
  overlap the name, stayed inside the viewport and caused no sideways scroll.
- With reduced motion no flight ran and the invitation was removed at once.
- A second opening on the same day showed no invitation.
- Saving a check-in moved the quote down by 36 px at 390 px. Removing it again
  returned the quote to its first position and did not bring the invitation
  back.

Not covered: the Pixel or another Android device, the Capacitor WebView, and
the Playwright specs, which are left to CI because Playwright is not installed
on the machine used here.

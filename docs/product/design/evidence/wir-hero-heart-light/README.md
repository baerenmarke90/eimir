# Evidence: Wir hero with the distance in the heart and light

Captured on 2026-11-23 from the running web application at the worktree of this
change, signed in to the local demo Space. A local development fixture answered
the entitlement and partner-location reads, so the bands are simulated. It also
hid the demo banner and set a 44 CSS px top inset to stand in for the native
status bar. The portraits show the demo initials.

| File | State |
| --- | --- |
| `390-dark-closest-full-heart.webp` | Closest band: the heart is full and the light is shared |
| `390-dark-far-crescent.webp` | 1,200 km: a thin crescent, each person keeps a tall glow |
| `390-dark-word-after-tap.webp` | After a tap: pin and short word above the heart |
| `390-light-word-after-tap.webp` | The same state in Light |
| `390-light-far-crescent.webp` | 1,200 km in Light |
| `320-light-word-after-tap.webp` | The narrowest supported width |
| `1280-dark-word-after-tap.webp` | Expanded column |

Measured in the same application: the painted word stays centred and clear of
both portrait rings at 320, 360, 390 and 430 CSS px and at 130 % and 200 % text.

The light reaches the top screen edge and fades out inside the next module. The
worst contrast of the small hero text on the painted light at 390 CSS px is
4.55:1 in Light and 4.70:1 in Dark, both at the closest band. After a hop, no
light stays visible on the portraits.

Not covered here: the native Android WebView on a device, and a recording of
the hop. Reduced motion and the once-per-change rule are covered by unit and
browser tests.

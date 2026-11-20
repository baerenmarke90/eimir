# Wir opening pace and rising quote: Compact evidence

Screenshots of the changed Wir states at 390 × 844 in Light and Dark. They were
captured on 2026-11-19 from the local development instance (Vite dev server,
demo Space, signed in as Lea) in the in-app browser pane, not from a device and
not from the Playwright harness. Pixel acceptance and the large-text check are
still outstanding.

| File | State |
| --- | --- |
| `quote-rise-390-{light,dark}.webp` | Left: the "Wie geht's?" row is still there. Right: the row has closed (nobody has set a mark), so the quote and the modules below sit 36 px higher. |
| `quote-rise-expanded-dark.webp` | The same pair at a 1024 px wide window (Expanded), Dark. |
| `opening-390-{light,dark}.webp` | The hero opening at 0.3, 0.7, 1.1, 1.5, 1.9 and 2.7 s: portraits and rings, the two arms reaching out, the heart line drawing as they meet, names, then the time and the location chip. |

How they were taken: the "row shown" and "row closed" frames set and remove
`data-empty` on the own badge in the running page and wait for the transition
to finish. The opening frames pause the real intro animations and seek them to
the stated times, so each frame is the exact state at that time. A real-time
capture of a page load (frames about 0.1 s apart) was also checked by eye for
the order of the steps; its timing is only approximate and it is not kept here.

Large text, checked by measurement at 390 px with the root font size at 100,
130 and 200 %: the row shows 28, 36 and 56 px high while open, closes to 0 px,
and the page never scrolls sideways.

Not covered: Expanded Light, the Pixel device, and reduced motion in a browser
here (every duration resolves to 0 ms, so the final composition shows at once;
the closed row is covered by `today-daily-checkin.spec.ts`, which could not be
run locally because Playwright is not installed on this machine).

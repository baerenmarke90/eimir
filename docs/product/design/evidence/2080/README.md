# #2080 Close the motion guard

Captured with Playwright Chromium on Windows against the mocked API, from the regressions on this branch.

The composition of every screen is unchanged. This step changes how three existing motions are built. The images show the settled result; the geometry is measured by the tests. A real device has not been tested.

## Planen segmented control: open → choose → leave → return

Test: `planning-reference.spec.ts`, "the segmented mark slides onto the chosen tab at …".

Steps:
1. Open Planen.
2. Choose Pläne, then Wünsche.
3. Go to Today and back to Planen.

After each step, the test measures the active mark (the control's `::before`) against the chosen tab: its left edge and its width differ by 0 px. Without reduced motion the mark transitions only `translate`, and never `left` or `width`. With reduced motion it has no transition, as before.

| Image | View |
| --- | --- |
| `2080-planen-segmented-360-light.png` | Compact 360 px Light |
| `2080-planen-segmented-390-dark.png` | Compact 390 px Dark |
| `2080-planen-segmented-430-light.png` | Compact 430 px Light |
| `2080-planen-segmented-390-light-reduce.png` | Compact 390 px Light, reduced motion |
| `2080-planen-segmented-1280-dark.png` | Expanded 1280 px Dark |

Result: 15 of 15 passed (5 views, 3 repeats).

## Herzversteck warmth meter: seek → warm → found

Test: `heart-hunt.spec.ts`, "seeker clears fog, reads the warmth, finds the heart and swaps roles at …".

The test is extended. At "Warm" (meter 65), the fill is the full width of its track in layout and covers 65 % of the track from its inline start. It scales instead of changing `width`.

| Image | View |
| --- | --- |
| `2080-heart-hunt-warm-390-light.png`, `2080-heart-hunt-found-390-light.png` | Compact 390 px Light |
| `2080-heart-hunt-warm-360-dark.png`, `2080-heart-hunt-found-360-dark.png` | Compact 360 px Dark, reduced motion |

## Private area in the vault theme

Test: `private-area-reference.spec.ts`, "private area reflows at 320 CSS px and removes decorative motion". It now checks that every listed transition is instant with reduced motion. The navigation transitions its colours, border and shadow instead of `all`. Its look is unchanged, so no new image is added.

## Open

- Device acceptance on the Pixel: the migration's open device checks stay in #2076 to #2079.

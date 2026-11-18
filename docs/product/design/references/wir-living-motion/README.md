# Wir living motion (Product Owner decision 2026-11-18)

Reference for the arrival motion of the Wir page. The Product Owner compared a calm, a balanced and a vivid prototype of the same choreography on a recorded Compact page and chose the balanced one. The other two sets of values are not kept.

Baseline: `main` `975176599` (after #2032). Surface: the real `/today` page with the "Verbunden" stage, rendered by the Web build against mocked API responses (couple with portraits, a shared moment, three plans, a rediscovery card, a partner note and recent activity). The filmstrips freeze the CSS animations at the listed times, so they show exactly the intermediate states.

| File | What it shows |
| --- | --- |
| `hero-light-filmstrip.png` | Stage, Light, Compact (390 px): 0 to 1800 ms after the first show. |
| `hero-dark-filmstrip.png` | The same in Dark. |
| `modules-reveal-filmstrip.png` | Modules arriving when they are reached while scrolling: header from the left, body rising, the rediscovery card laid on crooked and straightening, the partner avatar glowing once. |

## Choreography

1. **Stage** (once per app start, only at the top of Wir; shares the clock of the existing heart line): both portraits rise into place from the side they stand on, their rings open, names and daily marks follow, the line is drawn, the heart beats twice with one ripple, then everything rests.
2. **Modules** (`useWirReveal`): each module arrives once per session the first time it is reached. Modules in view when Wir opens arrive together in reading order after the stage. The shared moment's photograph zooms out of its frame and its caption rises; plans grow in place one after another.
3. **Scroll** (scroll-driven, no duration): the stage drifts away slower than the page; the moment photograph moves a little inside its frame. Browsers without scroll-driven animations keep the static composition.
4. **Touch**: tappable cards, tiles and the moment give under the finger with the shared pressed-scale token.

## Rules that keep it calm

- Presentation only. Content, focus order and layout are identical from the first frame; pending modules are never `display: none`.
- Returning to Wir from another tab, refetching, and items added to or removed from a module that was already seen never animate. A module that is new to the session (for example the first plan creates the planning module) arrives when it is reached.
- Plans never move sideways: a sideways move widens the scrolling strip for a moment and nudges it (found in review of the prototype).
- Existing tokens only (`--duration-sequence-beat`, `--duration-context`, `--duration-gesture-moment`, `--duration-connection-beat`, `--duration-feedback`, the enter and standard curves, `--control-pressed-scale`). No new token, no new curve.
- Reduced motion: no animation applies and nothing is hidden; the same composition is there at once.

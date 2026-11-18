# Wir living motion (Product Owner decision 2026-11-18, calm strength)

Reference for the arrival motion of the Wir page. The Product Owner compared a calm, a balanced and a vivid strength of the same choreography, first on recordings of the real page (balanced was chosen) and then again as three stages that also show how each keeps living after the arrival; the calm strength was chosen. The other strengths are not kept.

Baseline: `feat/wir-living-motion` (#2037) on `main` `4dbfa9531`. Surface: the real `/today` page with the "Verbunden" stage, rendered by the Web build against mocked API responses (couple with portraits, a shared moment, three plans, a rediscovery card, a partner note and recent activity). The hero filmstrips are real-time captures of the running page (Compact, 390 px, a few frames per second), labelled with the time since the first frame.

| File | What it shows |
| --- | --- |
| `hero-light-filmstrip.png` | Stage and the first module, Light, Compact: portraits fade in, the line is drawn, names follow, "Euer Moment" rises in. |
| `hero-dark-filmstrip.png` | The same in Dark. |
| `moment-rotation-filmstrip.png` | The shared moment rotating through three photographs and a clip on a real-time capture every 4 s: cross-fade at 4 s, the quiet progress marks and the pause control at the top right, the clip playing silently at 12 s. |

## Choreography

1. **Stage** (once per app start, only at the top of Wir; shares the clock of the existing heart line): both portraits fade in together in place (the partner a beat later), their rings open, names and daily marks follow and the line is drawn. No heartbeat, no ripple.
2. **Modules** (`useWirReveal`): each module arrives once per session the first time it is reached, with a short rise and fade. Modules in view when Wir opens arrive together in reading order after the stage. The shared moment's caption fades in after its photograph; plans fade in one after another.
3. **The rest** (the only looping motion on Wir): the rings around the two portraits breathe very slowly, one after the other (scale 1 to 1.035, opacity 1 to 0.72, `--duration-connection-travel-far`, the travel curve), starting after the arrival. The breath sits on the decorative ring, never on a portrait, so tap targets and the send flights never move. No scroll-driven drift, no photograph zoom or parallax.
4. **Shared moment rotation** (Product Owner, same day): when the memory has several pictures the moment changes picture on its own (photograph 8 s, clip silent for at most 10 s, slow cross-fade with no zoom; the calm strength also applies here). Only ready, non-sensitive photos and clips take part (server-side), at most five. It pauses while hidden, off screen, hovered, focused or paused by the person; with reduced motion the first picture stays and there are no controls. Backend: `DashboardItem.gallery` on the Keepsake only.
5. **Touch**: tappable cards, tiles and the moment give under the finger with the shared pressed-scale token.

## Rules that keep it calm

- Presentation only. Content, focus order and layout are identical from the first frame; pending modules are never `display: none`.
- Returning to Wir from another tab, refetching, and items added to or removed from a module that was already seen never animate. A module that is new to the session (for example the first plan creates the planning module) arrives when it is reached.
- Plans never move sideways: a sideways move widens the scrolling strip for a moment and nudges it (found in review of the prototype).
- Existing tokens only (`--duration-sequence-beat`, `--duration-context`, `--duration-gesture-moment`, `--duration-connection-beat`, `--duration-connection-travel-far`, `--duration-feedback`, the enter, standard and travel curves, `--control-pressed-scale`). No new token, no new curve.
- Reduced motion: no animation applies and nothing is hidden; the same composition is there at once.

# Picture ping-pong (#1907 H3, concept B)

## Product Owner decision and baseline

On 2026-11-16 the Product Owner approved concept B of the apart-game proposal
(picture ping-pong) as shown in the clickable prototype and asked for it to be
built as it is (quoted verbatim in the #1907 H3 sub-bullet).
Reviewed baseline: `main` `f1ef9074d`. Reviewed owner: the existing Games shelf
(`GamesProductArea`, three entries: `games.entries.moments`,
`games.entries.wishes`, `games.entries.perspective`) and the existing game pages. The new entry joins
the shelf as a fourth card (`games.entries.pingPong`) with the
same card grammar, status chip and Premium behaviour; existing entries are
unchanged.

The visual reference for this slice is the Product Owner's approved clickable
prototype (the generated composition) plus the runtime captures below, taken at
390 px from the implemented page: the drawing turn in Light
([runtime-draw-390-light.png](runtime-draw-390-light.png)) and the finished
picture in Dark ([runtime-done-390-dark.png](runtime-done-390-dark.png)); the Expanded
composition at 1280 px is [runtime-draw-1280-light.png](runtime-draw-1280-light.png).

## Mobile Interaction Contract

1. **Goal:** partners who are apart keep one small shared thing going: a picture
   they add to in turns.
2. **Emotional value:** a gentle, playful "I was here" trace; no score, no race.
3. **Primary Compact state:** the shared picture as a square in a raised card,
   status line (`games.pingPong.turnYou` / `games.pingPong.turnPartner`), the two partners with
   the flight arc between them, six turn dots.
4. **Dominant action:** `games.pingPong.send` (filled, full width) on the own
   turn; `games.pingPong.saveToMoments` after the last turn.
5. **Hierarchy:** status, then the picture (focal point), then turn dots, then
   tools, then the quiet `games.pingPong.finishEarly`.
6. **Disclosure:** early finish is a one-step inline confirmation; title
   suggestions appear only for a finished picture.
7. **Pattern:** one page under Games (like the other games); no sheet.
8. **Loading / Empty / Error / Offline:** loading state with copy; empty state
   (`games.pingPong.emptyTitle`) with the starting choice (squiggle or blank
   page, see [live sync](../1907-h3-live-sync/README.md)) and one start button; failures use the shared problem
   state with retry; a stale turn (409) reloads the picture and says so; the
   draft survives a reload per picture and turn (session storage), nothing is
   sent offline.
9. **Success:** the picture flies to the partner and the status switches to
   `games.pingPong.turnPartner`; saving shows `games.pingPong.saved` with a link.
10. **Privacy / relationship state:** only the two partners of the Space; the
    picture holds strokes and turn state, never a location; the flight
    reads the existing Premium distance band and shows its H4 word only when the
    partner shares, otherwise the same flight with no label and no hint.
11. **Large text / narrow:** controls wrap, targets are at least 44 px, no
    horizontal overflow at 320/360/390/430 px and 200 % text.
12. **Motion:** one-shot flight (`--duration-gesture-moment` scaled by the
    distance band, arc height by band) that ends on its own; reduced motion hides
    the flight, the status line, the sent note and the caption carry the same
    information.
13. **Expanded:** one bounded centered column (max 40 rem); same composition.
14. **Typing:** none. Colours, undo, titles and sending are taps; the canvas is
    direct manipulation.
15. **Platform patterns:** pointer drawing with `touch-action: none`, native
    buttons and radios, system Back leaves the page without losing the draft.
16. **Table/list justification:** none used.
17. **Visual acceptance:** runtime captures (Compact Light/Dark, Expanded
    column) and the browser journey `picture-ping-pong.spec.ts`.

**Update 2026-11-17:** the picture is read live while the page is open, so a
partner's hand-over, early finish or new picture appears without leaving the
page, and the opener chooses between the squiggle and a blank page. Contract,
reuse and business review: [live partner sync](../1907-h3-live-sync/README.md).

## Reuse, business and quality

Reused: `PageHeader`, `UiState`, `ProblemState`, `PersonIdentity`,
`TaskBackLink`, person colour roles, `--photo-mark-yellow` for sun yellow, the
motion duration/easing tokens, the existing attachment upload and Memory
creation path for the explicit save, the existing distance projection
(`usePartnerDistanceLine`) and H4 wording. No dependency or provider is added.

Business/freemium: reviewed, part of the Premium `games.couple` row
(`docs/FREEMIUM-FEATURE-MATRIX.md` v1.26, wording only, no new capability, no
per-game limit). Self-Hosted equals Cloud. Managed cost is negligible (a
bounded stroke list per Space, one notification kind). A downgrade stops new
turns; the stored picture and any saved Memory remain.

Cross-cutting: the server validates colour, stroke count (1 to 3 per turn),
point count (2 to 240 per stroke) and the 0 to 1000 grid, turn order and a
stale-turn token; the payload is stored through the protected-payload column;
the picture is dropped when the couple changes; the notice follows the #515
catalog (preference inheritance from "Thinking of you", quiet hours, per
recipient coalescing, stale once the recipient has handed over). Drawing is
direct manipulation and has no keyboard alternative in this first slice; every
other control is keyboard operable.

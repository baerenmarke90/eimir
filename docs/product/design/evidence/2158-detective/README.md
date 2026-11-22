# Evidence: Wish detective answers stay hidden in the Wishes tab (#2158 H)

Captured on 2026-11-21 from this branch with Playwright Chromium (390 × 844 CSS px, device scale 2, reduced
motion) against a local backend of this branch and the canonical demo Space. Alex started a game at a distance
(`POST …/games/wish-detective`), so Lea is the guesser of the first round; she was signed in through the UI and
opened Planen → Wünsche by tapping.

| File | Shows |
| --- | --- |
| `wishes-tab-de-390-light.png`, `-dark.png` | Lea's open wishes during the game: her own wishes stay in the alphabet; Alex's two open wishes are placeholders in their own group (`wishConcealment.groupTitle`, "In Wish detective" in English) below it, naming only who wished them, with a link to the game. The rows open nothing. |
| `wishes-tab-en-390-light.png` | The same in English. |
| `wish-detail-de-390-light.png`, `-dark.png`, `wish-detail-en-390-light.png` | The detail of a hidden wish (reached as from a notice or a linked Moment): no title, no menu, no actions, only when it will be revealed and the way to the game. |
| `wishes-tab-de-1280-light.png`, `-dark.png`, `wish-detail-de-1280-light.png`, `-dark.png` | Expanded (1280 × 800): the same group in the centred Wishes column; the detail note in the composer detail column. |
| `wishes-tab-de-320-200pct-light.png`, `wish-detail-de-320-200pct-light.png`, `*-390-200pct-light.png` | 200 % text (root font size doubled) at 320 and 390 px: the placeholder rows and the detail note reflow; measured horizontal overflow 0 px on list and detail at both widths. Long words in the letter-spaced eyebrow break like other eyebrows of the app. The detail capture is a full-page capture, so the fixed bottom navigation appears over the middle of it. |
| `wishes-tab-after-end-de-390-light.png` | After Alex ended the game: Alex's wishes are back in the alphabet with their titles. |

Behavior covered by tests rather than screenshots:

- Server: `backend/tests/integration/test_wish_detective_concealment.py` (placeholders for the guesser, owner
  unaffected, reveal per round and at the end, Search, Wir, activity titles, the one-phone pool, Wish selection,
  refused writes, plugin absent → nothing hidden).
- Web: `SharedPlanningOverviewPage.test.tsx` (placeholder group, no empty state when only placeholders remain),
  `WishProductPage.test.tsx` (placeholder detail without actions), `WishDetectiveGamePage.test.tsx` (the wish
  titles are loaded only for a game on one phone; the sparse state before a mode comes from the server's
  readiness).

Motion: none added. The placeholders are static; after the reveal the next load shows the wishes in the alphabet.

Not covered: native Android was not captured (no device or emulator here).

# #2371 Pick favourites in the shared Wish selection with a card deck

Captured with Playwright Chromium from `web/e2e/tests/shared-wish-selection.spec.ts`, run with `SCREENSHOT_EXPORT_DIR`. The API is mocked.

- `wish-selection-deck-<width>-<theme>[-large-reduced].png`: the first card of a fresh choice (two candidates) at 360 Light, 390 Light and Dark, 430 Light, 1280 Dark (Expanded), and 320 Light with 200 % text and reduced motion. With large text the two buttons stack, and long titles hyphenate.
- `wish-selection-favorites-<width>-<theme>[-large-reduced].png` and `wish-selection-private-390-light.png`: the summary list after the deck. The first candidate is a favourite, the second was left out, and "Favoriten abschicken" stays the single primary action.
- `wish-selection-deck-swipe-390-light.gif`: a real pointer swipe right on the first card, then "Eher nicht" on the second, and the hand-over to the list. It plays at normal speed first, then 4× slower.

## Behaviour checked

- **Open → swipe → summary → send → return** (`mobile round -> private selection -> …`):
  - a real swipe right makes the first card a favourite, and the second card is left out with the button;
  - the summary list shows the result and has not sent anything yet;
  - sending, the partner's result and the dated Plan continue as before.
- **Failure and offline** (`publication failure/offline retain …`): a favourite chosen in the deck survives a failed send and an offline attempt, with no replayed write.
- **Pro date ideas** (`wish-selection-date-ideas.spec.ts`): the deck shows the Wish first, then the ideas in round order; the summary shows the chosen ones.
- **Each width and theme** (`composing and choosing at …`): no horizontal overflow and no axe (WCAG 2.2 AA) violation on the deck, and the same checks on the summary list.
- **Unit level** (`WishSelectionPage.test.tsx`):
  - progress in the card's name ("1 von 3"), and only the top card exposed;
  - "Lust drauf", Arrow Left, "Vorige Karte" and the hand-over to the list;
  - the decision announcement;
  - the sent ids;
  - saved favourites open the list directly.
- **Gesture follow, two-sided** (`follow.test.ts`):
  - commits on each side, and `onSettled` fires only after the settle;
  - a short slow swipe cancels on either side;
  - `commit(side)` works for buttons, and reduced motion settles at once;
  - an interrupted settle reports nothing.

## Outstanding

Pixel device acceptance on an Android test release: the swipe feel, the commit haptic, and vertical page scrolling that starts on a card.

# #2077 Content areas on the motion layer

Captured with Playwright Chromium on Windows against the mocked API. The Planen images come from `web/e2e/tests/planning-reference.spec.ts`, describe block `content areas on the motion layer (#2077)`, run with `VISUAL_EVIDENCE_DIR`. The other images are the existing specs' own captures from the same run on this branch.

The composition of every screen is unchanged. This step moves motion onto the layer. The images show the settled result; the motion itself is checked by the assertions listed below. A real device has not been tested; see "Open".

## Planen search: Open → interact → observe → close → return

`2077-planen-search-<view>.png` (field open, a search typed, the result shown) and `2077-planen-return-<view>.png` (after Wir and back to the kept Planen tab).

Views:
- Compact 360, 390 and 430 px in Light and Dark;
- 390 px with 200 % text;
- 390 px with reduced motion;
- Expanded 1280 px in Light and Dark.

Asserted in each view:

- **Open:**
  - the search icon opens the field and moves the focus into it;
  - the field animates with `eimir-motion-surface-in` (opacity and a short translate from the inline end) and never with `clip-path`;
  - with reduced motion there is no animation.
- **Interact and observe:** typing filters the plans to the matching one, with no horizontal overflow.
- **Close:** clearing and leaving the field folds it back (`eimir-motion-surface-out`), and the icon returns.
- **Return:**
  - Wir and back to Planen restores the panel with no one-shot CSS animation running in it;
  - nothing replays (M4), and the search rests as its icon.

## Other areas

- `2077-wish-journey-fulfilment-<view>.png` (360 Light, 390 Light and Dark, 430 Light): a fulfilled wish.
  - The reached step's connector grows along its length (`eimir-motion-enter-reach`, never its width).
  - Its dot and label arrive with `eimir-motion-enter-grow`, or with `eimir-motion-enter-fade` under reduced motion (asserted in `wish-journey.spec.ts`). The images show the settled state after all animations finished.
- `2077-wir-connected-moment-390-light-reduced-motion.png`: the connected moment on Wir with reduced motion.
  - It is the static composition, with the same title and line and the `aria-live` announcement.
  - `data-playing` marks the first showing, and `data-moment="final"` keeps the beats still (asserted in `quiet-hints.spec.ts` and the unit tests).

## Behaviour checked elsewhere

- **Shared list:** an entry that was checked or put back arrives in its new place with `eimir-motion-enter-travel`, and with a 0 s duration under reduced motion (`shopping-list-offline.spec.ts`).
- **Received gesture (`partner-quick-actions.spec.ts`):** the receipt and its reduced-motion composition are unchanged, and there is no wave with reduced motion. The new unit tests (`contentMoments.test.tsx`) cover the rest:
  - it plays once per item;
  - it keeps playing on a second render;
  - it settles behind another Moment;
  - it is final with reduced motion.
- **Kept-tab returns** on Wir and Momente replay no entrance (`today-daily-checkin.spec.ts`, `momente-discover-canonical.spec.ts`, `story-discover-tapestry.spec.ts`).
- **Discreet plans:** hiding is instant, and revealing fades (`discreet-plans.spec.ts`).

## Open

- Pixel acceptance on an Android test release: the handmade sway, the receipt and connected-moment haptics, and the purchase and invitation success haptics.

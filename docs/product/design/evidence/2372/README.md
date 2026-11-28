# #2372 An opened once message writes itself by hand

Captured with Playwright Chromium from `web/e2e/tests/once-messages.spec.ts`, run with `SCREENSHOT_EXPORT_DIR`. The messages are really encrypted between two browser contexts; the server is mocked.

- `once-open-handwriting-writing-390-light.png`: about 1.1 s after opening. The partner's words are halfway written.
- `once-open-390-light.png`, `once-open-360-dark.png` and `once-open-430-light.png`: the finished handwriting, wrapped to the reading width. While a message is open, the page title is visually hidden (Product Owner, 2026-11-28) and stays the page's heading for assistive technology, so the words lead below Back and the sender line.
- `once-open-320-light-large-reduced.png`: 320 px with 200 % text and reduced motion. The handwriting appears finished at once and grows with the text size.
- `once-voice-390-light.png` and `once-photo-390-light.png`: voice and photo-only messages, unchanged.

## Behaviour checked

- **Open → read → leave → reload** (`two devices exchange …`):
  - the words are readable text for assistive technology from the start, and the strokes are decorative;
  - the writing plays (`data-phase="playing"`) and rests (`final`);
  - the encrypted content, the secure screen, clearing on leaving and the one-time view are unchanged.
- **Per width and theme** (`an opened message written by hand at …`): the finished state, no horizontal overflow, and no axe (WCAG 2.1 AA) violation in the reading view.
- **Unit level:**
  - `handwritingLayout.test.ts`:
    - pen-order timing;
    - wrapping and line breaks;
    - umlauts and substituted quote marks;
    - the normal-type fallback for emoji, other scripts, long and empty text.
  - `HandwrittenMessage.test.tsx`:
    - readable words and decorative strokes;
    - one play within the cap, and no replay on a remount;
    - a tap and reduced motion show the finished words;
    - the fallback.

## Outstanding

Pixel device acceptance on an Android test release: the writing rhythm, the tap to finish, and screenshot protection while it writes.

# #2372 A handwritten greeting writes itself when a once message opens

Captured with Playwright Chromium from `web/e2e/tests/once-messages.spec.ts`, run with `SCREENSHOT_EXPORT_DIR`. The messages are really encrypted between two browser contexts; the server is mocked.

- `once-open-greeting-writing-390-light.png`: about 450 ms after opening. The German greeting (English "for you") is half written, and the message below is already readable.
- `once-open-390-light.png`, `once-open-360-dark.png` and `once-open-430-light.png`: the finished greeting above the sender line and the message.
- `once-open-320-light-large-reduced.png`: 320 px with 200 % text and reduced motion. The greeting appears finished at once.
- `once-voice-390-light.png` and `once-photo-390-light.png`: the existing voice and photo messages, now with the greeting above them.

## Behaviour checked

- **Open → read → leave → reload** (`two devices exchange …`):
  - the greeting's readable text is the localized i18n string, and the strokes are decorative;
  - it writes (`data-phase="playing"`) and rests (`final`);
  - the encrypted content, the secure screen, clearing on leaving and the one-time view are unchanged.
- **Per width and theme** (`the handwritten greeting on an opened message at …`): the finished state, no horizontal overflow, and no axe (WCAG 2.1 AA) violation in the reading view.
- **Unit level** (`HandwrittenGreeting.test.tsx`):
  - readable text and decorative strokes with `pathLength="1"`;
  - one play per message, and a remount shows the final state;
  - reduced motion shows the final state;
  - pen-order timing fractions that add up to 1.

## Outstanding

Pixel device acceptance on an Android test release: the stroke rhythm on a real screen and the screenshot protection while it draws.

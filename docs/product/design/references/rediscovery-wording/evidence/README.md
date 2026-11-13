# Rediscovery wording implementation evidence (#1790 C2)

Captured by `web/e2e/tests/rediscovery-wording.spec.ts` against the
production bundle with mocked API responses (fixed day 2026-11-13, reduced
motion). Both rediscovery surfaces are shown:

- `wir-*`: Wir "Erinnert ihr euch?" card.
- `momente-*`: Momente "Wisst ihr noch?" featured card (the Momente tile below
  it shows the same Wir item with the same wording).
- `*-untitled-*`: no authored title; a variant is the headline and the date is
  the secondary line.
- `*-titled-*`: authored title as headline; variant and date on the secondary
  line.

Widths 360/390/430 px, Light and Dark, and 200 % text (`*-large-text`).

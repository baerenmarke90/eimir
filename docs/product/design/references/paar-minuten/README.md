# Paar Minuten: mobile interaction contract

Baseline: GitHub `main` at `146708719e469f1d86656e632c7c4145ee1bc3c3`.
Reviewed the real `/games` screen through the existing Playwright journey at
390 px (Light) and 1280 px (Dark). "Unsere Momente", "Wunschdetektiv" and
"Wer von euch?" stay in the same order with their existing behavior. Keep the
"Mehr" selection in the bottom bar; the quick card deck is one additional
game, rather than a new navigation destination.

- **Goal:** play something together in two to five minutes using a shared
  phone. Cards are conversation, guessing or imagination games selected for
  easy setup. They are separate from dates a couple would save or schedule.
- **Compact:** add the fourth shelf entry after the three existing games.
  On open, use the existing local game pattern. The card itself is the
  focal point: game title, card count and estimated minutes, then the card's
  name, any materials, and short rules. "Nächste Karte" is the only primary
  action, below the rules, with the shared full-width Compact button.
  On the final card the action returns to the first. There is no mandatory
  session length, scoring, timer, input, keyboard, or result form.
- **Return:** reuse the shell's `TaskBackButton` to return to the selected
  game entry and restore focus. Use one chevron in the shell; the generated
  mockup's extra textual return button is illustrative and is omitted.
  The established single-card session pattern supplies the focused task; see
  [Screen Templates, §2](../../../../SCREEN-TEMPLATES.md#2-shared-screen-anatomy).
- **States:** existing Games entitlement loading, error/retry and Free
  preview are reused; Free cannot enter the deck. An available deck opens
  already ready to read and play. No empty or fetch-error state is needed for
  the bundled deck. An already open card can be used offline while the
  current Games capability is available. Advancing reveals the next card and
  moves focus to its heading; leaving discards the transient index.
- **Privacy:** the existing Space capability `games.couple` determines
  access. No profiles, history, answers, dates, wishes or plans are read or
  written while playing. No device permissions, provider, or new telemetry.
- **Reflow and motion:** one flowing column, no fixed card height, no
  truncation or sideways swipes. At expanded widths, center that column and
  keep its reading measure. Reuse PageHeader, TaskBackButton, the Games
  shelf pattern and semantic surface/spacing/type/button tokens. A deck has
  no transition animation; existing shell motion respects reduced motion.
- **Acceptance:** open via More → Games on a Pro Space, play or skip a card,
  see the next title and read its rules, finish the deck and restart or
  return to the shelf with focus restored. Check existing game entries and
  a Free Space. Capture populated shelf and open card at Compact and Expanded,
  Light and Dark; check 320 px, 360 px, 390 px, 430 px, 200% text/reflow,
  touch target, keyboard order and reduced motion. Product Reference v1
  governs shell, typography, spacing, and the single dominant action.

## Generated reference

[Compact shelf and card](compact-reference.webp) was generated with the
project's built-in OpenAI ImageGen workflow on 2026-11-15. Input: the image
captured from the baseline 390 px Light Games browser test. The image is a
project-owned illustrative design reference. It does not ship in the app.

Exact prompt:

```text
Use case: ui-mockup. Design preflight for eimir., a quiet and playful German partner app. Create a high-fidelity two-screen smartphone design reference side by side at 390 px wide per device, vertical scroll screen, pure app UI no hardware decoration. Input image is current eimir. “Gemeinsam spielen” at main 146708719e469f1d86656e632c7c4145ee1bc3c3. Treat it as reference for actual navigation, tokens, hierarchy, serif headings / sans body. Maintain sufficient contrast in text; the frame is a compact relationship app, calm light lavender backdrop and violet-blue existing accents, no generic white enterprise dashboard, no flat carousel or advertisements.

Left screen: preserve the current top chevron, “Gemeinsam spielen”, “Erinnerungen erraten und Neues übereinander erfahren.” and the three existing distinct rows in this order, unchanged in meaning, with the visible titles “Unsere Momente”, “Wunschdetektiv”, “Wer von euch?”. Append a fourth matching smaller row at the end within the vertical scroll: label “LOSLEGEN”, title “Paar Minuten”, description “Kleine Spiele für zwischendurch. Ein Handy reicht.” and quiet “Spielen” pill. Use a small existing-style outline card-stack icon. Show the fourth row via a lightly taller scroll capture to make its placement obvious. Preserve bottom navigation Wir · Momente · Planen · Mehr with Mehr selected. 
Right screen: same application shell and bottom bar. A single clear return control “Zur Spieleübersicht” near the start of content, heading “Paar Minuten”. One large reading card, with a small “1 von 8 · 3 Min.” label, large serif title “Eine ist erfunden”, one short materials line “Ihr braucht: nichts”, and the rules “Erzählt abwechselnd drei kurze Dinge über euch. Zwei sind wahr, eins ist erfunden. Die andere Person rät, was erfunden ist.” Use the existing soft low-contrast card fill, accessible text contrast and phone margins. One dominant reachable blue primary button under the card “Nächste Karte”. No typing, ads, progress overlays, countdown or a new navigation item. Show only these two screens with correct German accents, no outer legend.
```

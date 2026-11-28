# Wir reel styles (#2345)

Product Owner decision, 2026-11-28. Design: `docs/superpowers/specs/2026-11-28-wir-reel-styles-design.md`. Follow-up, not commissioned yet: #2361 (Wir designs adopt the styles).

Below the Wir hero sit two reels: new-for-you notices (`wirNotices`) and waiting games (`games.waiting`). Each person chooses how they look under Settings › Darstellung › `wirReelStyleSettings.title`. The choice is personal, never shared with the partner and part of the personal export. Settings is the only entry point; Wir has no link to it.

| Style | Tier | What it shows |
| --- | --- | --- |
| Kreise (`circles`) | Free, default | 64 px content circles with the title below in up to two lines (#2351). |
| Kacheln (`tiles`) | Pro | The larger tiles of #2349: kind, a content preview (time, calendar leaf, up to three list entries, quote, reaction, heart, drawing) and the line. Game tiles show the picture, title and reason. |
| Chips (`chips`) | Pro | Pills with a tinted fill and no border, a 34 px round face (the circle's face, scaled) and one line of text. Unlike draft C, the section titles stay visible (Product Owner, 2026-11-28). |

## Chip text (draft C)

- A notice shows its title.
- A comment shows its quote before the title: „Again!" Sunday by the sea.
- A date proposal shows the weekday and day after the title: Picknick So 29.
- A Heute item shows its time before the title: 19:30 Dinner with Lena.
- A game shows its short label (`games.waiting.labels.*`): Pingpong, Saatgut, Strauß.
- Long text ends in an ellipsis at a maximum chip width. The link's accessible name keeps the title, kind, quote, line and count.

## Shared behavior

- Every style shows the same items in the same order, with the same read on opening and the same refresh when Wir is shown again (#2353).
- The card arrival plays once per item and device. Switching the style in the kept Wir tab replays nothing.
- On a device without a remembered style, both reels wait for the style read and appear once, in the right style. Wir itself is not held back.
- Press feedback (a slight scale) runs only without reduced motion.
- A saved Pro style stays after Pro ends. A Free person who picks a Pro style is led to the Pro page.

## Evidence

`web/e2e/tests/wir-new-for-you.spec.ts` saves `2345-reel-<style>-<width>-<theme>.png` (Kacheln and Chips at 360/390 Light, 390/430 Dark) and `2345-reel-<style>-360-large-text.png`. Pixel device check after merge, on request.

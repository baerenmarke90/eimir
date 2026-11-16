# Person colour pairs #1958: visual evidence

Owning issue: [#1958](https://github.com/baerenmarke90/eimir/issues/1958), pull request #1959.

## How the images were produced

Real screenshots of this branch (after the stronger deep shades, based on `main` at `ede2aab70`) running locally against its own
backend and a separate database with the canonical demo space, signed in as the demo person Lea. Rendered with
Playwright and Chromium at 390 px (smartphone, 2x) and 1280 px (Expanded), in Light and Dark. They are not
output of an image-generation model, and they are not device screenshots: the Pixel check is still open.

Lea starts on Automatic (blue for herself, rose for Alex). The script then chooses "Rosé + Tiefes Rosé", saves
through the profile Save button and takes the Wir and shared-list screenshots, which proves that saving recolours
the app. The setting was reset to Automatic afterwards.

## Images

| File prefix | Shows |
|---|---|
| `profile-choice-<width>-<theme>` | The "Eure Farben" question in the profile edit form: automatic plus eight pairs |
| `profile-choice-large-text-390-light` | The same form with the root text size at 200 % (approximation of large text) |
| `wir-automatic-<width>-<theme>` | Wir stage with the default pair |
| `wir-rose-deeprose-<width>-<theme>` | Wir stage after choosing rose and deep rose: two clearly different rings and heart-line arms |
| `list-rose-deeprose-<width>-<theme>` | A shared shopping list after the choice: markers, bar and cart bar |

## Observations

- Both partners stay distinguishable by lightness in every theme; names and initials sit next to every colour.
- The first capture showed the base and deep shades too close together (Product Owner feedback). The deep shades
  were darkened in Light and made more saturated in Dark, so rose against deep rose and blue against deep blue
  now differ by about 19 to 25 in OKLab distance (x100, was 10 to 14), and the marker fills differ clearly in Dark.
  Values are in `docs/product/design/person-colour-pairs.md`.
- The element screenshots of the profile form at 390 px show the sticky bottom navigation over the last row; the
  row itself is fully reachable by scrolling.
- Avatar placeholders (initials on the neutral avatar disc) are intentionally unchanged.
- Not covered: a real device, reduced-motion capture and a screen reader pass.

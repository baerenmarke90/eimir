# Person colour pairs #1958: visual evidence

Owning issue: [#1958](https://github.com/baerenmarke90/eimir/issues/1958), pull request #1959.

## How the images were produced

Real screenshots of this branch running against its own backend and a separate database with the canonical demo
space, signed in as the demo person Lea.

- `settings-*`, `wir-*`, `list-*`: Playwright with Chromium at 390 px (smartphone, 2x) and 1280 px (Expanded), in
  Light and Dark.
- `pixel-*`: the Product Owner's Pixel 10 Pro Fold (outer display), a debug build of this branch installed beside
  the real apps and removed afterwards. The Pro paywall path was not exercised on the phone; the demo space has Pro.

They are not output of an image-generation model.

Lea starts on Automatic (blue for herself, rose for Alex). The script opens Settings > Appearance > Eure Farben,
chooses "Rosé + Tiefes Rosé", saves and takes the Wir and shared-list screenshots, which shows that saving
recolours the app. The setting was reset to Automatic afterwards.

## Images

| File prefix | Shows |
|---|---|
| `settings-summary-<width>-<theme>` | Settings > Appearance with the "Eure Farben" summary next to the Wir design |
| `settings-sheet-<width>-<theme>` | The choice sheet: Automatic plus eight pairs, explicit save |
| `settings-sheet-large-text-390-light` | The sheet with the root text size at 200 % (approximation of large text) |
| `wir-automatic-<width>-<theme>` | Wir stage with the default pair |
| `wir-rose-deeprose-<width>-<theme>` | Wir stage after choosing rose and deep rose |
| `list-rose-deeprose-<width>-<theme>` | A shared shopping list after the choice |
| `pixel-settings-appearance`, `pixel-choice-sheet`, `pixel-wir-automatic`, `pixel-wir-rose-deeprose` | The same flow on the real phone |

## Observations

- Both partners stay distinguishable by lightness in every theme; names and initials sit next to every colour.
- The deep shades were strengthened after Product Owner feedback: the accent distance inside a same-family pair is
  about 19 to 25 in OKLab distance (x100). Values are in `docs/product/design/person-colour-pairs.md`.
- The Pro marks next to the pair rows are hidden in the demo presentation, as for the Wir design.
- Avatar placeholders (initials on the neutral avatar disc) are intentionally unchanged.
- Not covered: reduced-motion capture, a screen reader pass and the paywall path on a device.

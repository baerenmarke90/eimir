# Person colour pairs (Product Owner decision 2026-11-16)

Supersedes the creator-based A/B rule of #1808 and the provisional author rule of the diary branch.

## Decision

- Every person may choose **one fixed colour pair for their own view**: their own colour first, then the colour of their partner. The partner chooses their own pair. The choice is personal, **never shared** and **carries no statement about gender**; no gender is asked or stored.
- The pairs are offered as a closed list, so two people can never end up with the same colour: rose + blue, blue + rose, rose + deep rose, deep rose + rose, blue + deep blue, deep blue + blue, moss green + rose, moss green + blue.
- Without a choice (**automatic**) a person sees themself blue and their partner rose, which is also how the Wir stage coloured people before.
- The colour applies everywhere a person is coloured: shared-list markers, summary bars and flights, the Wir stage rings and heart line, daily insights, avatar-adjacent markers. A person is identified by role (you / your partner), not by account, so the same item may look different on the two phones.
- Colour never carries the meaning alone: every marker sits next to the name or initials, and every pair row in the profile names both colours in words.

## Implementation map

| Concern | Where |
|---|---|
| Colour values (Light and Dark), default pair | `design/tokens.json` `identity.personColors`, generated into `web/src/design/person-colors.css` by `npm run tokens:generate` (never edited by hand) |
| Variables | `--color-person-<tone>` and `-surface`; role aliases `--person-own-*` / `--person-partner-*`; classes `.person-role-own` / `.person-role-partner` set `--person-accent` / `--person-surface` |
| Roles, pairs, resolver | `web/src/client/personColours.ts` |
| Provider, read and save, root variables | `web/src/client/personColoursContext.tsx`, remembered locally by `personColoursStore.ts` (cleared on sign-out) |
| Profile question | `web/src/components/PersonColourChoice.tsx` inside the `ProfileIdentityPanel` edit form, saved with the same button |
| API | `GET` / `PATCH /api/v1/spaces/{spaceId}/appearance/person-colours` (own value only, `If-Match`), column `app_icon_preferences.person_colours`, migration `0142` |
| Export / deletion | personal export `personalAppearance.personColours` (only when chosen); the row is removed with the account |
| Contrast | `web/src/personColorContrast.test.ts` re-checks the token values |

## Palette and contrast

Rose and blue are the existing identity colours; deep variants and moss green are new. Initials are rendered in `--color-text` on the surface colour.

| Tone | Light accent / surface | Dark accent / surface |
|---|---|---|
| rose | `#AA4C86` / `#F9EAF4` | `#F1B3D7` / `#46394F` |
| deep rose | `#6B1A4B` / `#E9A9CC` | `#D14F97` / `#A8457A` |
| blue | `#5685D1` / `#D6E1F7` | `#AED1FA` / `#303F62` |
| deep blue | `#1B3C80` / `#92AEE6` | `#4F8DEB` / `#2C5AA8` |
| moss | `#6F7D1F` / `#EEF1D2` | `#C5D36A` / `#414726` |

All initials contrast at least 4.5:1 and all accents at least 3:1 on the surface and page of both themes. Pairs of the same family differ by at least 18 in OKLab distance (x100), also under simulated protan, deutan and tritan vision. The weakest value is rose against blue in Dark for deutan vision (about 5), which the names and initials cover. Moss green was chosen after teal, slate, amber and gold collided with rose or blue under colour-vision simulation.

## Business and freemium model

No impact. It extends the personal appearance settings next to the app icon and Wir design. It is **Free for every Account** (no capability, no entitlement check), identical in Self-Hosted and Cloud, uses no managed resource, and survives downgrade. Premium Bespoke Themes must not override person colours: they identify people and are not decoration.

## Privacy

Optional, personal, never visible to the partner, no gender statement, part of the personal export, removed on account deletion, never used for analytics. See `docs/PRIVACY-MODEL.md` and the privacy policy data list (the policy text still needs legal review before publication).
